import type { Firestore } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";

/**
 * Verifies that a user has access to a backup file by checking backup_files.
 * Works for both content/ keys and backups/{uid}/ keys, including transferred
 * files (where userId was changed to owner but object_key still has old path).
 */
export async function verifyBackupFileAccess(
  uid: string,
  objectKey: string
): Promise<boolean> {
  const db = getAdminFirestore();
  const snap = await db
    .collection("backup_files")
    .where("userId", "==", uid)
    .where("object_key", "==", objectKey)
    .limit(1)
    .get();
  if (snap.empty) return false;
  return !snap.docs[0].data().deleted_at;
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
