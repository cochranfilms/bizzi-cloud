/**
 * Remove a gallery asset and, when no other gallery row references the same backup file,
 * delete the backup_files document and B2 objects (content, proxy, thumbs, cover cache, LUT-baked).
 */
import type { Firestore, Query } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { logActivityEvent } from "@/lib/activity-log";
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

export type DeleteGalleryAssetResult =
  | {
      ok: true;
      backup_file_deleted: boolean;
      b2_deleted: boolean;
    }
  | { ok: false; error: string; status: number };

export async function deleteGalleryAssetAndStorage(input: {
  galleryId: string;
  assetId: string;
  ownerUid: string;
}): Promise<DeleteGalleryAssetResult> {
  const { galleryId, assetId, ownerUid } = input;
  const db = getAdminFirestore();

  const galleryRef = db.collection("galleries").doc(galleryId);
  const gallerySnap = await galleryRef.get();
  if (!gallerySnap.exists) {
    return { ok: false, error: "Gallery not found", status: 404 };
  }
  const gallery = gallerySnap.data()!;
  if (gallery.photographer_id !== ownerUid) {
    return { ok: false, error: "Access denied", status: 403 };
  }

  const assetRef = db.collection("gallery_assets").doc(assetId);
  const assetSnap = await assetRef.get();
  if (!assetSnap.exists || assetSnap.data()?.gallery_id !== galleryId) {
    return { ok: false, error: "Asset not found", status: 404 };
  }
  const asset = assetSnap.data()!;
  const backupFileId = asset.backup_file_id as string;
  const objectKey = ((asset.object_key as string) ?? "").trim();

  const fileSnapForOrigin = await db.collection("backup_files").doc(backupFileId).get();
  const fileDataForOrigin = fileSnapForOrigin.exists ? fileSnapForOrigin.data()! : null;
  const storedOrigin = asset.asset_origin as string | undefined;
  let effectiveOrigin: "linked" | "gallery_storage";
  if (storedOrigin === "linked" || storedOrigin === "gallery_storage") {
    effectiveOrigin = storedOrigin;
  } else if (fileDataForOrigin && (fileDataForOrigin.gallery_id as string | null) === galleryId) {
    effectiveOrigin = "gallery_storage";
  } else {
    effectiveOrigin = "linked";
  }

  await deleteByQuery(
    db,
    db.collection("asset_comments").where("gallery_id", "==", galleryId).where("asset_id", "==", assetId)
  );

  const listsSnap = await db.collection("favorites_lists").where("gallery_id", "==", galleryId).get();
  for (const listDoc of listsSnap.docs) {
    const ids = (listDoc.data().asset_ids as string[]) ?? [];
    if (!ids.includes(assetId)) continue;
    await listDoc.ref.update({ asset_ids: ids.filter((x) => x !== assetId) });
  }

  const galleryPatch: Record<string, unknown> = { updated_at: new Date() };
  if (gallery.cover_asset_id === assetId) galleryPatch.cover_asset_id = null;
  if (gallery.share_image_asset_id === assetId) galleryPatch.share_image_asset_id = null;
  if (gallery.featured_video_asset_id === assetId) galleryPatch.featured_video_asset_id = null;
  if (Object.keys(galleryPatch).length > 1) {
    await galleryRef.update(galleryPatch);
  }

  await assetRef.delete();

  if (effectiveOrigin === "linked") {
    return { ok: true, backup_file_deleted: false, b2_deleted: false };
  }

  const stillLinked = await db
    .collection("gallery_assets")
    .where("backup_file_id", "==", backupFileId)
    .limit(1)
    .get();
  if (!stillLinked.empty) {
    return { ok: true, backup_file_deleted: false, b2_deleted: false };
  }

  const fileRef = db.collection("backup_files").doc(backupFileId);
  const fileSnap = await fileRef.get();
  if (!fileSnap.exists) {
    return { ok: true, backup_file_deleted: false, b2_deleted: false };
  }
  const fileData = fileSnap.data()!;
  if (fileData.userId !== ownerUid) {
    return { ok: true, backup_file_deleted: false, b2_deleted: false };
  }

  const pathLabel =
    ((fileData.relative_path as string) ?? "").split("/").filter(Boolean).pop() ?? null;
  const muxId = fileData.mux_asset_id as string | undefined;
  if (muxId) {
    await deleteMuxAsset(muxId);
  }

  let b2Deleted = false;
  if (objectKey && isB2Configured()) {
    const refsSnap = await db.collection("backup_files").where("object_key", "==", objectKey).get();
    const otherRefs = refsSnap.docs.filter((d) => d.id !== backupFileId);
    if (otherRefs.length === 0) {
      try {
        await deleteObjectWithRetry(objectKey);
        b2Deleted = true;
        await Promise.all([
          deleteObjectWithRetry(getProxyObjectKey(objectKey)).catch(() => {}),
          deleteObjectWithRetry(getVideoThumbnailCacheKey(objectKey)).catch(() => {}),
          deleteObjectWithRetry(getLutBakedObjectKey(objectKey)).catch(() => {}),
          ...Object.keys(COVER_DERIVATIVE_WIDTHS).map((size) =>
            deleteObjectWithRetry(getCoverDerivativeCacheKey(objectKey, size)).catch(() => {})
          ),
        ]);
      } catch (err) {
        console.error("[delete-gallery-asset] B2 delete failed:", objectKey, err);
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

  await fileRef.delete();

  const orgId = (gallery.organization_id as string | null | undefined) ?? null;
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
    metadata: { source: "gallery_asset_delete", gallery_id: galleryId, asset_id: assetId },
  }).catch(() => {});

  return { ok: true, backup_file_deleted: true, b2_deleted: b2Deleted };
}
