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
