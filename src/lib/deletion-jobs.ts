/**
 * Durable purge queue: one job processes backup_files ids in chunks with lease + CAS on next_index.
 */
import type { Firestore, Timestamp } from "firebase-admin/firestore";
import { FieldValue, Timestamp as FirestoreTimestamp } from "firebase-admin/firestore";
import type { MuxPurgeCounterBucket } from "@/lib/backup-file-mux-purge";
import { purgeBackupFilePhysicalAdmin } from "@/lib/backup-file-purge-engine";
import {
  purgeGalleryStoredBackupFileAdmin,
  type GalleryPurgeContext,
} from "@/lib/gallery-backing-purge-engine";
import { compactPurgeLastError, isPermanentMuxPurgeFailure } from "@/lib/mux-purge-gate";

export const DELETION_JOBS_COLLECTION = "deletion_jobs";

export type DeletionJobStatus = "queued" | "running" | "completed" | "failed";

export type DeletionPurgeVariant = "standard" | "gallery_rich";

export type DeletionJobDoc = {
  status: DeletionJobStatus;
  job_type: "purge_backup_files";
  requested_by: string;
  requested_at: Timestamp;
  file_ids: string[];
  drive_id: string | null;
  next_index: number;
  lease_expires_at: Timestamp | null;
  attempt_count: number;
  last_error: string | null;
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
  purge_variant?: DeletionPurgeVariant;
  gallery_purge?: GalleryPurgeContext | null;
  mux_deleted?: number;
  mux_already_missing?: number;
  mux_skipped_not_configured?: number;
  mux_no_asset?: number;
};

export type DeletionJobMuxOutcomes = {
  mux_deleted: number;
  mux_already_missing: number;
  mux_skipped_not_configured: number;
  mux_no_asset: number;
};

export function emptyMuxOutcomes(): DeletionJobMuxOutcomes {
  return {
    mux_deleted: 0,
    mux_already_missing: 0,
    mux_skipped_not_configured: 0,
    mux_no_asset: 0,
  };
}

function addMuxOutcome(agg: DeletionJobMuxOutcomes, bucket: MuxPurgeCounterBucket): void {
  agg[bucket]++;
}

const CHUNK = 50;
const LEASE_MS = 3 * 60 * 1000;

async function tryDeleteDrive(db: Firestore, driveId: string): Promise<void> {
  try {
    await db.collection("linked_drives").doc(driveId).delete();
  } catch (err) {
    console.error("[deletion-jobs] linked_drives delete failed:", driveId, err);
  }
}

export async function enqueueBackupFilesPurgeJob(
  db: Firestore,
  input: {
    requestedBy: string;
    fileIds: string[];
    driveId?: string | null;
    purgeVariant?: DeletionPurgeVariant;
    galleryPurge?: GalleryPurgeContext | null;
  }
): Promise<string> {
  const purgeVariant = input.purgeVariant ?? "standard";
  const jobRef = db.collection(DELETION_JOBS_COLLECTION).doc();
  await jobRef.set({
    status: "queued",
    job_type: "purge_backup_files",
    requested_by: input.requestedBy,
    requested_at: FieldValue.serverTimestamp(),
    file_ids: input.fileIds,
    drive_id: input.driveId ?? null,
    next_index: 0,
    lease_expires_at: null,
    attempt_count: 0,
    last_error: null,
    started_at: null,
    completed_at: null,
    purge_variant: purgeVariant,
    gallery_purge: purgeVariant === "gallery_rich" ? (input.galleryPurge ?? null) : null,
    mux_deleted: 0,
    mux_already_missing: 0,
    mux_skipped_not_configured: 0,
    mux_no_asset: 0,
  });
  return jobRef.id;
}

/**
 * One claim + purge chunk + CAS advance. Safe under concurrent crons (idempotent purges).
 */
export async function runDeletionJobsWorkerPass(db: Firestore): Promise<{
  purged: number;
  jobFinished: boolean;
  muxOutcomes: DeletionJobMuxOutcomes;
}> {
  const muxOutcomes = emptyMuxOutcomes();
  const now = FirestoreTimestamp.now();
  let cand = await db
    .collection(DELETION_JOBS_COLLECTION)
    .where("status", "==", "queued")
    .orderBy("requested_at", "asc")
    .limit(1)
    .get();

  if (cand.empty) {
    const stale = await db
      .collection(DELETION_JOBS_COLLECTION)
      .where("status", "==", "running")
      .where("lease_expires_at", "<", now)
      .orderBy("lease_expires_at", "asc")
      .limit(1)
      .get();
    cand = stale;
  }

  if (cand.empty) {
    return { purged: 0, jobFinished: false, muxOutcomes };
  }

  const jobRef = cand.docs[0].ref;
  const jobId = jobRef.id;

  const claim = await db.runTransaction(async (t) => {
    const s = await t.get(jobRef);
    if (!s.exists) return { kind: "abort" as const };
    const d = s.data() as DeletionJobDoc;
    if (d.status === "failed" || d.status === "completed") return { kind: "abort" as const };

    const ids = d.file_ids ?? [];
    const si = d.next_index ?? 0;
    const purgeVariant = d.purge_variant ?? "standard";
    const galleryPurge = d.gallery_purge ?? null;
    if (purgeVariant === "gallery_rich" && !galleryPurge) {
      t.update(jobRef, {
        status: "failed",
        last_error: "gallery_rich job missing gallery_purge",
        completed_at: FieldValue.serverTimestamp(),
        lease_expires_at: null,
      });
      return { kind: "abort" as const };
    }

    if (si >= ids.length) {
      t.update(jobRef, {
        status: "completed",
        next_index: ids.length,
        completed_at: FieldValue.serverTimestamp(),
        lease_expires_at: null,
      });
      return { kind: "complete_empty" as const, driveId: d.drive_id ?? null };
    }

    t.update(jobRef, {
      status: "running",
      lease_expires_at: FirestoreTimestamp.fromMillis(Date.now() + LEASE_MS),
      started_at: d.started_at ?? FieldValue.serverTimestamp(),
    });

    return {
      kind: "work" as const,
      startIndex: si,
      fileIds: ids,
      driveId: d.drive_id ?? null,
      purgeVariant,
      galleryPurge,
    };
  });

  if (claim.kind === "abort") {
    return { purged: 0, jobFinished: false, muxOutcomes };
  }

  if (claim.kind === "complete_empty") {
    if (claim.driveId) await tryDeleteDrive(db, claim.driveId);
    return { purged: 0, jobFinished: true, muxOutcomes };
  }

  const { startIndex, fileIds, driveId, purgeVariant, galleryPurge } = claim as {
    startIndex: number;
    fileIds: string[];
    driveId: string | null;
    purgeVariant: DeletionPurgeVariant;
    galleryPurge: GalleryPurgeContext | null;
  };
  const end = Math.min(startIndex + CHUNK, fileIds.length);
  let purged = 0;

  for (let i = startIndex; i < end; i++) {
    const fileId = fileIds[i];
    try {
      let r;
      if (purgeVariant === "gallery_rich" && galleryPurge) {
        r = await purgeGalleryStoredBackupFileAdmin(db, fileId, galleryPurge, {
          purgeJobId: jobId,
        });
      } else {
        r = await purgeBackupFilePhysicalAdmin(db, fileId, { purgeJobId: jobId });
      }
      purged++;
      if (r.processed && r.muxCounter) {
        addMuxOutcome(muxOutcomes, r.muxCounter);
      }
    } catch (e) {
      console.error("[deletion-jobs] purge failed:", fileId, e);
      const lastErr = compactPurgeLastError(e, jobId, fileId);
      const perm = isPermanentMuxPurgeFailure(e);
      if (perm) {
        await jobRef.update({
          status: "failed",
          lease_expires_at: null,
          last_error: lastErr,
          attempt_count: FieldValue.increment(1),
        });
      } else {
        await jobRef.update({
          status: "queued",
          lease_expires_at: FirestoreTimestamp.fromMillis(0),
          last_error: lastErr,
          attempt_count: FieldValue.increment(1),
        });
      }
      return { purged, jobFinished: false, muxOutcomes };
    }
  }

  let finished = false;
  await db.runTransaction(async (t) => {
    const s = await t.get(jobRef);
    const d = s.data() as DeletionJobDoc;
    if ((d.next_index ?? 0) !== startIndex) {
      t.update(jobRef, { status: "queued", lease_expires_at: null });
      return;
    }

    const inc: Record<string, ReturnType<typeof FieldValue.increment>> = {};
    const muxBuckets: MuxPurgeCounterBucket[] = [
      "mux_deleted",
      "mux_already_missing",
      "mux_skipped_not_configured",
      "mux_no_asset",
    ];
    for (const bucket of muxBuckets) {
      const n = muxOutcomes[bucket];
      if (n > 0) inc[bucket] = FieldValue.increment(n);
    }

    if (end >= fileIds.length) {
      t.update(jobRef, {
        status: "completed",
        next_index: fileIds.length,
        completed_at: FieldValue.serverTimestamp(),
        lease_expires_at: null,
        ...inc,
      });
      finished = true;
    } else {
      t.update(jobRef, {
        next_index: end,
        status: "queued",
        lease_expires_at: null,
        ...inc,
      });
    }
  });

  if (finished && driveId) {
    await tryDeleteDrive(db, driveId);
  }

  return { purged, jobFinished: finished, muxOutcomes };
}

export async function runDeletionJobsWorkerLoop(
  db: Firestore,
  maxPasses: number
): Promise<{
  totalPurged: number;
  passes: number;
  muxOutcomes: DeletionJobMuxOutcomes;
}> {
  const muxTotal = emptyMuxOutcomes();
  let totalPurged = 0;
  let passes = 0;
  for (let i = 0; i < maxPasses; i++) {
    const r = await runDeletionJobsWorkerPass(db);
    passes++;
    totalPurged += r.purged;
    muxTotal.mux_deleted += r.muxOutcomes.mux_deleted;
    muxTotal.mux_already_missing += r.muxOutcomes.mux_already_missing;
    muxTotal.mux_skipped_not_configured += r.muxOutcomes.mux_skipped_not_configured;
    muxTotal.mux_no_asset += r.muxOutcomes.mux_no_asset;
    if (r.purged === 0 && !r.jobFinished) break;
  }
  return { totalPurged, passes, muxOutcomes: muxTotal };
}
