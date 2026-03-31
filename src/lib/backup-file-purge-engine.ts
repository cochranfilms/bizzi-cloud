/**
 * Single implementation for physically removing a backup_files row (+ Mux + conditional B2 cleanup).
 * Used by deletion_jobs worker so user-initiated permanent delete and cron trash-expiry share behavior.
 */
import type { Firestore } from "firebase-admin/firestore";
import {
  muxCounterFromStepSummary,
  purgeMuxForBackupFileStep,
  type MuxPurgeCounterBucket,
} from "@/lib/backup-file-mux-purge";
import {
  deleteObjectWithRetry,
  getProxyObjectKey,
  getVideoThumbnailCacheKey,
  isB2Configured,
} from "@/lib/b2";
import { applyMacosPackageStatsForActiveBackupFileRemoval } from "@/lib/macos-package-container-admin";

export type PurgeBackupFileWorkerResult = {
  /** False when doc did not exist (idempotent no-op). */
  processed: boolean;
  /** Mux classification when this file was fully processed through the purge path. */
  muxCounter: MuxPurgeCounterBucket | null;
};

export async function purgeBackupFilePhysicalAdmin(
  db: Firestore,
  fileId: string,
  opts?: { purgeJobId?: string }
): Promise<PurgeBackupFileWorkerResult> {
  const purgeJobId = opts?.purgeJobId ?? "unknown";
  const ref = db.collection("backup_files").doc(fileId);
  const snap = await ref.get();
  if (!snap.exists) return { processed: false, muxCounter: null };
  const data = snap.data()!;

  await applyMacosPackageStatsForActiveBackupFileRemoval(db, data);

  const muxSummary = await purgeMuxForBackupFileStep(data.mux_asset_id, {
    purgeJobId,
    backupFileId: fileId,
    variant: "standard",
  });
  const muxCounter = muxCounterFromStepSummary(muxSummary);

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
  return { processed: true, muxCounter };
}
