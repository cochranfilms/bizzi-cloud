/**
 * Operational safety pass for cloud import: expired quota reservations and stuck transfer rows.
 * Runs less frequently than migration-worker; safe to retry.
 */
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  MIGRATION_FILES_SUBCOLLECTION,
  MIGRATION_JOBS_COLLECTION,
  migrationMaxRetriesPerFile,
} from "@/lib/migration-constants";
import { releaseReservation } from "@/lib/storage-quota-reservations";
import { STORAGE_QUOTA_RESERVATIONS_COLLECTION } from "@/lib/storage-quota-reservations";

/** How long an in_progress file can go without updates before we assume the worker died mid-transfer. */
const STUCK_IN_PROGRESS_MS = 45 * 60 * 1000;

const MAX_RESERVATIONS_RELEASE = 250;
const MAX_RUNNING_JOBS_SCAN = 40;
const MAX_IN_PROGRESS_FILES_PER_JOB = 40;

export type MigrationReconciliationResult = {
  reservations_released: number;
  migration_files_reset: number;
  running_jobs_scanned: number;
};

/**
 * 1) Pending reservations past `expires_at` hold quota headroom; release them.
 * 2) `files` rows stuck in `in_progress` (worker crash / deploy) → pending (+retry) or failed.
 */
export async function runMigrationReconciliation(db: Firestore): Promise<MigrationReconciliationResult> {
  let reservations_released = 0;
  let migration_files_reset = 0;
  let running_jobs_scanned = 0;

  const nowMs = Date.now();
  const staleBefore = Timestamp.fromMillis(nowMs - STUCK_IN_PROGRESS_MS);

  const resSnap = await db
    .collection(STORAGE_QUOTA_RESERVATIONS_COLLECTION)
    .where("status", "==", "pending")
    .where("expires_at", "<", Timestamp.fromMillis(nowMs))
    .limit(MAX_RESERVATIONS_RELEASE)
    .get();

  for (const d of resSnap.docs) {
    try {
      await releaseReservation(d.id, "expired");
      reservations_released++;
    } catch (err) {
      console.warn("[migration-reconciliation] releaseReservation failed:", d.id, err);
    }
  }

  const jobsSnap = await db
    .collection(MIGRATION_JOBS_COLLECTION)
    .where("status", "==", "running")
    .limit(MAX_RUNNING_JOBS_SCAN)
    .get();

  for (const jobDoc of jobsSnap.docs) {
    const jobRef = jobDoc.ref;
    const filesSnap = await jobRef
      .collection(MIGRATION_FILES_SUBCOLLECTION)
      .where("transfer_status", "==", "in_progress")
      .limit(MAX_IN_PROGRESS_FILES_PER_JOB)
      .get();

    if (filesSnap.empty) continue;
    running_jobs_scanned++;

    for (const f of filesSnap.docs) {
      const data = f.data();
      const updated = data.updated_at as Timestamp | undefined;
      if (!updated || updated.toMillis() >= staleBefore.toMillis()) {
        continue;
      }

      const retries = typeof data.retry_count === "number" ? data.retry_count : 0;
      const nextRetry = retries + 1;
      const terminal = nextRetry >= migrationMaxRetriesPerFile();

      await f.ref.update({
        transfer_status: terminal ? "failed" : "pending",
        last_error: terminal ? "stale_in_progress_timeout" : "reset_after_stale_in_progress",
        retry_count: nextRetry,
        updated_at: FieldValue.serverTimestamp(),
      });
      migration_files_reset++;
    }

    await jobRef.update({ updated_at: FieldValue.serverTimestamp() }).catch(() => {});
  }

  return { reservations_released, migration_files_reset, running_jobs_scanned };
}
