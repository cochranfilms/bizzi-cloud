/**
 * Uppy S3 API — Create backup_files record after presigned PUT upload (files ≤5MB).
 * For small files, Uppy uses presigned PUT directly to B2; no multipart complete is called.
 * The client calls this after a successful presigned upload so the file appears in Storage/Recent Uploads.
 * (Deletion roadmap Phase 7: optional move toward stricter server-owned row creation / idempotency — not required here yet.)
 */
import { getObjectMetadata, isB2Configured } from "@/lib/b2";
import { verifyIdToken } from "@/lib/firebase-admin";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { logActivityEvent } from "@/lib/activity-log";
import { visibilityScopeFromWorkspaceType } from "@/lib/workspace-visibility";
import { userCanWriteWorkspace } from "@/lib/workspace-access";
import { resolveBackupUploadMetadata } from "@/lib/backup-file-upload-metadata";
import { BACKUP_LIFECYCLE_ACTIVE } from "@/lib/backup-file-lifecycle";
import { macosPackageFirestoreFieldsFromRelativePath } from "@/lib/backup-file-macos-package-metadata";
import { creativeFirestoreFieldsFromRelativePath } from "@/lib/creative-file-registry";
import { linkBackupFileToMacosPackageContainer } from "@/lib/macos-package-container-admin";
import {
  commitReservation,
  getReservationDoc,
  releaseReservation,
} from "@/lib/storage-quota-reservations";
import { assertCreatorRawFinalizeOrAudit } from "@/lib/upload-finalize-guards";
import { buildBackupObjectKey, sanitizeBackupRelativePath } from "@/lib/backup-object-key";
import { enqueueCreatorRawVideoProxyJob } from "@/lib/creator-raw-video-proxy-ingest";
import {
  linkedDriveIsFolderModelV2,
  resolveV2PlacementForNewUpload,
  StorageFolderAccessError,
} from "@/lib/storage-folders";
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
    reservation_id?: string | null;
    reservationId?: string | null;
    uploadIntent?: string | null;
    lockedDestination?: boolean | string | null;
    destinationMode?: string | null;
    routeContext?: string | null;
    sourceSurface?: string | null;
    targetDriveName?: string | null;
    resolvedBy?: string | null;
    folder_id?: string | null;
    folderId?: string | null;
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
    reservation_id: reservationIdSnake = null,
    reservationId: reservationIdCamel = null,
  } = body;

  const reservation_id =
    (typeof reservationIdSnake === "string" && reservationIdSnake.length > 0
      ? reservationIdSnake
      : null) ??
    (typeof reservationIdCamel === "string" && reservationIdCamel.length > 0
      ? reservationIdCamel
      : null);

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

  const safePath = sanitizeBackupRelativePath(relativePath);
  const objectKey = buildBackupObjectKey({
    pathSubjectUid: uid,
    driveId: String(driveId),
    relativePath: safePath,
  });

  const meta = await getObjectMetadata(objectKey);
  if (!meta) {
    if (reservation_id) {
      await releaseReservation(reservation_id, "finalize_failed").catch(() => {});
    }
    return NextResponse.json(
      { error: "Object not found in storage after upload" },
      { status: 404 }
    );
  }
  if (meta.contentLength !== sizeBytes) {
    if (reservation_id) {
      await releaseReservation(reservation_id, "size_mismatch").catch(() => {});
    }
    console.warn("[presigned-complete] size mismatch orphan", {
      objectKey,
      expected: sizeBytes,
      actual: meta.contentLength,
      reservation_id,
    });
    return NextResponse.json(
      {
        error:
          "Uploaded file size does not match declared size. Object may require cleanup in object storage.",
      },
      { status: 400 }
    );
  }

  if (reservation_id) {
    const row = await getReservationDoc(reservation_id);
    if (!row) {
      return NextResponse.json({ error: "Invalid reservation" }, { status: 400 });
    }
    const d = row.data;
    if (d.status !== "pending") {
      return NextResponse.json({ error: "Reservation is no longer active" }, { status: 400 });
    }
    if (d.requesting_user_id !== uid) {
      await releaseReservation(reservation_id, "finalize_failed").catch(() => {});
      return NextResponse.json({ error: "Reservation mismatch" }, { status: 403 });
    }
    const reservedBytes = typeof d.bytes === "number" ? d.bytes : -1;
    if (reservedBytes !== sizeBytes) {
      await releaseReservation(reservation_id, "size_mismatch").catch(() => {});
      return NextResponse.json({ error: "Reservation size mismatch" }, { status: 400 });
    }
  }
  const modifiedAt =
    lastModified != null && !Number.isNaN(lastModified)
      ? new Date(lastModified).toISOString()
      : new Date().toISOString();

  const db = getAdminFirestore();
  const releaseIfPending = async (reason: Parameters<typeof releaseReservation>[1]) => {
    if (reservation_id) await releaseReservation(reservation_id, reason).catch(() => {});
  };

  const driveSnap = await db.collection("linked_drives").doc(driveId).get();
  const driveData = driveSnap.data();
  if (!driveSnap.exists) {
    await releaseIfPending("finalize_failed");
    return NextResponse.json({ error: "Drive not found" }, { status: 404 });
  }

  const guard = await assertCreatorRawFinalizeOrAudit({
    uid,
    driveId,
    driveSnap,
    uploadIntent: body.uploadIntent,
    lockedDestination: body.lockedDestination,
    destinationMode: body.destinationMode,
    routeContext: body.routeContext,
    sourceSurface: body.sourceSurface,
    objectKey,
    relativePath: safePath,
    organizationId: null,
    workspaceId: workspaceIdFromBody ?? null,
    contentType,
    skipMediaProbe: false,
  });
  if (!guard.ok) {
    await releaseIfPending("finalize_failed");
    return NextResponse.json({ error: guard.message }, { status: guard.status });
  }

  let v2Placement: Awaited<ReturnType<typeof resolveV2PlacementForNewUpload>> | null =
    null;
  if (linkedDriveIsFolderModelV2(driveData)) {
    const folderIdRaw = body.folderId ?? body.folder_id ?? null;
    const parentFolderId =
      folderIdRaw === null || folderIdRaw === undefined || folderIdRaw === ""
        ? null
        : String(folderIdRaw);
    try {
      v2Placement = await resolveV2PlacementForNewUpload(
        db,
        String(driveId),
        driveData!,
        parentFolderId,
        safePath
      );
    } catch (err) {
      await releaseIfPending("finalize_failed");
      if (err instanceof StorageFolderAccessError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
  }

  const profileSnap = await db.collection("profiles").doc(uid).get();
  const profileData = profileSnap.data();

  let organizationId: string | null = null;
  let workspaceIdResolved: string | null = null;
  let visibilityScope: "personal" | "private_org" | "org_shared" | "team" | "project" | "gallery" = "personal";

  if (workspaceIdFromBody) {
    const wsSnap = await db.collection("workspaces").doc(workspaceIdFromBody).get();
    if (!wsSnap.exists) {
      await releaseIfPending("finalize_failed");
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }
    const wsData = wsSnap.data();
    organizationId = (wsData?.organization_id as string) ?? null;
    if (!organizationId) {
      await releaseIfPending("finalize_failed");
      return NextResponse.json({ error: "Invalid workspace" }, { status: 400 });
    }
    const canWrite = await userCanWriteWorkspace(uid, workspaceIdFromBody);
    if (!canWrite) {
      await releaseIfPending("finalize_failed");
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

  try {
    const snapshotRef = await db.collection("backup_snapshots").add({
    linked_drive_id: driveId,
    userId: uid,
    status: "completed",
    files_count: 1,
    bytes_synced: sizeBytes,
    completed_at: new Date(),
    });

    const relForMeta = v2Placement?.relative_path ?? safePath;
    const fileRef = await db.collection("backup_files").add({
    backup_snapshot_id: snapshotRef.id,
    linked_drive_id: driveId,
    userId: uid,
    relative_path: relForMeta,
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
    ...(v2Placement
      ? {
          folder_id: v2Placement.folder_id,
          file_name: v2Placement.file_name,
          file_name_compare_key: v2Placement.file_name_compare_key,
          folder_path_ids: v2Placement.folder_path_ids,
        }
      : {}),
    ...macosPackageFirestoreFieldsFromRelativePath(relForMeta),
    ...creativeFirestoreFieldsFromRelativePath(relForMeta),
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
    await enqueueCreatorRawVideoProxyJob({
      driveIsCreatorRaw: driveData?.is_creator_raw === true,
      objectKey,
      backupFileId: fileRef.id,
      userId: uid,
      relativePath: relForMeta,
      source: "ingest_presigned_complete",
    });

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

    if (reservation_id) {
      await commitReservation(reservation_id);
    }

    return NextResponse.json({ ok: true, objectKey });
  } catch (finalizeErr) {
    await releaseIfPending("finalize_failed");
    throw finalizeErr;
  }
}
