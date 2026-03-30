/**
 * Gallery asset removal: explicit detach (metadata + gallery row only) vs purge (remove last backing
 * storage when no other gallery refs). Normal product flows should default to purge only when
 * intent is irreversible; use detach for “remove from this gallery” without storage deletion.
 */
import type { Firestore, Query } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { enqueueBackupFilesPurgeJob } from "@/lib/deletion-jobs";
import { userCanManageGalleryAsPhotographer } from "@/lib/gallery-owner-access";

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

export type GalleryAssetStorageAction = "detach_metadata" | "purge_unreferenced_backing";

export type DeleteGalleryAssetResult =
  | {
      ok: true;
      backup_file_deleted: boolean;
      b2_deleted: boolean;
      storage_action: GalleryAssetStorageAction;
      /** Present when purge runs via deletion_jobs (gallery_storage + purge). */
      purge_job_id?: string | null;
    }
  | { ok: false; error: string; status: number };

/** @default purge_unreferenced_backing — same as historical DELETE behavior */
export async function deleteGalleryAssetAndStorage(input: {
  galleryId: string;
  assetId: string;
  ownerUid: string;
  storageAction?: GalleryAssetStorageAction;
}): Promise<DeleteGalleryAssetResult> {
  const { galleryId, assetId, ownerUid } = input;
  const storageAction: GalleryAssetStorageAction = input.storageAction ?? "purge_unreferenced_backing";
  const db = getAdminFirestore();

  const galleryRef = db.collection("galleries").doc(galleryId);
  const gallerySnap = await galleryRef.get();
  if (!gallerySnap.exists) {
    return { ok: false, error: "Gallery not found", status: 404 };
  }
  const gallery = gallerySnap.data()!;
  if (!(await userCanManageGalleryAsPhotographer(ownerUid, gallery))) {
    return { ok: false, error: "Access denied", status: 403 };
  }

  const assetRef = db.collection("gallery_assets").doc(assetId);
  const assetSnap = await assetRef.get();
  if (!assetSnap.exists || assetSnap.data()?.gallery_id !== galleryId) {
    return { ok: false, error: "Asset not found", status: 404 };
  }
  const asset = assetSnap.data()!;
  const backupFileId = asset.backup_file_id as string;

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
    return {
      ok: true,
      backup_file_deleted: false,
      b2_deleted: false,
      storage_action: storageAction,
    };
  }

  const stillLinked = await db
    .collection("gallery_assets")
    .where("backup_file_id", "==", backupFileId)
    .limit(1)
    .get();
  if (!stillLinked.empty) {
    return {
      ok: true,
      backup_file_deleted: false,
      b2_deleted: false,
      storage_action: storageAction,
    };
  }

  if (storageAction === "detach_metadata") {
    const fileRef = db.collection("backup_files").doc(backupFileId);
    const fileSnap = await fileRef.get();
    if (fileSnap.exists) {
      const fileData = fileSnap.data()!;
      const docOwner =
        (fileData.userId as string | undefined) ?? (fileData.user_id as string | undefined);
      if (docOwner === ownerUid && (fileData.gallery_id as string | null) === galleryId) {
        await fileRef.update({ gallery_id: null });
      }
    }
    return {
      ok: true,
      backup_file_deleted: false,
      b2_deleted: false,
      storage_action: "detach_metadata",
    };
  }

  const fileRef = db.collection("backup_files").doc(backupFileId);
  const fileSnap = await fileRef.get();
  if (!fileSnap.exists) {
    return {
      ok: true,
      backup_file_deleted: false,
      b2_deleted: false,
      storage_action: "purge_unreferenced_backing",
    };
  }
  const fileData = fileSnap.data()!;
  const docOwner =
    (fileData.userId as string | undefined) ?? (fileData.user_id as string | undefined);
  if (docOwner !== ownerUid) {
    return {
      ok: true,
      backup_file_deleted: false,
      b2_deleted: false,
      storage_action: "purge_unreferenced_backing",
    };
  }

  const jobId = await enqueueBackupFilesPurgeJob(db, {
    requestedBy: ownerUid,
    fileIds: [backupFileId],
    purgeVariant: "gallery_rich",
    galleryPurge: {
      gallery_id: galleryId,
      asset_id: assetId,
      owner_uid: ownerUid,
    },
  });

  return {
    ok: true,
    backup_file_deleted: false,
    b2_deleted: false,
    storage_action: "purge_unreferenced_backing",
    purge_job_id: jobId,
  };
}
