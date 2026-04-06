/**
 * When gallery assets are added via "Add From Files" (linked origin), create lightweight
 * `backup_files` rows under Gallery Media folder model v2 so the gallery-named folder
 * appears in the drive tree. Rows reuse the same `object_key` as the source file (no B2 copy).
 */
import type { Firestore } from "firebase-admin/firestore";
import { BACKUP_LIFECYCLE_ACTIVE } from "@/lib/backup-file-lifecycle";
import {
  assertLinkedDriveWriteAccess,
  createStorageFolder,
  FOLDER_MODEL_V2,
  listStorageFolderChildren,
} from "@/lib/storage-folders";
import { trimDisplayName, toNormalizedComparisonKey } from "@/lib/storage-folders/normalize";
import { buildRelativePathFromFolderNames } from "@/lib/storage-folders/path-resolver";
import { resolveGalleryFavoritesWriteContext } from "@/lib/gallery-favorites-write-context";
import type { GalleryManagementDoc } from "@/lib/gallery-owner-access";
import { resolveMediaFolderSegmentForPath } from "@/lib/gallery-media-path";

async function ensureRootChildFolderForSegment(
  db: Firestore,
  uid: string,
  driveId: string,
  segment: string
): Promise<string> {
  const display = trimDisplayName(segment);
  const key = toNormalizedComparisonKey(display);
  if (!key) throw new Error("Invalid gallery media folder segment");

  const { folders } = await listStorageFolderChildren(db, driveId, null);
  const found = folders.find(
    (f) => toNormalizedComparisonKey(trimDisplayName(String(f.name ?? ""))) === key
  );
  const fid = found?.id as string | undefined;
  if (fid) return fid;

  const { id } = await createStorageFolder(db, uid, {
    linked_drive_id: driveId,
    parent_folder_id: null,
    name: display,
  });
  return id;
}

/**
 * Legacy Gallery Media drives may omit `folder_model_version`; folder APIs require v2.
 * Upgrade in place when the acting user can write the drive (same as creating a subfolder).
 */
export async function ensureGalleryMediaDriveFolderModelV2(
  db: Firestore,
  actingUid: string,
  linkedDriveId: string
): Promise<boolean> {
  const ref = db.collection("linked_drives").doc(linkedDriveId);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error("[placeLinkedGalleryAssetsInGalleryMediaFolder] linked drive missing", {
      linkedDriveId,
    });
    return false;
  }
  const v = snap.data()?.folder_model_version;
  if (v === FOLDER_MODEL_V2) return true;
  try {
    await assertLinkedDriveWriteAccess(db, actingUid, snap);
  } catch (e) {
    console.error("[placeLinkedGalleryAssetsInGalleryMediaFolder] no write access to upgrade drive", {
      linkedDriveId,
      actingUid,
      error: e,
    });
    return false;
  }
  await ref.update({
    folder_model_version: FOLDER_MODEL_V2,
    supports_nested_folders: true,
  });
  return true;
}

function referenceRowAlreadyExists(
  db: Firestore,
  galleryDriveId: string,
  sourceBackupFileId: string
): Promise<boolean> {
  return db
    .collection("backup_files")
    .where("reference_source_backup_file_id", "==", sourceBackupFileId)
    .limit(15)
    .get()
    .then((snap) =>
      snap.docs.some((d) => {
        const x = d.data();
        return (
          x.linked_drive_id === galleryDriveId &&
          x.lifecycle_state === BACKUP_LIFECYCLE_ACTIVE
        );
      })
    );
}

/**
 * Idempotent: skips if Gallery Media drive is not folder v2, or reference row already exists.
 */
export async function placeLinkedGalleryAssetsInGalleryMediaFolder(
  db: Firestore,
  actingUid: string,
  galleryId: string,
  galleryRow: GalleryManagementDoc,
  linkedBackupFileIds: string[]
): Promise<void> {
  const ids = linkedBackupFileIds.filter((x) => typeof x === "string" && x.trim());
  if (ids.length === 0) return;

  const writeCtx = await resolveGalleryFavoritesWriteContext(db, actingUid, galleryId, galleryRow);
  if ("error" in writeCtx) {
    console.error("[placeLinkedGalleryAssetsInGalleryMediaFolder] resolveGalleryFavoritesWriteContext", {
      galleryId,
      error: writeCtx.error,
      status: writeCtx.status,
    });
    return;
  }

  const upgraded = await ensureGalleryMediaDriveFolderModelV2(
    db,
    actingUid,
    writeCtx.linkedDriveId
  );
  if (!upgraded) return;

  const segment = resolveMediaFolderSegmentForPath(
    galleryRow as { id?: string; title?: unknown; media_folder_segment?: unknown },
    galleryId
  );

  const parentFolderId = await ensureRootChildFolderForSegment(
    db,
    actingUid,
    writeCtx.linkedDriveId,
    segment
  );

  const nowIso = new Date().toISOString();
  const scopeFields = { ...writeCtx.scopeFields };

  for (const sourceId of ids) {
    const srcSnap = await db.collection("backup_files").doc(sourceId).get();
    if (!srcSnap.exists) continue;
    const src = srcSnap.data()!;
    if (String(src.linked_drive_id) === writeCtx.linkedDriveId) continue;

    if (await referenceRowAlreadyExists(db, writeCtx.linkedDriveId, sourceId)) continue;

    const path = String(src.relative_path ?? "");
    const fileName =
      String(src.file_name ?? "").trim() ||
      path.split("/").filter(Boolean).pop() ||
      "file";
    const objectKey = String(src.object_key ?? "").trim();
    if (!objectKey) continue;

    const relPath = buildRelativePathFromFolderNames([segment], fileName);

    const snapshotRef = await db.collection("backup_snapshots").add({
      linked_drive_id: writeCtx.linkedDriveId,
      userId: actingUid,
      status: "completed",
      files_count: 1,
      bytes_synced: Number(src.size_bytes ?? 0),
      completed_at: new Date(),
    });

    await db.collection("backup_files").add({
      ...scopeFields,
      backup_snapshot_id: snapshotRef.id,
      linked_drive_id: writeCtx.linkedDriveId,
      folder_id: parentFolderId,
      relative_path: relPath,
      gallery_id: galleryId,
      reference_source_backup_file_id: sourceId,
      object_key: objectKey,
      size_bytes: Number(src.size_bytes ?? 0),
      content_type:
        typeof src.content_type === "string" ? src.content_type : "application/octet-stream",
      modified_at: (src.modified_at as string) || nowIso,
      uploaded_at: nowIso,
      deleted_at: null,
      lifecycle_state: BACKUP_LIFECYCLE_ACTIVE,
      file_name: fileName,
      file_name_compare_key: toNormalizedComparisonKey(fileName) || null,
      /** Proxy / mux may already exist on source; copy for thumbnail pipelines */
      proxy_status: (src.proxy_status as string | null | undefined) ?? null,
    });
  }
}
