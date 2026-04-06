/**
 * Proofing materialization + merge: Gallery Media shortcuts must use folder model v2
 * (`storage_folders` + `folder_id` on `backup_files`) so inline storage lists them.
 */
import type { DocumentData, Firestore, Query } from "firebase-admin/firestore";
import { isBackupFileActiveForListing } from "@/lib/backup-file-lifecycle";
import { ensureGalleryMediaDriveFolderModelV2 } from "@/lib/gallery-link-assets-to-media-folder";
import {
  createStorageFolder,
  listStorageFolderChildren,
} from "@/lib/storage-folders";
import { trimDisplayName, toNormalizedComparisonKey } from "@/lib/storage-folders/normalize";

/**
 * Ensures drive is v2 and every segment in `materializedPathPrefix` exists as a nested
 * `storage_folders` chain. Returns the leaf folder id where shortcut files should be placed.
 *
 * @param materializedPathPrefix e.g. `wedding-day/Favorited/client-slug` (no trailing slash)
 */
export async function ensureProofingShortcutParentFolder(
  db: Firestore,
  actingUid: string,
  linkedDriveId: string,
  materializedPathPrefix: string
): Promise<{ driveData: DocumentData; leafFolderId: string }> {
  const upgraded = await ensureGalleryMediaDriveFolderModelV2(db, actingUid, linkedDriveId);
  if (!upgraded) {
    throw new Error("GALLERY_MEDIA_DRIVE_V2_REQUIRED");
  }

  const driveSnap = await db.collection("linked_drives").doc(linkedDriveId).get();
  if (!driveSnap.exists) {
    throw new Error("DRIVE_NOT_FOUND");
  }
  const driveData = driveSnap.data()!;

  const segments = materializedPathPrefix
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) {
    throw new Error("INVALID_PREFIX");
  }

  let parentId: string | null = null;
  for (const rawSeg of segments) {
    const display = trimDisplayName(rawSeg);
    const wantKey = toNormalizedComparisonKey(display);
    if (!wantKey) throw new Error("INVALID_FOLDER_SEGMENT");

    const { folders } = await listStorageFolderChildren(db, linkedDriveId, parentId);
    const found = folders.find(
      (f) =>
        toNormalizedComparisonKey(trimDisplayName(String((f as { name?: string }).name ?? ""))) ===
        wantKey
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

  return { driveData, leafFolderId: parentId! };
}

/**
 * Legacy proofing shortcuts used `relative_path` only (no `folder_id`), so the inline
 * storage UI never listed them under the gallery / Favorited folders. Re-links rows in-place.
 */
export async function repairProofingMaterializedShortcutsMissingFolderId(
  db: Firestore,
  params: {
    linkedDriveId: string;
    galleryId: string;
    organizationId: string | null;
    prefix: string;
    leafFolderId: string;
  }
): Promise<number> {
  const { linkedDriveId, galleryId, organizationId, prefix, leafFolderId } = params;
  const pfx = prefix.replace(/\/$/, "").replace(/^\/+/, "");

  let q: Query = db
    .collection("backup_files")
    .where("linked_drive_id", "==", linkedDriveId)
    .where("gallery_id", "==", galleryId);
  q =
    organizationId != null && organizationId !== ""
      ? q.where("organization_id", "==", organizationId)
      : q.where("organization_id", "==", null);

  const snap = await q.limit(1500).get();
  let fixed = 0;
  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, unknown>;
    if (!isBackupFileActiveForListing(d)) continue;
    if (d.folder_id != null && String(d.folder_id).trim() !== "") continue;

    const rp = String(d.relative_path ?? "").replace(/^\/+/, "");
    if (!rp.startsWith(pfx + "/")) continue;
    const rest = rp.slice(pfx.length + 1);
    if (!rest || rest.includes("/")) continue;

    const fk = toNormalizedComparisonKey(rest);
    if (!fk) continue;

    await doc.ref.update({
      folder_id: leafFolderId,
      file_name: rest,
      file_name_compare_key: fk,
    });
    fixed++;
  }
  return fixed;
}
