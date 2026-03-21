/**
 * Snapshot and restore gallery data, file hearts, and pinned items for account-delete cold storage.
 * Stores in cold_storage_consumer_snapshots/{userId}/items. Restore runs after file restore.
 */
import type { Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";

const SNAPSHOT_COLLECTION = "cold_storage_consumer_snapshots";
const ITEMS_SUBCOLLECTION = "items";

const IN_QUERY_LIMIT = 30;
const BATCH_LIMIT = 450; // Firestore batch limit is 500

type SnapshotEntityType =
  | "gallery"
  | "gallery_asset"
  | "favorites_list"
  | "gallery_collection"
  | "asset_comment"
  | "file_heart"
  | "pinned_item";

function serializeTimestamp(v: unknown): unknown {
  if (v instanceof Timestamp) {
    return { _seconds: v.seconds, _nanoseconds: v.nanoseconds };
  }
  if (v != null && typeof v === "object" && "_seconds" in v && "_nanoseconds" in v) {
    return v;
  }
  return v;
}

function serializeDoc(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = serializeTimestamp(v);
  }
  return out;
}

function deserializeTimestamp(v: unknown): Timestamp | Date | unknown {
  if (v != null && typeof v === "object" && "_seconds" in v) {
    const o = v as { _seconds: number; _nanoseconds?: number };
    return Timestamp.fromMillis(o._seconds * 1000 + ((o._nanoseconds ?? 0) / 1e6));
  }
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    return Timestamp.fromDate(new Date(v));
  }
  return v;
}

function deserializeDoc(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = deserializeTimestamp(v);
  }
  return out;
}

export interface RestoreGalleryResult {
  galleriesRestored: number;
  galleryAssetsRestored: number;
  fileHeartsRestored: number;
  pinnedItemsRestored: number;
}

/**
 * Snapshot galleries, gallery_assets, favorites_lists, gallery_collections, asset_comments,
 * file_hearts, and pinned_items to cold_storage_consumer_snapshots/{userId}/items.
 * Call BEFORE migrateAccountDeleteToColdStorage.
 */
export async function snapshotConsumerGalleries(
  db: Firestore,
  userId: string
): Promise<number> {
  const itemsRef = db
    .collection(SNAPSHOT_COLLECTION)
    .doc(userId)
    .collection(ITEMS_SUBCOLLECTION);

  // Check if snapshot already exists (idempotency)
  const existing = await itemsRef.limit(1).get();
  if (!existing.empty) {
    return 0;
  }

  let count = 0;
  let batch = db.batch();
  let batchOpCount = 0;

  const addToBatch = (entityType: SnapshotEntityType, originalId: string, data: Record<string, unknown>) => {
    batch.set(itemsRef.doc(), {
      entity_type: entityType,
      original_id: originalId,
      data: serializeDoc(data),
    });
    batchOpCount++;
    count++;
  };

  const maybeCommit = async () => {
    if (batchOpCount >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      batchOpCount = 0;
    }
  };

  // 1. Galleries (personal only)
  const galleriesSnap = await db
    .collection("galleries")
    .where("photographer_id", "==", userId)
    .where("organization_id", "==", null)
    .get();
  const galleryIds = galleriesSnap.docs.map((d) => d.id);

  for (const d of galleriesSnap.docs) {
    addToBatch("gallery", d.id, d.data() as Record<string, unknown>);
    await maybeCommit();
  }

  if (galleryIds.length > 0) {
    // 2. Gallery assets
    for (let i = 0; i < galleryIds.length; i += IN_QUERY_LIMIT) {
      const chunk = galleryIds.slice(i, i + IN_QUERY_LIMIT);
      const assetsSnap = await db
        .collection("gallery_assets")
        .where("gallery_id", "in", chunk)
        .get();
      for (const d of assetsSnap.docs) {
        addToBatch("gallery_asset", d.id, d.data() as Record<string, unknown>);
        await maybeCommit();
      }
    }

    // 3. Favorites lists
    for (let i = 0; i < galleryIds.length; i += IN_QUERY_LIMIT) {
      const chunk = galleryIds.slice(i, i + IN_QUERY_LIMIT);
      const listsSnap = await db
        .collection("favorites_lists")
        .where("gallery_id", "in", chunk)
        .get();
      for (const d of listsSnap.docs) {
        addToBatch("favorites_list", d.id, d.data() as Record<string, unknown>);
        await maybeCommit();
      }
    }

    // 4. Gallery collections
    for (let i = 0; i < galleryIds.length; i += IN_QUERY_LIMIT) {
      const chunk = galleryIds.slice(i, i + IN_QUERY_LIMIT);
      const collectionsSnap = await db
        .collection("gallery_collections")
        .where("gallery_id", "in", chunk)
        .get();
      for (const d of collectionsSnap.docs) {
        addToBatch("gallery_collection", d.id, d.data() as Record<string, unknown>);
        await maybeCommit();
      }
    }

    // 5. Asset comments
    for (let i = 0; i < galleryIds.length; i += IN_QUERY_LIMIT) {
      const chunk = galleryIds.slice(i, i + IN_QUERY_LIMIT);
      const commentsSnap = await db
        .collection("asset_comments")
        .where("gallery_id", "in", chunk)
        .get();
      for (const d of commentsSnap.docs) {
        addToBatch("asset_comment", d.id, d.data() as Record<string, unknown>);
        await maybeCommit();
      }
    }
  }

  // 6. File hearts — add object_key for remapping
  const heartsSnap = await db
    .collection("file_hearts")
    .where("userId", "==", userId)
    .get();
  for (const d of heartsSnap.docs) {
    const data = d.data();
    const fileId = data.fileId as string;
    let objectKey: string | null = null;
    if (fileId) {
      const fileSnap = await db.collection("backup_files").doc(fileId).get();
      if (fileSnap.exists) {
        objectKey = (fileSnap.data()?.object_key as string) ?? null;
      }
    }
    if (!objectKey) continue; // Skip hearts on deleted/missing files
    addToBatch("file_heart", d.id, {
      userId: data.userId,
      object_key: objectKey,
      createdAt: data.createdAt,
    });
    await maybeCommit();
  }

  // 7. Pinned items — add object_key (files) or drive_name (folders) for remapping
  const pinnedSnap = await db
    .collection("pinned_items")
    .where("userId", "==", userId)
    .get();
  for (const d of pinnedSnap.docs) {
    const data = d.data();
    const itemType = data.itemType as "file" | "folder";
    const itemId = data.itemId as string;
    let lookupKey: string | null = null;
    let lookupType: "object_key" | "drive_name" = "object_key";
    if (itemType === "file" && itemId) {
      const fileSnap = await db.collection("backup_files").doc(itemId).get();
      if (fileSnap.exists) {
        lookupKey = (fileSnap.data()?.object_key as string) ?? null;
      }
    } else if (itemType === "folder" && itemId) {
      const driveSnap = await db.collection("linked_drives").doc(itemId).get();
      if (driveSnap.exists) {
        lookupKey = (driveSnap.data()?.name as string) ?? null;
        lookupType = "drive_name";
      }
    }
    if (!lookupKey) continue;
    addToBatch("pinned_item", d.id, {
      userId: data.userId,
      itemType,
      [lookupType]: lookupKey,
      createdAt: data.createdAt,
    });
    await maybeCommit();
  }

  if (batchOpCount > 0) {
    await batch.commit();
  }
  return count;
}

/**
 * Restore galleries, gallery_assets, favorites_lists, gallery_collections, asset_comments,
 * file_hearts, and pinned_items from snapshot.
 * Call AFTER restoreConsumerColdStorage has created backup_files and linked_drives.
 */
export async function restoreConsumerGalleries(
  db: Firestore,
  userId: string,
  objectKeyToBackupFileId: Map<string, string>,
  driveNameToDriveId: Map<string, string>
): Promise<RestoreGalleryResult> {
  const itemsSnap = await db
    .collection(SNAPSHOT_COLLECTION)
    .doc(userId)
    .collection(ITEMS_SUBCOLLECTION)
    .get();

  if (itemsSnap.empty) {
    return {
      galleriesRestored: 0,
      galleryAssetsRestored: 0,
      fileHeartsRestored: 0,
      pinnedItemsRestored: 0,
    };
  }

  const { ensureUniqueSlug } = await import("@/lib/gallery-slug");

  const oldGalleryIdToNew = new Map<string, string>();
  const oldCollectionIdToNew = new Map<string, string>();
  const oldAssetIdToNew = new Map<string, string>();
  let galleriesRestored = 0;
  let galleryAssetsRestored = 0;
  let fileHeartsRestored = 0;
  let pinnedItemsRestored = 0;

  const items = itemsSnap.docs.map((d) => ({
    id: d.id,
    entity_type: d.data().entity_type as SnapshotEntityType,
    original_id: d.data().original_id as string,
    data: d.data().data as Record<string, unknown>,
  }));

  // 1. Restore galleries (need slug uniqueness)
  const galleryItems = items.filter((i) => i.entity_type === "gallery");
  for (const item of galleryItems) {
    const data = deserializeDoc(item.data) as Record<string, unknown>;
    const baseSlug = (data.slug as string) ?? "gallery";
    const slug = await ensureUniqueSlug(db, userId, baseSlug);
    const ref = db.collection("galleries").doc();
    await ref.set({ ...data, slug, photographer_id: userId });
    oldGalleryIdToNew.set(item.original_id, ref.id);
    galleriesRestored++;
  }

  // 2. Restore gallery_collections first (needed for collection_id remapping on assets)
  const collectionItems = items.filter((i) => i.entity_type === "gallery_collection");
  for (const item of collectionItems) {
    const data = deserializeDoc(item.data) as Record<string, unknown>;
    const oldGalleryId = data.gallery_id as string;
    const newGalleryId = oldGalleryIdToNew.get(oldGalleryId);
    if (!newGalleryId) continue;
    const ref = await db.collection("gallery_collections").add({
      ...data,
      gallery_id: newGalleryId,
    });
    oldCollectionIdToNew.set(item.original_id, ref.id);
  }

  // 3. Restore gallery_assets (remap gallery_id, backup_file_id, collection_id)
  const assetItems = items.filter((i) => i.entity_type === "gallery_asset");
  for (const item of assetItems) {
    const data = deserializeDoc(item.data) as Record<string, unknown>;
    const objectKey = data.object_key as string;
    const newBackupFileId = objectKey ? objectKeyToBackupFileId.get(objectKey) : undefined;
    if (!newBackupFileId) continue; // Skip if file not restored
    const oldGalleryId = data.gallery_id as string;
    const newGalleryId = oldGalleryIdToNew.get(oldGalleryId);
    if (!newGalleryId) continue;
    const oldCollectionId = data.collection_id as string | null | undefined;
    const newCollectionId = oldCollectionId ? oldCollectionIdToNew.get(oldCollectionId) ?? null : null;
    const ref = db.collection("gallery_assets").doc();
    await ref.set({
      ...data,
      gallery_id: newGalleryId,
      backup_file_id: newBackupFileId,
      collection_id: newCollectionId ?? null,
    });
    oldAssetIdToNew.set(item.original_id, ref.id);
    galleryAssetsRestored++;
  }

  // 4. Update gallery cover/share/featured asset IDs
  for (const item of galleryItems) {
    const galleryRef = db.collection("galleries").doc(oldGalleryIdToNew.get(item.original_id)!);
    const snap = await galleryRef.get();
    if (!snap.exists) continue;
    const gData = snap.data()!;
    const updates: Record<string, unknown> = {};
    const coverId = gData.cover_asset_id as string | null;
    if (coverId) {
      const newId = oldAssetIdToNew.get(coverId);
      if (newId) updates.cover_asset_id = newId;
    }
    const shareId = gData.share_image_asset_id as string | null;
    if (shareId) {
      const newId = oldAssetIdToNew.get(shareId);
      if (newId) updates.share_image_asset_id = newId;
    }
    const featuredId = gData.featured_video_asset_id as string | null;
    if (featuredId) {
      const newId = oldAssetIdToNew.get(featuredId);
      if (newId) updates.featured_video_asset_id = newId;
    }
    if (Object.keys(updates).length > 0) {
      await galleryRef.update(updates);
    }
  }

  // 5. Restore favorites_lists (remap gallery_id, asset_ids)
  const listItems = items.filter((i) => i.entity_type === "favorites_list");
  for (const item of listItems) {
    const data = deserializeDoc(item.data) as Record<string, unknown>;
    const oldGalleryId = data.gallery_id as string;
    const newGalleryId = oldGalleryIdToNew.get(oldGalleryId);
    if (!newGalleryId) continue;
    const assetIds = (data.asset_ids as string[]) ?? [];
    const newAssetIds = assetIds
      .map((id) => oldAssetIdToNew.get(id))
      .filter((id): id is string => !!id);
    await db.collection("favorites_lists").add({
      ...data,
      gallery_id: newGalleryId,
      asset_ids: newAssetIds,
    });
  }

  // 6. Restore asset_comments (remap gallery_id, asset_id)
  const commentItems = items.filter((i) => i.entity_type === "asset_comment");
  for (const item of commentItems) {
    const data = deserializeDoc(item.data) as Record<string, unknown>;
    const oldGalleryId = data.gallery_id as string;
    const newGalleryId = oldGalleryIdToNew.get(oldGalleryId);
    const oldAssetId = data.asset_id as string;
    const newAssetId = oldAssetIdToNew.get(oldAssetId);
    if (!newGalleryId || !newAssetId) continue;
    await db.collection("asset_comments").add({
      ...data,
      gallery_id: newGalleryId,
      asset_id: newAssetId,
    });
  }

  // 7. Restore file_hearts (remap fileId via object_key)
  const heartItems = items.filter((i) => i.entity_type === "file_heart");
  for (const item of heartItems) {
    const data = deserializeDoc(item.data) as Record<string, unknown>;
    const objectKey = data.object_key as string;
    const newFileId = objectKey ? objectKeyToBackupFileId.get(objectKey) : undefined;
    if (!newFileId) continue;
    await db.collection("file_hearts").add({
      fileId: newFileId,
      userId: data.userId,
      createdAt: data.createdAt ?? Timestamp.now(),
    });
    fileHeartsRestored++;
  }

  // 8. Restore pinned_items (remap itemId via object_key or drive_name)
  const pinnedItems = items.filter((i) => i.entity_type === "pinned_item");
  for (const item of pinnedItems) {
    const data = deserializeDoc(item.data) as Record<string, unknown>;
    const itemType = data.itemType as "file" | "folder";
    let newItemId: string | undefined;
    if (itemType === "file") {
      const objectKey = data.object_key as string;
      newItemId = objectKey ? objectKeyToBackupFileId.get(objectKey) : undefined;
    } else {
      const driveName = data.drive_name as string;
      newItemId = driveName ? driveNameToDriveId.get(driveName) : undefined;
    }
    if (!newItemId) continue;
    await db.collection("pinned_items").add({
      userId: data.userId,
      itemType,
      itemId: newItemId,
      createdAt: data.createdAt ?? Timestamp.now(),
    });
    pinnedItemsRestored++;
  }

  // 9. Delete snapshot docs (cleanup)
  const deleteBatch = db.batch();
  for (const d of itemsSnap.docs) {
    deleteBatch.delete(d.ref);
  }
  await deleteBatch.commit();

  return {
    galleriesRestored,
    galleryAssetsRestored,
    fileHeartsRestored,
    pinnedItemsRestored,
  };
}
