/**
 * When gallery assets are added via "Add From Files" (linked origin), create lightweight
 * `backup_files` rows under folder model v2 on Gallery Media. Rows reuse the same `object_key`
 * as the source file (no B2 copy). Relative folder names from the source `relative_path` are
 * preserved under the gallery segment (e.g. segment/Interviews/Cam A/file.mov) so structure,
 * duplicate-safe paths, and drive browsing match user expectations.
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

const MAX_LINKED_PATH_DEPTH = 64;

/**
 * Directory segments under the source file's `relative_path` (excludes the path leaf filename).
 * Preserves client folder layout for linked Gallery Media rows without copying bytes.
 */
function safeDirPartsFromSourceRelativePath(relativePath: string): string[] {
  const parts = String(relativePath ?? "")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean);
  if (parts.length <= 1) return [];
  const dirs = parts.slice(0, -1);
  const out: string[] = [];
  for (const d of dirs) {
    const t = trimDisplayName(d);
    if (!t || t === "." || t === "..") continue;
    out.push(t);
    if (out.length >= MAX_LINKED_PATH_DEPTH) break;
  }
  return out;
}

/**
 * Ensures each name in `relativeFolderNames` exists as a nested folder under `startParentFolderId`.
 * Returns the leaf folder id (or start parent when names is empty).
 */
async function ensureFolderChainUnderParent(
  db: Firestore,
  actingUid: string,
  linkedDriveId: string,
  startParentFolderId: string,
  relativeFolderNames: string[]
): Promise<string> {
  let parentId = startParentFolderId;
  for (const raw of relativeFolderNames) {
    const display = trimDisplayName(raw);
    if (!display) continue;
    const wantKey = toNormalizedComparisonKey(display);
    if (!wantKey) continue;
    const { folders } = await listStorageFolderChildren(db, linkedDriveId, parentId);
    const found = folders.find(
      (f) =>
        toNormalizedComparisonKey(trimDisplayName(String((f as { name?: string }).name ?? ""))) === wantKey
    );
    const fid = (found as { id?: string } | undefined)?.id;
    if (fid) {
      parentId = fid;
      continue;
    }
    const { id } = await createStorageFolder(db, actingUid, {
      linked_drive_id: linkedDriveId,
      parent_folder_id: parentId,
      name: display,
    });
    parentId = id;
  }
  return parentId;
}

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

  const segmentFolderId = await ensureRootChildFolderForSegment(
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

    const dirParts = safeDirPartsFromSourceRelativePath(path);
    const leafFolderId = await ensureFolderChainUnderParent(
      db,
      actingUid,
      writeCtx.linkedDriveId,
      segmentFolderId,
      dirParts
    );
    const relPath = buildRelativePathFromFolderNames([segment, ...dirParts], fileName);

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
      folder_id: leafFolderId,
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
