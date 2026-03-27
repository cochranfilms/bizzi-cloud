/**
 * Uppy S3 API — Create backup_files record after presigned PUT upload (files ≤5MB).
 * For small files, Uppy uses presigned PUT directly to B2; no multipart complete is called.
 * The client calls this after a successful presigned upload so the file appears in Storage/Recent Uploads.
 * (Deletion roadmap Phase 7: optional move toward stricter server-owned row creation / idempotency — not required here yet.)
 */
import { isB2Configured } from "@/lib/b2";
import { verifyIdToken } from "@/lib/firebase-admin";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { isVideoFile } from "@/lib/bizzi-file-types";
import { logActivityEvent } from "@/lib/activity-log";
import { visibilityScopeFromWorkspaceType } from "@/lib/workspace-visibility";
import { userCanWriteWorkspace } from "@/lib/workspace-access";
import { resolveBackupUploadMetadata } from "@/lib/backup-file-upload-metadata";
import { BACKUP_LIFECYCLE_ACTIVE } from "@/lib/backup-file-lifecycle";
import { macosPackageFirestoreFieldsFromRelativePath } from "@/lib/backup-file-macos-package-metadata";
import { creativeFirestoreFieldsFromRelativePath } from "@/lib/creative-file-registry";
import { linkBackupFileToMacosPackageContainer } from "@/lib/macos-package-container-admin";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (!isB2Configured()) {
    return NextResponse.json(
      { error: "Backblaze B2 is not configured" },
      { status: 503 }
    );
  }

  let body: {
    driveId: string;
    relativePath: string;
    sizeBytes: number;
    contentType?: string;
    lastModified?: number | null;
    /** Workspace doc ID for org uploads (required for org; client resolves before upload) */
    workspace_id?: string | null;
    workspaceId?: string | null;
    galleryId?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    driveId,
    relativePath,
    sizeBytes,
    contentType = "application/octet-stream",
    lastModified,
    workspace_id: workspaceIdParam = null,
    workspaceId: workspaceIdLegacy = null,
    galleryId = null,
  } = body;

  const workspaceIdFromBody = workspaceIdParam ?? workspaceIdLegacy;

  if (
    !driveId ||
    !relativePath ||
    typeof sizeBytes !== "number" ||
    !Number.isFinite(sizeBytes) ||
    sizeBytes < 0
  ) {
    return NextResponse.json(
      {
        error:
          "driveId, relativePath, and sizeBytes are required (0 allowed for empty files)",
      },
      { status: 400 }
    );
  }

  let uid: string;
  let authEmail: string | undefined;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!token) {
    return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });
  }
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
    authEmail = decoded.email;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  // Skip checkUserCanUpload — file is already in B2; rejecting would orphan it
  const safePath = relativePath.replace(/^\/+/, "").replace(/\.\./g, "");
  const objectKey = `backups/${uid}/${driveId}/${safePath}`;
  const modifiedAt =
    lastModified != null && !Number.isNaN(lastModified)
      ? new Date(lastModified).toISOString()
      : new Date().toISOString();

  const db = getAdminFirestore();
  const driveSnap = await db.collection("linked_drives").doc(driveId).get();
  const driveData = driveSnap.data();
  if (!driveSnap.exists) {
    return NextResponse.json({ error: "Drive not found" }, { status: 404 });
  }
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const profileData = profileSnap.data();

  let organizationId: string | null = null;
  let workspaceIdResolved: string | null = null;
  let visibilityScope: "personal" | "private_org" | "org_shared" | "team" | "project" | "gallery" = "personal";

  if (workspaceIdFromBody) {
    const wsSnap = await db.collection("workspaces").doc(workspaceIdFromBody).get();
    if (!wsSnap.exists) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }
    const wsData = wsSnap.data();
    organizationId = (wsData?.organization_id as string) ?? null;
    if (!organizationId) {
      return NextResponse.json({ error: "Invalid workspace" }, { status: 400 });
    }
    const canWrite = await userCanWriteWorkspace(uid, workspaceIdFromBody);
    if (!canWrite) {
      return NextResponse.json({ error: "No write access to workspace" }, { status: 403 });
    }
    workspaceIdResolved = workspaceIdFromBody;
    visibilityScope = visibilityScopeFromWorkspaceType((wsData?.workspace_type as string) ?? "private");
  }

  const {
    uploaderEmail,
    containerType,
    containerId,
    personalTeamOwnerId,
    roleAtUpload,
  } = await resolveBackupUploadMetadata(db, {
    uid,
    authEmail,
    profileData,
    driveData,
    organizationId,
  });

  const snapshotRef = await db.collection("backup_snapshots").add({
    linked_drive_id: driveId,
    userId: uid,
    status: "completed",
    files_count: 1,
    bytes_synced: sizeBytes,
    completed_at: new Date(),
  });

  const fileRef = await db.collection("backup_files").add({
    backup_snapshot_id: snapshotRef.id,
    linked_drive_id: driveId,
    userId: uid,
    relative_path: safePath,
    object_key: objectKey,
    size_bytes: sizeBytes,
    content_type: contentType,
    modified_at: modifiedAt,
    uploaded_at: new Date().toISOString(),
    deleted_at: null,
    lifecycle_state: BACKUP_LIFECYCLE_ACTIVE,
    organization_id: organizationId,
    gallery_id: galleryId ?? null,
    workspace_id: workspaceIdResolved,
    visibility_scope: visibilityScope,
    owner_user_id: uid,
    uploader_email: uploaderEmail,
    container_type: containerType,
    container_id: containerId,
    personal_team_owner_id: personalTeamOwnerId,
    role_at_upload: roleAtUpload,
    ...macosPackageFirestoreFieldsFromRelativePath(safePath),
    ...creativeFirestoreFieldsFromRelativePath(safePath),
  });

  try {
    await linkBackupFileToMacosPackageContainer(db, fileRef.id);
  } catch (err) {
    console.error("[presigned-complete] macos package link failed:", err);
  }

  await db.doc(`linked_drives/${driveId}`).update({
    last_synced_at: new Date().toISOString(),
  });

  const baseUrl = new URL(request.url).origin;
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

  if (isVideoFile(safePath)) {
    const { createMuxAssetFromBackup } = await import("@/lib/mux");
    createMuxAssetFromBackup(objectKey, safePath, fileRef.id).catch((err) => {
      console.error("[presigned-complete] Mux create failed:", err);
    });
  }

  if (galleryId) {
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
        console.error("[presigned-complete] Failed to add to gallery:", await assetsRes.text());
      }
    } catch (err) {
      console.error("[presigned-complete] Gallery assets add failed:", err);
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
    target_name: safePath.split("/").pop() ?? safePath,
    file_path: safePath,
    metadata: {
      file_size: sizeBytes,
      mime_type: contentType,
      upload_source: galleryId ? "gallery" : "web",
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, objectKey });
}
