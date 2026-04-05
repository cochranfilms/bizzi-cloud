import type { DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import { logActivityEvent } from "@/lib/activity-log";
import { resolveBackupUploadMetadata } from "@/lib/backup-file-upload-metadata";
import { BACKUP_LIFECYCLE_ACTIVE } from "@/lib/backup-file-lifecycle";
import { macosPackageFirestoreFieldsFromRelativePath } from "@/lib/backup-file-macos-package-metadata";
import { creativeFirestoreFieldsFromRelativePath } from "@/lib/creative-file-registry";
import { linkBackupFileToMacosPackageContainer } from "@/lib/macos-package-container-admin";
import { commitReservation } from "@/lib/storage-quota-reservations";
import { assertCreatorRawFinalizeOrAudit } from "@/lib/upload-finalize-guards";
import { enqueueCreatorRawVideoProxyJob } from "@/lib/creator-raw-video-proxy-ingest";

export interface FinalizeMigrationBackupFileParams {
  db: Firestore;
  uid: string;
  authEmail?: string | null;
  driveId: string;
  driveSnap: DocumentSnapshot;
  objectKey: string;
  relativePath: string;
  fileSize: number;
  contentType: string;
  organizationId: string | null;
  workspaceId: string | null;
  visibilityScope: string;
  reservationId: string | null;
  /** Idempotency: `${jobId}:${fileId}:${sessionId}` from migration file row. */
  migrationFinalizeKey?: string | null;
  appOrigin?: string | null;
  idToken?: string | null;
}

/**
 * Create `backup_files` + snapshot after a server-side B2 upload (cloud migration worker).
 * Mirrors `[multipart]/complete` Storage path without upload_sessions / gallery hooks.
 */
export async function finalizeMigrationBackupFile(
  params: FinalizeMigrationBackupFileParams
): Promise<{ backup_file_id: string }> {
  const {
    db,
    uid,
    authEmail,
    driveId,
    driveSnap,
    objectKey,
    relativePath,
    fileSize,
    contentType,
    organizationId,
    workspaceId,
    visibilityScope,
    reservationId,
    migrationFinalizeKey,
    appOrigin,
    idToken,
  } = params;

  if (migrationFinalizeKey && migrationFinalizeKey.trim()) {
    const byKey = await db
      .collection("backup_files")
      .where("migration_finalize_key", "==", migrationFinalizeKey.trim())
      .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
      .limit(1)
      .get();
    if (!byKey.empty) {
      const id = byKey.docs[0]!.id;
      if (reservationId) await commitReservation(reservationId);
      return { backup_file_id: id };
    }
  }

  const byObject = await db
    .collection("backup_files")
    .where("linked_drive_id", "==", driveId)
    .where("object_key", "==", objectKey)
    .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
    .limit(1)
    .get();
  if (!byObject.empty) {
    const id = byObject.docs[0]!.id;
    if (reservationId) await commitReservation(reservationId);
    return { backup_file_id: id };
  }

  const guard = await assertCreatorRawFinalizeOrAudit({
    uid,
    driveId,
    driveSnap,
    uploadIntent: null,
    lockedDestination: false,
    destinationMode: null,
    routeContext: "migration",
    sourceSurface: "cloud_migration",
    objectKey,
    relativePath,
    organizationId,
    workspaceId,
    contentType,
    skipMediaProbe: true,
  });
  if (!guard.ok) {
    throw new Error(`finalize_guard: ${guard.message}`);
  }

  if (reservationId) {
    await commitReservation(reservationId);
  }

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

  const lastModified = new Date().toISOString();
  const finalizeKey = migrationFinalizeKey?.trim() || null;
  const fileRef = await db.collection("backup_files").add({
    backup_snapshot_id: snapshotRef.id,
    linked_drive_id: driveId,
    userId: uid,
    /** Explicit null so v2 Storage root listing (`folder_id == null`) includes cloud imports. */
    folder_id: null,
    relative_path: relativePath,
    object_key: objectKey,
    migration_finalize_key: finalizeKey,
    size_bytes: fileSize,
    content_type: contentType,
    modified_at: lastModified,
    uploaded_at: lastModified,
    deleted_at: null,
    lifecycle_state: BACKUP_LIFECYCLE_ACTIVE,
    organization_id: organizationId,
    workspace_id: workspaceId,
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

  await linkBackupFileToMacosPackageContainer(db, fileRef.id).catch((err) => {
    console.error("[migration finalize] macos package link failed:", err);
  });

  await db.doc(`linked_drives/${driveId}`).update({
    last_synced_at: lastModified,
  });

  if (appOrigin && idToken) {
    const driveIsRaw = driveData?.is_creator_raw === true;
    await enqueueCreatorRawVideoProxyJob({
      driveIsCreatorRaw: driveIsRaw,
      objectKey,
      backupFileId: fileRef.id,
      userId: uid,
      relativePath,
      source: "migration",
    });

    fetch(`${appOrigin}/api/files/extract-metadata`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        backup_file_id: fileRef.id,
        object_key: objectKey,
      }),
    }).catch(() => {});
  }

  logActivityEvent({
    event_type: "file_uploaded",
    actor_user_id: uid,
    scope_type: organizationId ? "organization" : "personal_account",
    organization_id: organizationId,
    workspace_id: workspaceId,
    visibility_scope: visibilityScope,
    linked_drive_id: driveId,
    file_id: fileRef.id,
    target_type: "file",
    target_name: relativePath.split("/").pop() ?? relativePath,
    file_path: relativePath,
    metadata: {
      file_size: fileSize,
      mime_type: contentType,
      upload_source: "cloud_migration",
    },
  }).catch(() => {});

  return { backup_file_id: fileRef.id };
}
