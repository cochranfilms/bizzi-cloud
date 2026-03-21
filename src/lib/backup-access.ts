import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { FieldPath } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getProxyObjectKey } from "@/lib/b2";
import {
  getEffectiveStorageLifecycle,
  storageLifecycleBlocksAccess,
  personalStatusBlocksAccess,
} from "@/lib/storage-lifecycle";

export interface BackupAccessResult {
  allowed: boolean;
  /** When allowed is false: 403 for lifecycle block, 404 for not found */
  status?: 403 | 404;
  message?: string;
}

/**
 * Verifies backup file access with storage lifecycle check.
 * Returns 403 when cold_storage/scheduled_delete; 404 when file not found.
 */
export async function verifyBackupFileAccessWithLifecycle(
  uid: string,
  objectKey: string
): Promise<BackupAccessResult> {
  const info = await getEffectiveStorageLifecycle(uid);
  if (storageLifecycleBlocksAccess(info.status)) {
    const msg =
      info.status === "scheduled_delete"
        ? "Your account is scheduled for deletion. Files remain recoverable until the deletion date."
        : "Your account is past due. Your files are protected in recovery storage. Pay your invoice to restore full access.";
    return { allowed: false, status: 403, message: msg };
  }
  if (info.isProfile && personalStatusBlocksAccess(info.personalStatus)) {
    return {
      allowed: false,
      status: 403,
      message:
        "Your personal account has been deleted. You can restore it within the grace period or continue to your enterprise workspace.",
    };
  }
  const hasAccess = await verifyBackupFileAccess(uid, objectKey);
  return hasAccess
    ? { allowed: true }
    : { allowed: false, status: 404, message: "File not found" };
}

/**
 * Verifies that a user has access to a backup file by checking backup_files.
 * Works for both content/ keys and backups/{uid}/ keys, including transferred
 * files (where userId was changed to owner but object_key still has old path).
 * Also handles proxy keys (proxies/*.mp4): allows access if user owns the original.
 */
export async function verifyBackupFileAccess(
  uid: string,
  objectKey: string
): Promise<boolean> {
  const db = getAdminFirestore();

  // Direct lookup for original files
  const snap = await db
    .collection("backup_files")
    .where("userId", "==", uid)
    .where("object_key", "==", objectKey)
    .limit(1)
    .get();
  if (!snap.empty && !snap.docs[0].data().deleted_at) return true;

  // Proxy key: user has access if they own an original whose proxy matches
  if (objectKey.startsWith("proxies/") && objectKey.endsWith(".mp4")) {
    const BATCH = 500;
    let lastDoc: QueryDocumentSnapshot | null = null;
    for (let i = 0; i < 20; i++) {
      let q = db
        .collection("backup_files")
        .where("userId", "==", uid)
        .where("deleted_at", "==", null)
        .limit(BATCH)
        .orderBy(FieldPath.documentId());
      if (lastDoc) q = q.startAfter(lastDoc);
      const snap = await q.get();
      for (const doc of snap.docs) {
        const orig = doc.data().object_key as string | undefined;
        if (orig && getProxyObjectKey(orig) === objectKey) return true;
      }
      if (snap.docs.length < BATCH) break;
      lastDoc = snap.docs[snap.docs.length - 1];
    }
  }

  return false;
}

/**
 * Returns the user's linked drive IDs (non-deleted).
 */
async function getUserLinkedDriveIds(db: Firestore, uid: string): Promise<Set<string>> {
  const snap = await db
    .collection("linked_drives")
    .where("userId", "==", uid)
    .get();
  const ids = new Set<string>();
  snap.docs.forEach((d) => {
    if (!d.data().deleted_at) ids.add(d.id);
  });
  return ids;
}

/**
 * Verifies access with gallery fallback and lifecycle check.
 */
export async function verifyBackupFileAccessWithGalleryFallbackAndLifecycle(
  uid: string,
  objectKey: string
): Promise<BackupAccessResult> {
  const info = await getEffectiveStorageLifecycle(uid);
  if (storageLifecycleBlocksAccess(info.status)) {
    const msg =
      info.status === "scheduled_delete"
        ? "Your account is scheduled for deletion. Files remain recoverable until the deletion date."
        : "Your account is past due. Your files are protected in recovery storage. Pay your invoice to restore full access.";
    return { allowed: false, status: 403, message: msg };
  }
  if (info.isProfile && personalStatusBlocksAccess(info.personalStatus)) {
    return {
      allowed: false,
      status: 403,
      message:
        "Your personal account has been deleted. You can restore it within the grace period or continue to your enterprise workspace.",
    };
  }
  const hasAccess = await verifyBackupFileAccessWithGalleryFallback(uid, objectKey);
  return hasAccess
    ? { allowed: true }
    : { allowed: false, status: 404, message: "File not found" };
}

/**
 * Verifies access with gallery fallback: if backup_files lookup fails, checks
 * 1) gallery_assets for galleries owned by the user
 * 2) backup_files by object_key only, if the file is in the user's linked drive
 * Handles edge cases (gallery renames, soft-deleted backup_file, userId/org mismatches).
 */
export async function verifyBackupFileAccessWithGalleryFallback(
  uid: string,
  objectKey: string
): Promise<boolean> {
  if (await verifyBackupFileAccess(uid, objectKey)) return true;

  const db = getAdminFirestore();

  // Gallery fallback: object_key in gallery_asset for user-owned gallery
  const assetSnap = await db
    .collection("gallery_assets")
    .where("object_key", "==", objectKey)
    .limit(10)
    .get();

  for (const doc of assetSnap.docs) {
    const galleryId = doc.data().gallery_id;
    if (!galleryId) continue;
    const gallerySnap = await db.collection("galleries").doc(galleryId).get();
    if (!gallerySnap.exists) continue;
    if (gallerySnap.data()?.photographer_id === uid) return true;
  }

  // Linked drive fallback: file in backup_files (any userId) but in user's linked drive
  const byKeySnap = await db
    .collection("backup_files")
    .where("object_key", "==", objectKey)
    .limit(5)
    .get();

  if (!byKeySnap.empty) {
    const driveIds = await getUserLinkedDriveIds(db, uid);
    for (const doc of byKeySnap.docs) {
      const d = doc.data();
      if (d.deleted_at) continue;
      if (driveIds.has((d.linked_drive_id as string) ?? "")) return true;
    }
  }

  return false;
}
