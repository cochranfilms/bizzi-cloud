/**
 * Uppy S3 Multipart API — Complete multipart upload.
 * POST /api/uppy/s3/multipart/[uploadId]/complete?key=...
 * Body: { parts: [{ PartNumber, ETag }] }
 * Also creates backup_files and triggers metadata extraction (Mux via extract-metadata for videos).
 */
import { completeMultipartUpload, getObjectMetadata, isB2Configured } from "@/lib/b2";
import { verifyIdToken } from "@/lib/firebase-admin";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { visibilityScopeFromWorkspaceType } from "@/lib/workspace-visibility";
import { userCanWriteWorkspace } from "@/lib/workspace-access";
import { NextResponse } from "next/server";
import { logActivityEvent } from "@/lib/activity-log";
import { resolveBackupUploadMetadata } from "@/lib/backup-file-upload-metadata";
import { BACKUP_LIFECYCLE_ACTIVE } from "@/lib/backup-file-lifecycle";
import { macosPackageFirestoreFieldsFromRelativePath } from "@/lib/backup-file-macos-package-metadata";
import { creativeFirestoreFieldsFromRelativePath } from "@/lib/creative-file-registry";
import { linkBackupFileToMacosPackageContainer } from "@/lib/macos-package-container-admin";
import {
  commitReservation,
  releaseReservation,
} from "@/lib/storage-quota-reservations";
import { assertCreatorRawFinalizeOrAudit } from "@/lib/upload-finalize-guards";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  if (!isB2Configured()) {
    return NextResponse.json(
      { error: "Backblaze B2 is not configured" },
      { status: 503 }
    );
  }

  const { uploadId } = await params;
  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  if (!uploadId || !key) {
    return NextResponse.json(
      { error: "uploadId and key (query) required" },
      { status: 400 }
    );
  }

  let body: { parts?: Array<{ PartNumber: number; ETag: string }> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const partsInput = body.parts;
  if (!Array.isArray(partsInput) || partsInput.length === 0) {
    return NextResponse.json({ error: "parts array required" }, { status: 400 });
  }

  const validatedParts: { partNumber: number; etag: string }[] = [];
  for (const p of partsInput) {
    const num = p.PartNumber ?? (p as { partNumber?: number }).partNumber;
    const etag = (p.ETag ?? (p as { etag?: string }).etag ?? "").replace(/^"|"$/g, "");
    if (typeof num === "number" && etag) {
      validatedParts.push({ partNumber: num, etag });
    }
  }
  if (validatedParts.length === 0) {
    return NextResponse.json({ error: "No valid parts" }, { status: 400 });
  }

  let uid: string;
  let authEmail: string | undefined;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (isDevAuthBypass()) {
    const db = getAdminFirestore();
    const snap = await db
      .collection("upload_sessions")
      .where("uploadId", "==", uploadId)
      .limit(1)
      .get();
    if (snap.empty) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    uid = snap.docs[0].data().userId;
  } else if (!token) {
    return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });
  } else {
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
      authEmail = decoded.email;
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
  }

  const objectKey = decodeURIComponent(key);

  const db = getAdminFirestore();
  const snap = await db
    .collection("upload_sessions")
    .where("uploadId", "==", uploadId)
    .where("userId", "==", uid)
    .limit(1)
    .get();

  if (snap.empty) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const sessionDoc = snap.docs[0];
  const sessionRef = sessionDoc.ref;
  const data = sessionDoc.data();
  const sessionKey = data.objectKey;

  if (sessionKey !== objectKey) {
    return NextResponse.json({ error: "Key mismatch" }, { status: 403 });
  }

  const driveId = data.driveId;
  const keyPrefix = `backups/${uid}/${driveId}/`;
  const relativePathFromObjectKey = objectKey.startsWith(keyPrefix) ? objectKey.slice(keyPrefix.length) : "";
  const storedRel =
    typeof data.relative_path === "string" && data.relative_path.trim()
      ? String(data.relative_path).trim().replace(/^\/+/, "").replace(/\.\./g, "")
      : "";
  const legacyLeaf = String(data.fileName ?? "")
    .replace(/^\/+/, "")
    .replace(/\.\./g, "");
  const relativePath =
    relativePathFromObjectKey ||
    storedRel ||
    legacyLeaf;
  const fileSize = data.fileSize ?? 0;
  const contentType = data.contentType ?? "application/octet-stream";
  const reservationRaw = data.storage_quota_reservation_id;
  const reservationId =
    typeof reservationRaw === "string" && reservationRaw.length > 0 ? reservationRaw : null;

  const sessionUploadIntent =
    (data.upload_intent as string | undefined) ??
    (data.uploadIntent as string | undefined) ??
    null;
  const sessionLocked =
    data.locked_destination === true ||
    data.lockedDestination === true ||
    data.locked_destination === "true";
  const sessionDestinationMode =
    (data.destination_mode as string | undefined) ??
    (data.destinationMode as string | undefined) ??
    null;
  const sessionRouteContext =
    (data.route_context as string | undefined) ??
    (data.routeContext as string | undefined) ??
    null;
  const sessionSourceSurface =
    (data.source_surface as string | undefined) ??
    (data.sourceSurface as string | undefined) ??
    null;

  const driveSnapPreComplete = await db.collection("linked_drives").doc(driveId).get();
  const preGuard = await assertCreatorRawFinalizeOrAudit({
    uid,
    driveId,
    driveSnap: driveSnapPreComplete,
    uploadIntent: sessionUploadIntent,
    lockedDestination: sessionLocked,
    destinationMode: sessionDestinationMode,
    routeContext: sessionRouteContext,
    sourceSurface: sessionSourceSurface,
    objectKey,
    relativePath,
    organizationId: null,
    workspaceId: null,
  });
  if (!preGuard.ok) {
    return NextResponse.json({ error: preGuard.message }, { status: preGuard.status });
  }

  try {
    await completeMultipartUpload(objectKey, uploadId, validatedParts);
  } catch (completeErr) {
    if (reservationId) {
      await releaseReservation(reservationId, "finalize_failed").catch(() => {});
    }
    throw completeErr;
  }

  const meta = await getObjectMetadata(objectKey);
  const actual = meta?.contentLength ?? -1;
  if (actual !== fileSize) {
    if (reservationId) {
      await releaseReservation(reservationId, "size_mismatch").catch(() => {});
    }
    console.warn("[uppy multipart complete] size mismatch", {
      objectKey,
      reservationId,
      expected: fileSize,
      actual,
    });
    return NextResponse.json(
      { error: "Uploaded size does not match expected size." },
      { status: 400 }
    );
  }

  if (reservationId) {
    await commitReservation(reservationId);
  }

  await sessionRef.update({
    status: "completed",
    completedPartNumbers: validatedParts.map((p) => p.partNumber).sort((a, b) => a - b),
    partEtags: Object.fromEntries(validatedParts.map((p) => [p.partNumber, p.etag])),
    bytesTransferred: fileSize,
    updatedAt: new Date().toISOString(),
  });

  const workspaceIdFromSession = data.workspace_id ?? data.workspaceId ?? null;
  let organizationId: string | null = null;
  let workspaceIdResolved: string | null = null;
  let visibilityScope: "personal" | "private_org" | "org_shared" | "team" | "project" | "gallery" = "personal";

  if (workspaceIdFromSession) {
    const wsSnap = await db.collection("workspaces").doc(workspaceIdFromSession).get();
    if (!wsSnap.exists) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }
    const wsData = wsSnap.data();
    organizationId = (wsData?.organization_id as string) ?? null;
    if (!organizationId) {
      return NextResponse.json({ error: "Invalid workspace" }, { status: 400 });
    }
    const canWrite = await userCanWriteWorkspace(uid, workspaceIdFromSession);
    if (!canWrite) {
      return NextResponse.json({ error: "No write access to workspace" }, { status: 403 });
    }
    workspaceIdResolved = workspaceIdFromSession;
    visibilityScope = visibilityScopeFromWorkspaceType((wsData?.workspace_type as string) ?? "private");
  }

  const driveSnap = driveSnapPreComplete;
  const driveData = driveSnap.data();

  const profileSnap = await db.collection("profiles").doc(uid).get();
  const uploadMeta = await resolveBackupUploadMetadata(db, {
    uid,
    authEmail,
    profileData: profileSnap.data(),
    driveData,
    organizationId,
  });

  const snapshotRef = await db.collection("backup_snapshots").add({
    linked_drive_id: driveId,
    userId: uid,
    status: "completed",
    files_count: 1,
    bytes_synced: fileSize,
    completed_at: new Date(),
  });

  const lastModified = data.lastModified != null ? new Date(data.lastModified).toISOString() : new Date().toISOString();
  const fileRef = await db.collection("backup_files").add({
    backup_snapshot_id: snapshotRef.id,
    linked_drive_id: driveId,
    userId: uid,
    relative_path: relativePath,
    object_key: objectKey,
    size_bytes: fileSize,
    content_type: contentType,
    modified_at: lastModified,
    uploaded_at: new Date().toISOString(),
    deleted_at: null,
    lifecycle_state: BACKUP_LIFECYCLE_ACTIVE,
    organization_id: organizationId,
    workspace_id: workspaceIdResolved,
    visibility_scope: visibilityScope,
    owner_user_id: uid,
    uploader_email: uploadMeta.uploaderEmail,
    container_type: uploadMeta.containerType,
    container_id: uploadMeta.containerId,
    personal_team_owner_id: uploadMeta.personalTeamOwnerId,
    role_at_upload: uploadMeta.roleAtUpload,
    ...macosPackageFirestoreFieldsFromRelativePath(relativePath),
    ...creativeFirestoreFieldsFromRelativePath(relativePath),
  });

  try {
    await linkBackupFileToMacosPackageContainer(db, fileRef.id);
  } catch (err) {
    console.error("[uppy complete] macos package link failed:", err);
  }

  await db.doc(`linked_drives/${driveId}`).update({
    last_synced_at: new Date().toISOString(),
  });

  const baseUrl = new URL(request.url).origin;
  if (token) {
    fetch(`${baseUrl}/api/files/extract-metadata`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        backup_file_id: fileRef.id,
        object_key: objectKey,
      }),
    }).catch(() => {});
  }

  // Mux: single path via extract-metadata → /api/mux/create-asset (avoid duplicate Mux assets)

  // If this was a gallery upload, add the new file to gallery assets
  const galleryId = data.galleryId ?? null;
  if (galleryId && token) {
    try {
      const assetsRes = await fetch(`${baseUrl}/api/galleries/${galleryId}/assets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          backup_file_ids: [fileRef.id],
          asset_origin: "gallery_storage",
        }),
      });
      if (!assetsRes.ok) {
        console.error("[uppy complete] Failed to add to gallery:", await assetsRes.text());
      }
    } catch (err) {
      console.error("[uppy complete] Gallery assets add failed:", err);
    }
  }

  logActivityEvent({
    event_type: "file_uploaded",
    actor_user_id: uid,
    scope_type: organizationId ? "organization" : "personal_account",
    organization_id: organizationId,
    workspace_id: workspaceIdResolved,
    visibility_scope: visibilityScope,
    linked_drive_id: driveId,
    file_id: fileRef.id,
    target_type: "file",
    target_name: relativePath.split("/").pop() ?? relativePath,
    file_path: relativePath,
    metadata: {
      file_size: fileSize,
      mime_type: contentType,
      upload_source: galleryId ? "gallery" : "web",
      upload_session_id: uploadId,
    },
  }).catch(() => {});

  return NextResponse.json({
    location: objectKey,
    key: objectKey,
  });
}
