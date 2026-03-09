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
 * Verifies access with gallery fallback: if backup_files lookup fails, checks
 * whether the object_key is used in a gallery_asset for a gallery owned by the user.
 * Helps recover from edge cases (e.g. after gallery renames, soft-deleted backup_file).
 */
export async function verifyBackupFileAccessWithGalleryFallback(
  uid: string,
  objectKey: string
): Promise<boolean> {
  if (await verifyBackupFileAccess(uid, objectKey)) return true;

  const db = getAdminFirestore();
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
  return false;
}
