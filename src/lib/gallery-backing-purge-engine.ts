/**
 * Physically removes a gallery-stored backup_files row after the gallery_assets row is gone:
 * Mux, gallery-specific B2 derivatives, hearts, pins, macos aggregates — same behavior as the
 * historical inline DELETE purge path, invoked from deletion_jobs when purge_variant is gallery_rich.
 */
import type { Firestore, Query } from "firebase-admin/firestore";
import {
  deleteObjectWithRetry,
  getCoverDerivativeCacheKey,
  getLutBakedObjectKey,
  getProxyObjectKey,
  getVideoThumbnailCacheKey,
  isB2Configured,
} from "@/lib/b2";
import { COVER_DERIVATIVE_WIDTHS } from "@/lib/cover-constants";
import { deleteMuxAsset } from "@/lib/mux";
import { logActivityEvent } from "@/lib/activity-log";
import { applyMacosPackageStatsForActiveBackupFileRemoval } from "@/lib/macos-package-container-admin";

const CHUNK = 400;

async function deleteByQuery(db: Firestore, q: Query): Promise<void> {
  for (;;) {
    const snap = await q.limit(CHUNK).get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const d of snap.docs) {
      batch.delete(d.ref);
    }
    await batch.commit();
  }
}

export type GalleryPurgeContext = {
  gallery_id: string;
  asset_id: string;
  owner_uid: string;
};

export async function purgeGalleryStoredBackupFileAdmin(
  db: Firestore,
  backupFileId: string,
  ctx: GalleryPurgeContext
): Promise<void> {
  const { gallery_id: galleryId, asset_id: assetId, owner_uid: ownerUid } = ctx;

  const galleryRef = db.collection("galleries").doc(galleryId);
  const gallerySnap = await galleryRef.get();
  const gallery = gallerySnap.exists ? gallerySnap.data()! : null;

  const fileRef = db.collection("backup_files").doc(backupFileId);
  const fileSnap = await fileRef.get();
  if (!fileSnap.exists) return;
  const fileData = fileSnap.data()!;
  if (fileData.userId !== ownerUid) return;

  const objectKey = (fileData.object_key as string) ?? "";

  const pathLabel =
    ((fileData.relative_path as string) ?? "").split("/").filter(Boolean).pop() ?? null;
  const muxId = fileData.mux_asset_id as string | undefined;
  if (muxId) {
    await deleteMuxAsset(muxId);
  }

  if (objectKey && isB2Configured()) {
    const refsSnap = await db.collection("backup_files").where("object_key", "==", objectKey).get();
    const otherRefs = refsSnap.docs.filter((d) => d.id !== backupFileId);
    if (otherRefs.length === 0) {
      try {
        await deleteObjectWithRetry(objectKey);
        await Promise.all([
          deleteObjectWithRetry(getProxyObjectKey(objectKey)).catch(() => {}),
          deleteObjectWithRetry(getVideoThumbnailCacheKey(objectKey)).catch(() => {}),
          deleteObjectWithRetry(getLutBakedObjectKey(objectKey)).catch(() => {}),
          ...Object.keys(COVER_DERIVATIVE_WIDTHS).map((size) =>
            deleteObjectWithRetry(getCoverDerivativeCacheKey(objectKey, size)).catch(() => {})
          ),
        ]);
      } catch (err) {
        console.error("[gallery-backing-purge] B2 delete failed:", objectKey, err);
      }
    }
  }

  await deleteByQuery(db, db.collection("file_hearts").where("fileId", "==", backupFileId));

  const pinSnap = await db.collection("pinned_items").where("itemId", "==", backupFileId).get();
  if (!pinSnap.empty) {
    const batch = db.batch();
    for (const d of pinSnap.docs) {
      if (d.data().itemType === "file") batch.delete(d.ref);
    }
    await batch.commit();
  }

  await applyMacosPackageStatsForActiveBackupFileRemoval(db, fileData);
  await fileRef.delete();

  const orgId = (gallery?.organization_id as string | null | undefined) ?? null;
  logActivityEvent({
    event_type: "file_deleted",
    actor_user_id: ownerUid,
    scope_type: orgId ? "organization" : "personal_account",
    organization_id: orgId,
    file_id: backupFileId,
    target_type: "file",
    target_name: pathLabel,
    linked_drive_id: (fileData.linked_drive_id as string) ?? null,
    drive_type: "gallery",
    metadata: {
      source: "gallery_asset_delete",
      gallery_id: galleryId,
      asset_id: assetId,
      storage_action: "purge_unreferenced_backing",
      deletion_job_async: true,
    },
  }).catch(() => {});
}
