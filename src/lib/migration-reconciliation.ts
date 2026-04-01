/**
 * Operational safety pass for cloud import: expired quota reservations and stuck transfer rows.
 * Runs less frequently than migration-worker; safe to retry.
 */
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  MIGRATION_FILES_SUBCOLLECTION,
  MIGRATION_JOBS_COLLECTION,
  migrationMaxRetriesPerFile,
  migrationReconcileAbandonAfterWindows,
} from "@/lib/migration-constants";
import { releaseReservation } from "@/lib/storage-quota-reservations";
import { STORAGE_QUOTA_RESERVATIONS_COLLECTION } from "@/lib/storage-quota-reservations";
import { abortMultipartUpload, getObjectMetadata } from "@/lib/b2";
import { deleteMigrationPartsSubcollectionBestEffort } from "@/lib/migration-resumable-transfer";

/** How long an active transfer row can go without `checkpoint_at` before we attempt recovery. */
const STUCK_IN_PROGRESS_MS = 45 * 60 * 1000;

const RECONCILE_CRON_MS = 15 * 60 * 1000;

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
  const abandonBefore = Timestamp.fromMillis(
    nowMs - Math.max(STUCK_IN_PROGRESS_MS, RECONCILE_CRON_MS * migrationReconcileAbandonAfterWindows())
  );

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
      .where("transfer_status", "in", [
        "in_progress",
        "session_initializing",
        "verifying",
        "finalizing",
        "needs_repair",
      ])
      .limit(MAX_IN_PROGRESS_FILES_PER_JOB)
      .get();

    if (filesSnap.empty) continue;
    running_jobs_scanned++;

    for (const f of filesSnap.docs) {
      const data = f.data();
      const checkpoint = data.checkpoint_at as Timestamp | undefined;
      const updated = data.updated_at as Timestamp | undefined;
      const lastMs = Math.max(
        checkpoint?.toMillis() ?? 0,
        updated?.toMillis() ?? 0
      );
      if (!lastMs || lastMs >= staleBefore.toMillis()) {
        continue;
      }

      const ts = data.transfer_session as Record<string, unknown> | undefined;
      const objectKeyEarly = typeof ts?.b2_object_key === "string" ? ts.b2_object_key : null;
      const sizeForHead =
        typeof ts?.size_bytes_expected === "number"
          ? (ts.size_bytes_expected as number)
          : typeof data.size_bytes === "number"
            ? data.size_bytes
            : 0;
      const st = String(data.transfer_status);
      if (
        (st === "finalizing" || st === "verifying") &&
        objectKeyEarly &&
        sizeForHead > 0
      ) {
        const head = await getObjectMetadata(objectKeyEarly).catch(() => null);
        if (head && head.contentLength === sizeForHead) {
          await f.ref.update({
            transfer_status: "needs_repair",
            checkpoint_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
            last_error_code: "reconcile_object_ok_needs_finalize",
            last_error_detail: "B2 object complete; run finalize repair",
          });
          continue;
        }
      }

      const uploadId = typeof ts?.b2_upload_id === "string" ? ts.b2_upload_id : null;
      const objectKey = typeof ts?.b2_object_key === "string" ? ts.b2_object_key : null;
      const resId = typeof data.quota_reservation_id === "string" ? data.quota_reservation_id : null;

      const retries = typeof data.retry_count === "number" ? data.retry_count : 0;
      const nextRetry = retries + 1;
      const terminalRetries = nextRetry >= migrationMaxRetriesPerFile();
      const abandoned = lastMs < abandonBefore.toMillis();
      const terminal = terminalRetries || abandoned;

      if (uploadId && objectKey) {
        await abortMultipartUpload(objectKey, uploadId).catch(() => {});
      }
      if (resId) await releaseReservation(resId, "finalize_failed").catch(() => {});

      await deleteMigrationPartsSubcollectionBestEffort(f.ref).catch(() => {});

      await f.ref.update({
        transfer_status: terminal ? "failed" : "pending",
        last_error: terminal
          ? abandoned
            ? "abandoned_stale_session"
            : "stale_in_progress_timeout"
          : "reset_after_stale_in_progress",
        last_error_code: terminal
          ? abandoned
            ? "abandoned_stale_session"
            : "stale_in_progress_timeout"
          : "reset_after_stale_in_progress",
        retry_count: nextRetry,
        transfer_session: FieldValue.delete(),
        migration_finalize_key: FieldValue.delete(),
        quota_reservation_id: null,
        next_byte: 0,
        parts_completed: 0,
        parts_total: null,
        bytes_transferred: 0,
        transfer_claim_token: null,
        transfer_claim_expires_at: null,
        updated_at: FieldValue.serverTimestamp(),
      });
      migration_files_reset++;
    }

    await jobRef.update({ updated_at: FieldValue.serverTimestamp() }).catch(() => {});
  }

  return { reservations_released, migration_files_reset, running_jobs_scanned };
}
