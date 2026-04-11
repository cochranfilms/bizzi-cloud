/**
 * metadata_extraction_jobs: enqueue, claim, complete (pull worker on Ubuntu).
 */
import { verifyBackupFileAccess } from "@/lib/backup-access";
import {
  createPresignedDownloadUrl,
  isB2Configured,
  objectExists,
} from "@/lib/b2";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { ffprobeJsonToBackupUpdates } from "@/lib/metadata-extraction-ffprobe-parse";
import {
  METADATA_EXTRACTION_JOBS_COLLECTION,
  METADATA_JOB_LEASE_MS,
  METADATA_JOB_STATUS,
  metadataPresignedTtlSeconds,
} from "@/lib/metadata-extraction-job-config";
import { runVideoIngestFollowup } from "@/lib/backup-file-video-ingest-followup";
import type { Firestore } from "firebase-admin/firestore";

const nowIso = () => new Date().toISOString();

function clampErr(s: string, max = 1800): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export interface MetadataExtractionEnqueueInput {
  backup_file_id: string;
  object_key: string;
  user_id: string;
  relative_path: string;
}

export async function enqueueMetadataExtractionJob(
  input: MetadataExtractionEnqueueInput
): Promise<void> {
  if (!isB2Configured()) return;
  const db = getAdminFirestore();
  const ref = db.collection(METADATA_EXTRACTION_JOBS_COLLECTION).doc(input.backup_file_id);
  const t = nowIso();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.data();
    if (existing) {
      const st = existing.status as string;
      if (st === METADATA_JOB_STATUS.COMPLETE || st === METADATA_JOB_STATUS.FAILED) {
        return;
      }
      if (st === METADATA_JOB_STATUS.CLAIMED) {
        return;
      }
    }
    tx.set(
      ref,
      {
        backup_file_id: input.backup_file_id,
        object_key: input.object_key,
        user_id: input.user_id,
        relative_path: input.relative_path,
        status: METADATA_JOB_STATUS.QUEUED,
        claimed_by: null,
        claimed_at: null,
        lease_expires_at: null,
        last_error: null,
        created_at: existing?.created_at ?? t,
        updated_at: t,
      },
      { merge: true }
    );
  });

  await db
    .collection("backup_files")
    .doc(input.backup_file_id)
    .update({
      metadata_extraction_status: "queued",
      updated_at: t,
    })
    .catch(() => {});
}

async function reclaimStaleMetadataJobs(db: Firestore): Promise<void> {
  const now = nowIso();
  const q = await db
    .collection(METADATA_EXTRACTION_JOBS_COLLECTION)
    .where("status", "==", METADATA_JOB_STATUS.CLAIMED)
    .where("lease_expires_at", "<=", now)
    .limit(15)
    .get()
    .catch(() => null);
  if (!q?.size) return;
  const t = nowIso();
  for (const d of q.docs) {
    await d.ref
      .update({
        status: METADATA_JOB_STATUS.QUEUED,
        claimed_by: null,
        claimed_at: null,
        lease_expires_at: null,
        last_error: "lease_expired",
        updated_at: t,
      })
      .catch(() => {});
  }
}

export type MetadataClaimResult = {
  job: {
    id: string;
    backup_file_id: string;
    object_key: string;
    user_id: string;
    relative_path: string;
  };
  claimed_at: string;
  sourceDownloadUrl: string;
  sourceDownloadUrlExpiresInSec: number;
};

export async function claimMetadataExtractionJob(
  workerId: string
): Promise<MetadataClaimResult | null> {
  if (!workerId.trim() || !isB2Configured()) return null;
  const db = getAdminFirestore();
  await reclaimStaleMetadataJobs(db);

  const ttl = metadataPresignedTtlSeconds();
  const queued = await db
    .collection(METADATA_EXTRACTION_JOBS_COLLECTION)
    .where("status", "==", METADATA_JOB_STATUS.QUEUED)
    .orderBy("created_at")
    .limit(25)
    .get();

  const leaseMs = Date.now();
  const leaseUntil = new Date(leaseMs + METADATA_JOB_LEASE_MS).toISOString();

  for (const docSnap of queued.docs) {
    const ref = docSnap.ref;
    const d = docSnap.data();
    const backupFileId = d.backup_file_id as string;
    let objectKey = d.object_key as string;
    const userId = d.user_id as string;
    const relativePath = (d.relative_path as string) ?? "";

    if (backupFileId) {
      const bf = await db.collection("backup_files").doc(backupFileId).get();
      const k = bf.data()?.object_key as string | undefined;
      if (typeof k === "string" && k.trim()) objectKey = k;
    }

    if (!(await verifyBackupFileAccess(userId, objectKey))) {
      const t = nowIso();
      await ref
        .update({
          status: METADATA_JOB_STATUS.FAILED,
          last_error: "access_revoked",
          updated_at: t,
        })
        .catch(() => {});
      await db
        .collection("backup_files")
        .doc(backupFileId)
        .update({
          metadata_extraction_status: "failed",
          updated_at: t,
        })
        .catch(() => {});
      continue;
    }

    if (!(await objectExists(objectKey))) continue;

    const claimed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (!fresh.exists) return null;
      const data = fresh.data()!;
      if (data.status !== METADATA_JOB_STATUS.QUEUED) return null;
      const now = nowIso();
      tx.update(ref, {
        status: METADATA_JOB_STATUS.CLAIMED,
        claimed_by: workerId,
        claimed_at: now,
        lease_expires_at: leaseUntil,
        updated_at: now,
      });
      return { claimedAt: now };
    });

    if (!claimed) continue;

    const sourceDownloadUrl = await createPresignedDownloadUrl(objectKey, ttl);
    await db
      .collection("backup_files")
      .doc(backupFileId)
      .update({
        metadata_extraction_status: "processing",
        updated_at: nowIso(),
      })
      .catch(() => {});

    return {
      job: {
        id: docSnap.id,
        backup_file_id: backupFileId,
        object_key: objectKey,
        user_id: userId,
        relative_path: relativePath,
      },
      claimed_at: claimed.claimedAt,
      sourceDownloadUrl,
      sourceDownloadUrlExpiresInSec: ttl,
    };
  }

  return null;
}

export async function completeMetadataExtractionSuccess(input: {
  backupFileId: string;
  workerId: string;
  claimed_at: string;
  ffprobe_json: Record<string, unknown>;
}): Promise<{ ok: true } | { ok: false; code: string; error?: string }> {
  const db = getAdminFirestore();
  const jobRef = db.collection(METADATA_EXTRACTION_JOBS_COLLECTION).doc(input.backupFileId);
  const pre = await jobRef.get();
  if (!pre.exists) return { ok: false, code: "not_found", error: "job missing" };
  const preData = pre.data()!;
  if (preData.claimed_by !== input.workerId) return { ok: false, code: "conflict" };
  if (String(preData.claimed_at ?? "") !== input.claimed_at) {
    return { ok: false, code: "conflict" };
  }
  if (preData.status !== METADATA_JOB_STATUS.CLAIMED) {
    return { ok: false, code: "conflict", error: "bad_status" };
  }

  const bfRef = db.collection("backup_files").doc(input.backupFileId);
  const bfSnap = await bfRef.get();
  if (!bfSnap.exists) return { ok: false, code: "not_found", error: "backup_file missing" };
  const fileData = bfSnap.data()!;
  const relativePath = (fileData.relative_path ?? "") as string;
  const fileName = relativePath.split("/").filter(Boolean).pop() ?? (preData.object_key as string);
  const objectKey = (fileData.object_key ?? preData.object_key) as string;
  const userId = (fileData.userId ?? preData.user_id) as string;
  const linkedDriveId = (fileData.linked_drive_id as string) ?? "";
  let driveIsCreatorRaw = false;
  if (linkedDriveId) {
    const driveSnap = await db.collection("linked_drives").doc(linkedDriveId).get();
    driveIsCreatorRaw = driveSnap.exists && driveSnap.data()?.is_creator_raw === true;
  }

  const probeUpdates = ffprobeJsonToBackupUpdates(input.ffprobe_json, fileName);
  const updates: Record<string, unknown> = {
    ...probeUpdates,
    metadata_extraction_status: "complete",
    uploader_id: userId,
  };

  if (!updates.created_at && !fileData.created_at) {
    updates.created_at = new Date().toISOString();
  }

  const t = nowIso();
  try {
    await db.runTransaction(async (tx) => {
      const j = await tx.get(jobRef);
      if (!j.exists) throw new Error("not_found");
      const jd = j.data()!;
      if (jd.claimed_by !== input.workerId) throw new Error("worker_mismatch");
      if (String(jd.claimed_at ?? "") !== input.claimed_at) throw new Error("lease_superseded");
      if (jd.status !== METADATA_JOB_STATUS.CLAIMED) throw new Error("bad_status");

      tx.update(jobRef, {
        status: METADATA_JOB_STATUS.COMPLETE,
        claimed_by: null,
        claimed_at: null,
        lease_expires_at: null,
        updated_at: t,
      });

      tx.update(bfRef, updates);
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg === "worker_mismatch" ||
      msg === "lease_superseded" ||
      msg === "bad_status"
    ) {
      return { ok: false, code: "conflict" };
    }
    return { ok: false, code: "error", error: msg };
  }

  const isVideoNow = updates.media_type === "video" || fileData.media_type === "video";
  if (isVideoNow) {
    await runVideoIngestFollowup({
      objectKey,
      fileName,
      backupFileId: input.backupFileId,
      userId,
      driveIsCreatorRaw,
    });
  }

  return { ok: true };
}

export async function completeMetadataExtractionFailure(input: {
  backupFileId: string;
  workerId: string;
  claimed_at: string;
  error: string;
}): Promise<{ ok: true } | { ok: false; code: string }> {
  const db = getAdminFirestore();
  const jobRef = db.collection(METADATA_EXTRACTION_JOBS_COLLECTION).doc(input.backupFileId);
  const t = nowIso();
  const err = clampErr(input.error);

  try {
    await db.runTransaction(async (tx) => {
      const j = await tx.get(jobRef);
      if (!j.exists) throw new Error("not_found");
      const jd = j.data()!;
      if (jd.claimed_by !== input.workerId) throw new Error("worker_mismatch");
      if (String(jd.claimed_at ?? "") !== input.claimed_at) throw new Error("lease_superseded");
      if (jd.status !== METADATA_JOB_STATUS.CLAIMED) throw new Error("bad_status");

      tx.update(jobRef, {
        status: METADATA_JOB_STATUS.FAILED,
        claimed_by: null,
        claimed_at: null,
        lease_expires_at: null,
        last_error: err,
        updated_at: t,
      });

      const bfRef = db.collection("backup_files").doc(input.backupFileId);
      tx.update(bfRef, {
        metadata_extraction_status: "failed",
        updated_at: t,
      });
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "worker_mismatch" || msg === "lease_superseded" || msg === "bad_status") {
      return { ok: false, code: "conflict" };
    }
    return { ok: false, code: "error" };
  }
}
