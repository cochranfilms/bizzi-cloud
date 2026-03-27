/**
 * Single implementation for physically removing a backup_files row (+ conditional B2 cleanup).
 * Used by deletion_jobs worker so user-initiated permanent delete and cron trash-expiry share behavior.
 */
import type { Firestore } from "firebase-admin/firestore";
import {
  deleteObjectWithRetry,
  getProxyObjectKey,
  getVideoThumbnailCacheKey,
  isB2Configured,
} from "@/lib/b2";
import { applyMacosPackageStatsForActiveBackupFileRemoval } from "@/lib/macos-package-container-admin";

export async function purgeBackupFilePhysicalAdmin(db: Firestore, fileId: string): Promise<void> {
  const ref = db.collection("backup_files").doc(fileId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data()!;

  await applyMacosPackageStatsForActiveBackupFileRemoval(db, data);

  const objectKey = (data.object_key as string) ?? "";
  if (objectKey && isB2Configured()) {
    const refsSnap = await db.collection("backup_files").where("object_key", "==", objectKey).get();
    const others = refsSnap.docs.filter((d) => d.id !== fileId);
    if (others.length === 0) {
      try {
        await deleteObjectWithRetry(objectKey);
        const proxyKey = getProxyObjectKey(objectKey);
        const thumbKey = getVideoThumbnailCacheKey(objectKey);
        await Promise.all([
          deleteObjectWithRetry(proxyKey).catch(() => {}),
          deleteObjectWithRetry(thumbKey).catch(() => {}),
        ]);
      } catch (err) {
        console.error("[purge-backup-file] B2 delete failed after retries:", objectKey, err);
      }
    }
  }

  await ref.delete();
}
