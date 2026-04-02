/**
 * Firestore proxy_jobs source of truth: enqueue, claim, heartbeat, complete, reclaim.
 * backup_files.proxy_* is projection only — updated via projectBackupFileProxyFromJob().
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyBackupFileAccess } from "@/lib/backup-access";
import type { ProxyJobMediaWorker } from "@/lib/braw-media-worker";
import {
  createPresignedDownloadUrl,
  createPresignedUploadUrl,
  getProxyObjectKey,
  isB2Configured,
  objectExists,
} from "@/lib/b2";
import {
  isBrawFile,
  canGenerateProxy,
  getProxyCapability,
} from "@/lib/format-detection";
import {
  presignedTtlSecondsForAttempt,
  PROXY_JOB_ACTIVE_PHASES,
  PROXY_JOB_ATTEMPT_MAX_MS,
  PROXY_JOB_HEARTBEAT_INTERVAL_MS,
  PROXY_JOB_LEASE_MS,
  PROXY_JOB_MAX_RETRY_WAVES,
  PROXY_JOB_RECLAIM_NEXT_ATTEMPT_DELAY_MS,
  PROXY_JOBS_COLLECTION,
  PROXY_JOB_RETRY_BACKOFF_MS,
  PROXY_JOB_STATUS,
  type ProxyJobCanonicalStatus,
  STANDARD_PROXY_TRANSCODE_PROFILE,
} from "@/lib/proxy-job-config";
import { validateStandardProxyPlayability } from "@/lib/proxy-playability";
import type { Firestore, QueryDocumentSnapshot, Transaction } from "firebase-admin/firestore";
import { proxyJobRowIsBrawQueue } from "@/lib/proxy-queue-braw";

const nowIso = () => new Date().toISOString();

/**
 * proxy_jobs.backup_file_id may reference a deleted or never-created backup_files doc.
 * Firestore tx.update throws NOT_FOUND (gRPC 5) if the document does not exist — which
 * would abort the whole transaction and surface as HTTP 500 on claim/complete.
 */
async function transactionUpdateBackupFileIfExists(
  tx: Transaction,
  db: Firestore,
  backupFileId: string,
  patch: Record<string, unknown>
): Promise<boolean> {
  const bfRef = db.collection("backup_files").doc(backupFileId);
  const bfSnap = await tx.get(bfRef);
  if (!bfSnap.exists) return false;
  tx.update(bfRef, patch);
  return true;
}

/** Legacy statuses still in DB until migrated. */
const LEGACY_ACTIVE_FOR_RECLAIM = ["processing"] as const;

function isActivePhaseForReclaim(status: string): boolean {
  return (
    (PROXY_JOB_ACTIVE_PHASES as readonly string[]).includes(status) ||
    (LEGACY_ACTIVE_FOR_RECLAIM as readonly string[]).includes(status)
  );
}

/** Map coarse proxy_jobs status → backup_files.proxy_status projection. */
export function projectProxyStatusForBackupFile(
  canonical: string
): "pending" | "processing" | "ready" | "failed" | "raw_unsupported" {
  if (canonical === PROXY_JOB_STATUS.QUEUED) return "pending";
  if (canonical === PROXY_JOB_STATUS.FAILED_RETRYABLE) return "processing";
  if (
    canonical === PROXY_JOB_STATUS.CLAIMED ||
    canonical === PROXY_JOB_STATUS.DOWNLOADING ||
    canonical === PROXY_JOB_STATUS.TRANSCODING ||
    canonical === PROXY_JOB_STATUS.UPLOADING ||
    canonical === "processing"
  ) {
    return "processing";
  }
  if (canonical === PROXY_JOB_STATUS.READY || canonical === "completed") {
    return "ready";
  }
  if (canonical === PROXY_JOB_STATUS.FAILED_TERMINAL) return "failed";
  return "processing";
}

export interface ProxyJobEnqueueInput {
  object_key: string;
  name?: string;
  backup_file_id?: string;
  user_id: string;
  media_type?: string | null;
}

async function resolveSourceObjectKey(
  objectKey: string,
  backupFileId: string | null
): Promise<string> {
  if (!backupFileId) return objectKey;
  const db = getAdminFirestore();
  const doc = await db.collection("backup_files").doc(backupFileId).get();
  if (!doc.exists) return objectKey;
  const k = doc.data()?.object_key as string | undefined;
  if (typeof k === "string" && k.trim()) return k;
  return objectKey;
}

async function updateBackupFileProjection(
  backupFileId: string | null,
  patch: Record<string, unknown>
): Promise<void> {
  if (!backupFileId) return;
  const db = getAdminFirestore();
  const ref = db.collection("backup_files").doc(backupFileId);
  const snap = await ref.get();
  if (!snap.exists) return;
  await ref.update(patch);
}

/**
 * Mark job + backup_files ready when proxy already validates (enqueue fast-path / claim skip).
 */
export async function markProxyJobReadyFromValidOutput(options: {
  jobRefId: string;
  backupFileId: string | null;
  sourceObjectKey: string;
  playability: { durationSec: number; sizeBytes: number };
}): Promise<void> {
  const db = getAdminFirestore();
  const proxyKey = getProxyObjectKey(options.sourceObjectKey);
  const t = nowIso();
  await db
    .collection(PROXY_JOBS_COLLECTION)
    .doc(options.jobRefId)
    .set(
      {
        status: PROXY_JOB_STATUS.READY,
        proxy_object_key: proxyKey,
        progress_pct: 100,
        completed_at: t,
        updated_at: t,
        last_phase_at: t,
        lease_expires_at: null,
        max_attempt_deadline_at: null,
        claimed_by: null,
        claimed_at: null,
        heartbeat_at: null,
      },
      { merge: true }
    );

  if (options.backupFileId) {
    await updateBackupFileProjection(options.backupFileId, {
      proxy_status: "ready",
      proxy_object_key: proxyKey,
      proxy_size_bytes: options.playability.sizeBytes,
      proxy_duration_sec: options.playability.durationSec,
      proxy_generated_at: t,
      proxy_error_reason: null,
    });
  }
}

/**
 * Enqueue or merge proxy job (idempotent by backup_file_id doc id when set).
 */
export async function enqueueProxyJob(input: ProxyJobEnqueueInput): Promise<void> {
  if (!isB2Configured()) return;

  const { object_key, name, backup_file_id, user_id, media_type } = input;
  const nameOrPath = name ?? object_key;
  const capability = getProxyCapability(nameOrPath, media_type ?? undefined);

  if (capability === "raw_unsupported") {
    if (backup_file_id) {
      const db = getAdminFirestore();
      const t = nowIso();
      await db.collection("backup_files").doc(backup_file_id).update({
        proxy_status: "raw_unsupported",
        proxy_error_reason: "RAW format requires dedicated transcode pipeline",
        proxy_generated_at: t,
      });
    }
    return;
  }

  if (!canGenerateProxy(nameOrPath, media_type ?? undefined)) return;

  const db = getAdminFirestore();

  if (backup_file_id) {
    const bf = await db.collection("backup_files").doc(backup_file_id).get();
    const ps = bf.data()?.proxy_status as string | undefined;
    if (ps === "raw_unsupported") return;
  }

  const sourceKey = await resolveSourceObjectKey(object_key, backup_file_id ?? null);

  const playability = await validateStandardProxyPlayability(getProxyObjectKey(sourceKey), {
    skipFirstFrameDecode: false,
  });
  if (playability.ok) {
    const jobDocId = backup_file_id ?? null;
    if (jobDocId) {
      await markProxyJobReadyFromValidOutput({
        jobRefId: jobDocId,
        backupFileId: backup_file_id ?? null,
        sourceObjectKey: sourceKey,
        playability,
      });
    }
    return;
  }

  const media_worker: ProxyJobMediaWorker = isBrawFile(nameOrPath) ? "braw" : "standard";
  const t = nowIso();

  if (backup_file_id) {
    const ref = db.collection(PROXY_JOBS_COLLECTION).doc(backup_file_id);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.data();
      if (existing) {
        const st = existing.status as string;
        if (
          st === PROXY_JOB_STATUS.READY ||
          st === "completed" ||
          st === PROXY_JOB_STATUS.FAILED_TERMINAL
        ) {
          return;
        }
        if (isActivePhaseForReclaim(st)) {
          return;
        }
      }
      tx.set(
        ref,
        {
          object_key,
          name: name ?? null,
          backup_file_id,
          user_id,
          media_worker,
          status: PROXY_JOB_STATUS.QUEUED,
          attempt_count: existing?.attempt_count ?? 0,
          retry_after_failure_wave: existing?.retry_after_failure_wave ?? 0,
          next_attempt_at: t,
          claimed_by: null,
          claimed_at: null,
          heartbeat_at: null,
          lease_expires_at: null,
          max_attempt_deadline_at: null,
          progress_pct: null,
          last_error: null,
          last_reclaim_reason: existing?.last_reclaim_reason ?? null,
          last_reclaim_at: existing?.last_reclaim_at ?? null,
          cancel_requested_at: existing?.cancel_requested_at ?? null,
          canceled_at: existing?.canceled_at ?? null,
          canceled_by: existing?.canceled_by ?? null,
          proxy_object_key: getProxyObjectKey(sourceKey),
          transcode_profile: STANDARD_PROXY_TRANSCODE_PROFILE,
          created_at: existing?.created_at ?? t,
          updated_at: t,
          last_phase_at: t,
          worker_version: null,
          ffmpeg_version: null,
        },
        { merge: true }
      );
    });

    await updateBackupFileProjection(backup_file_id, {
      proxy_status: "pending",
      proxy_generated_at: null,
      proxy_error_reason: null,
    });
    return;
  }

  /** Rare: no backup_file_id — use random id (no idempotency guarantee). */
  const existing = await db
    .collection(PROXY_JOBS_COLLECTION)
    .where("object_key", "==", object_key)
    .where("status", "==", PROXY_JOB_STATUS.QUEUED)
    .limit(1)
    .get();
  if (!existing.empty) return;

  await db.collection(PROXY_JOBS_COLLECTION).add({
    object_key,
    name: name ?? null,
    backup_file_id: null,
    user_id,
    media_worker,
    status: PROXY_JOB_STATUS.QUEUED,
    attempt_count: 0,
    retry_after_failure_wave: 0,
    next_attempt_at: t,
    proxy_object_key: getProxyObjectKey(sourceKey),
    transcode_profile: STANDARD_PROXY_TRANSCODE_PROFILE,
    created_at: t,
    updated_at: t,
    last_phase_at: t,
  });
}

export interface StandardClaimResult {
  job: {
    id: string;
    object_key: string;
    backup_file_id: string | null;
    user_id: string;
    name: string | null;
    proxy_object_key: string;
    transcode_profile: string;
    attempt_count: number;
  };
  /** ISO time set on the job at claim (CAS for heartbeat/complete). */
  claimed_at: string;
  sourceDownloadUrl: string;
  sourceDownloadUrlExpiresInSec: number;
  proxyUploadUrl: string;
  proxyUploadUrlExpiresInSec: number;
  proxyUploadHeaders: Record<string, string>;
  lease_expires_at: string;
  max_attempt_deadline_at: string;
  heartbeat_interval_ms: number;
  worker_id: string;
}

export type ClaimMediaRole = "standard" | "braw";

/** Structured claim pipeline logging (no secrets). */
export type ClaimProxyJobLog = (phase: string, data?: Record<string, unknown>) => void;

export async function claimProxyJob(
  workerId: string,
  role: ClaimMediaRole,
  log?: ClaimProxyJobLog
): Promise<StandardClaimResult | null> {
  if (!workerId.trim()) return null;
  if (!isB2Configured()) {
    throw new Error(
      "B2_NOT_CONFIGURED: set B2_ACCESS_KEY_ID, B2_SECRET_ACCESS_KEY, B2_BUCKET_NAME, B2_ENDPOINT"
    );
  }
  log?.("firestore_get", { role });
  const db = getAdminFirestore();
  const ttl = presignedTtlSecondsForAttempt();

  log?.("claim_query_start", {
    role,
    queuedFilter: PROXY_JOB_STATUS.QUEUED,
    retryFilter: PROXY_JOB_STATUS.FAILED_RETRYABLE,
  });
  const [queuedSnap, retrySnap] = await Promise.all([
    db
      .collection(PROXY_JOBS_COLLECTION)
      .where("status", "==", PROXY_JOB_STATUS.QUEUED)
      .orderBy("created_at")
      .limit(40)
      .get(),
    db
      .collection(PROXY_JOBS_COLLECTION)
      .where("status", "==", PROXY_JOB_STATUS.FAILED_RETRYABLE)
      .where("next_attempt_at", "<=", nowIso())
      .orderBy("next_attempt_at")
      .limit(40)
      .get(),
  ]);
  log?.("claim_query_result", {
    queuedDocs: queuedSnap.size,
    retryDocs: retrySnap.size,
  });

  const merged = new Map<string, QueryDocumentSnapshot>();
  for (const d of queuedSnap.docs) merged.set(d.id, d);
  for (const d of retrySnap.docs) merged.set(d.id, d);

  const candidates = Array.from(merged.values())
    .filter((d) => {
      const data = d.data();
      const rowIsBraw = proxyJobRowIsBrawQueue(
        data as Record<string, unknown>,
        data.object_key as string,
        (data.name as string | null) ?? null
      );
      const explicitBraw = data.media_worker === "braw";
      const isBrawRow = rowIsBraw || explicitBraw;
      if (role === "standard" && isBrawRow) return false;
      if (role === "braw" && !isBrawRow) return false;
      return true;
    })
    .sort((a, b) => {
      const ca = String(a.data().created_at ?? "");
      const cb = String(b.data().created_at ?? "");
      return ca.localeCompare(cb);
    });

  log?.("candidates_ready", { count: candidates.length, role });

  const leaseMs = Date.now();
  const leaseUntil = new Date(leaseMs + PROXY_JOB_LEASE_MS).toISOString();
  const deadline = new Date(leaseMs + PROXY_JOB_ATTEMPT_MAX_MS).toISOString();

  for (const docSnap of candidates) {
    const ref = docSnap.ref;
    const snapData = docSnap.data();
    let objectKey = snapData.object_key as string;
    const backupFileId = (snapData.backup_file_id as string | null) ?? null;
    log?.("candidate_start", {
      jobId: docSnap.id,
      backupFileId: backupFileId ?? undefined,
    });
    if (backupFileId) {
      const bf = await db.collection("backup_files").doc(backupFileId).get();
      const k = bf.data()?.object_key as string | undefined;
      if (typeof k === "string" && k.trim()) objectKey = k;
    }
    const userId = snapData.user_id as string;

    if (!(await verifyBackupFileAccess(userId, objectKey))) {
      log?.("access_denied_mark_terminal_tx_enter", { jobId: docSnap.id });
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(ref);
        if (!fresh.exists) return;
        const d = fresh.data()!;
        const st = d.status as string;
        if (
          st !== PROXY_JOB_STATUS.QUEUED &&
          st !== PROXY_JOB_STATUS.FAILED_RETRYABLE &&
          st !== "pending"
        ) {
          return;
        }
        const now = nowIso();
        tx.update(ref, {
          status: PROXY_JOB_STATUS.FAILED_TERMINAL,
          last_error: "access_revoked",
          completed_at: now,
          updated_at: now,
          lease_expires_at: null,
          max_attempt_deadline_at: null,
          claimed_by: null,
          claimed_at: null,
          heartbeat_at: null,
        } as Record<string, unknown>);
        if (backupFileId) {
          const projected = await transactionUpdateBackupFileIfExists(tx, db, backupFileId, {
            proxy_status: "failed",
            proxy_error_reason: "access_revoked",
            proxy_generated_at: now,
          } as Record<string, unknown>);
          if (!projected) {
            log?.("backup_file_projection_skipped_missing_doc", {
              jobId: docSnap.id,
              backupFileId,
              context: "access_revoked",
            });
          }
        }
      });
      log?.("access_denied_mark_terminal_tx_exit", { jobId: docSnap.id });
      continue;
    }

    let sourceExists = false;
    try {
      sourceExists = await objectExists(objectKey);
    } catch (e) {
      log?.("source_exists_preflight_error", {
        jobId: docSnap.id,
        err: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
    log?.("source_exists_preflight", { jobId: docSnap.id, exists: sourceExists });
    if (!sourceExists) continue;

    const proxyKey = getProxyObjectKey(objectKey);
    const valid = await validateStandardProxyPlayability(proxyKey, { skipFirstFrameDecode: false });
    if (valid.ok) {
      log?.("proxy_valid_skip_tx_enter", { jobId: docSnap.id, proxyKey });
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(ref);
        if (!fresh.exists) return;
        const d = fresh.data()!;
        const st = d.status as string;
        if (
          st !== PROXY_JOB_STATUS.QUEUED &&
          st !== PROXY_JOB_STATUS.FAILED_RETRYABLE &&
          st !== "pending"
        ) {
          return;
        }
        const now = nowIso();
        tx.update(ref, {
          status: PROXY_JOB_STATUS.READY,
          proxy_object_key: proxyKey,
          progress_pct: 100,
          completed_at: now,
          updated_at: now,
          last_phase_at: now,
          lease_expires_at: null,
          max_attempt_deadline_at: null,
          claimed_by: null,
          claimed_at: null,
          heartbeat_at: null,
          retry_after_failure_wave: 0,
          last_error: null,
        });
        if (backupFileId) {
          const projected = await transactionUpdateBackupFileIfExists(tx, db, backupFileId, {
            proxy_status: "ready",
            proxy_object_key: proxyKey,
            proxy_size_bytes: valid.sizeBytes,
            proxy_duration_sec: valid.durationSec,
            proxy_generated_at: now,
            proxy_error_reason: null,
          } as Record<string, unknown>);
          if (!projected) {
            log?.("backup_file_projection_skipped_missing_doc", {
              jobId: docSnap.id,
              backupFileId,
              context: "proxy_valid_skip",
            });
          }
        }
      });
      log?.("proxy_valid_skip_tx_exit", { jobId: docSnap.id });
      continue;
    }

    log?.("tx_claim_enter", { jobId: docSnap.id });
    const tryClaim = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (!fresh.exists) return null;
      const data = fresh.data()!;
      const st = data.status as string;
      if (
        st !== PROXY_JOB_STATUS.QUEUED &&
        st !== PROXY_JOB_STATUS.FAILED_RETRYABLE &&
        st !== "pending"
      ) {
        return null;
      }
      if (st === PROXY_JOB_STATUS.FAILED_RETRYABLE) {
        const na = data.next_attempt_at as string | undefined;
        if (na && na > nowIso()) return null;
      }
      if (data.cancel_requested_at) return null;

      const attemptCount = (data.attempt_count ?? 0) + 1;
      const now = nowIso();
      tx.update(ref, {
        status: PROXY_JOB_STATUS.CLAIMED,
        claimed_by: workerId,
        claimed_at: now,
        heartbeat_at: now,
        last_phase_at: now,
        lease_expires_at: leaseUntil,
        max_attempt_deadline_at: deadline,
        attempt_count: attemptCount,
        progress_pct: 0,
        updated_at: now,
        transcode_profile: STANDARD_PROXY_TRANSCODE_PROFILE,
      });

      return {
        objectKey,
        backupFileId,
        userId: data.user_id as string,
        name: (data.name as string | null) ?? null,
        proxyKey,
        attemptCount,
        claimedAt: now,
      };
    });
    log?.("tx_claim_exit", { jobId: docSnap.id, claimed: Boolean(tryClaim) });

    if (!tryClaim) continue;

    const sourceDownloadUrl = await createPresignedDownloadUrl(tryClaim.objectKey, ttl);
    const proxyUploadUrl = await createPresignedUploadUrl(tryClaim.proxyKey, "video/mp4", ttl);

    await updateBackupFileProjection(tryClaim.backupFileId, {
      proxy_status: "processing",
      proxy_generated_at: null,
    });

    return {
      job: {
        id: docSnap.id,
        object_key: tryClaim.objectKey,
        backup_file_id: tryClaim.backupFileId,
        user_id: tryClaim.userId,
        name: tryClaim.name,
        proxy_object_key: tryClaim.proxyKey,
        transcode_profile: STANDARD_PROXY_TRANSCODE_PROFILE,
        attempt_count: tryClaim.attemptCount,
      },
      claimed_at: tryClaim.claimedAt,
      sourceDownloadUrl,
      sourceDownloadUrlExpiresInSec: ttl,
      proxyUploadUrl,
      proxyUploadUrlExpiresInSec: ttl,
      proxyUploadHeaders: {
        "Content-Type": "video/mp4",
        "x-amz-server-side-encryption": "AES256",
      },
      lease_expires_at: leaseUntil,
      max_attempt_deadline_at: deadline,
      heartbeat_interval_ms: PROXY_JOB_HEARTBEAT_INTERVAL_MS,
      worker_id: workerId,
    };
  }

  log?.("no_job_available", { role });
  return null;
}

export const claimStandardProxyJob = (workerId: string, log?: ClaimProxyJobLog) =>
  claimProxyJob(workerId, "standard", log);

export const claimBrawProxyJob = (workerId: string, log?: ClaimProxyJobLog) =>
  claimProxyJob(workerId, "braw", log);

export interface HeartbeatInput {
  jobId: string;
  workerId: string;
  status: ProxyJobCanonicalStatus;
  progress_pct?: number | null;
  worker_version?: string | null;
  ffmpeg_version?: string | null;
  /** CAS: claimed_at from claim response (ISO). */
  claimed_at: string;
}

export async function heartbeatProxyJob(input: HeartbeatInput): Promise<{ ok: true } | { ok: false; code: string }> {
  const db = getAdminFirestore();
  const ref = db.collection(PROXY_JOBS_COLLECTION).doc(input.jobId);
  const extendUntil = new Date(Date.now() + PROXY_JOB_LEASE_MS).toISOString();
  const now = nowIso();

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("not_found");
      const data = snap.data()!;
      if (data.claimed_by !== input.workerId) throw new Error("worker_mismatch");
      if (String(data.claimed_at ?? "") !== input.claimed_at) throw new Error("lease_superseded");
      const st = data.status as string;
      if (
        st !== PROXY_JOB_STATUS.CLAIMED &&
        st !== PROXY_JOB_STATUS.DOWNLOADING &&
        st !== PROXY_JOB_STATUS.TRANSCODING &&
        st !== PROXY_JOB_STATUS.UPLOADING &&
        st !== "processing"
      ) {
        throw new Error("bad_status");
      }

      const phaseChanged = st !== input.status;
      const patch: Record<string, unknown> = {
        status: input.status,
        heartbeat_at: now,
        lease_expires_at: extendUntil,
        updated_at: now,
        last_phase_at: phaseChanged ? now : (data.last_phase_at ?? now),
        progress_pct: input.progress_pct ?? data.progress_pct ?? null,
      };
      if (input.worker_version != null) patch.worker_version = input.worker_version;
      if (input.ffmpeg_version != null) patch.ffmpeg_version = input.ffmpeg_version;
      tx.update(ref, patch);
    });
    return { ok: true };
  } catch {
    return { ok: false, code: "conflict" };
  }
}

export interface CompleteSuccessInput {
  jobId: string;
  workerId: string;
  claimed_at: string;
  proxy_size_bytes?: number | null;
  proxy_duration_sec?: number | null;
}

export async function completeProxyJobSuccess(
  input: CompleteSuccessInput
): Promise<{ ok: true } | { ok: false; code: string; error?: string }> {
  const db = getAdminFirestore();
  const ref = db.collection(PROXY_JOBS_COLLECTION).doc(input.jobId);
  const pre = await ref.get();
  if (!pre.exists) return { ok: false, code: "not_found", error: "job missing" };
  const preData = pre.data()!;
  if (preData.claimed_by !== input.workerId) return { ok: false, code: "conflict" };
  if (String(preData.claimed_at ?? "") !== input.claimed_at) {
    return { ok: false, code: "conflict" };
  }

  let objectKey = preData.object_key as string;
  const backupFileId = (preData.backup_file_id as string | null) ?? null;
  if (backupFileId) {
    const bf = await db.collection("backup_files").doc(backupFileId).get();
    const k = bf.data()?.object_key as string | undefined;
    if (typeof k === "string" && k.trim()) objectKey = k;
  }
  const proxyKey = getProxyObjectKey(objectKey);
  const playability = await validateStandardProxyPlayability(proxyKey, {
    skipFirstFrameDecode: false,
  });
  if (!playability.ok) {
    return { ok: false, code: "validation_failed", error: playability.error };
  }

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("not_found");
      const data = snap.data()!;
      if (data.claimed_by !== input.workerId) throw new Error("worker_mismatch");
      if (String(data.claimed_at ?? "") !== input.claimed_at) throw new Error("lease_superseded");
      const st = data.status as string;
      if (
        st !== PROXY_JOB_STATUS.UPLOADING &&
        st !== PROXY_JOB_STATUS.TRANSCODING &&
        st !== PROXY_JOB_STATUS.DOWNLOADING &&
        st !== PROXY_JOB_STATUS.CLAIMED &&
        st !== "processing"
      ) {
        throw new Error("bad_status");
      }
      if (data.status === PROXY_JOB_STATUS.READY || data.completed_at) {
        throw new Error("already_complete");
      }

      const now = nowIso();
      tx.update(ref, {
        status: PROXY_JOB_STATUS.READY,
        proxy_object_key: proxyKey,
        progress_pct: 100,
        completed_at: now,
        updated_at: now,
        last_phase_at: now,
        lease_expires_at: null,
        max_attempt_deadline_at: null,
        claimed_by: null,
        claimed_at: null,
        heartbeat_at: null,
        retry_after_failure_wave: 0,
        last_error: null,
      });

      if (backupFileId) {
        await transactionUpdateBackupFileIfExists(tx, db, backupFileId, {
          proxy_status: "ready",
          proxy_object_key: proxyKey,
          proxy_size_bytes: input.proxy_size_bytes ?? playability.sizeBytes,
          proxy_duration_sec: input.proxy_duration_sec ?? playability.durationSec,
          proxy_generated_at: now,
          proxy_error_reason: null,
        } as Record<string, unknown>);
      }
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg === "worker_mismatch" ||
      msg === "lease_superseded" ||
      msg === "bad_status" ||
      msg === "already_complete"
    ) {
      return { ok: false, code: "conflict" };
    }
    return { ok: false, code: "error", error: msg };
  }
}

export interface CompleteFailureInput {
  jobId: string;
  workerId: string;
  claimed_at: string;
  error: string;
}

export async function completeProxyJobFailure(
  input: CompleteFailureInput
): Promise<{ ok: true } | { ok: false; code: string }> {
  const db = getAdminFirestore();
  const ref = db.collection(PROXY_JOBS_COLLECTION).doc(input.jobId);

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("not_found");
      const data = snap.data()!;
      if (data.claimed_by !== input.workerId) throw new Error("worker_mismatch");
      if (String(data.claimed_at ?? "") !== input.claimed_at) throw new Error("lease_superseded");
      const st0 = data.status as string;
      if (
        st0 !== PROXY_JOB_STATUS.CLAIMED &&
        st0 !== PROXY_JOB_STATUS.DOWNLOADING &&
        st0 !== PROXY_JOB_STATUS.TRANSCODING &&
        st0 !== PROXY_JOB_STATUS.UPLOADING &&
        st0 !== "processing"
      ) {
        throw new Error("bad_status");
      }

      const now = nowIso();
      const errLower = input.error.toLowerCase();
      const is404ish = /source_url_404|404|missing object|not found/i.test(errLower);
      const terminalByMessage =
        is404ish ||
        /source_object_missing|source_url_404|ffprobe_failed:.*404/i.test(errLower);

      let wave = (data.retry_after_failure_wave as number) ?? 0;
      const forceTerminal = terminalByMessage;

      if (forceTerminal) {
        tx.update(ref, {
          status: PROXY_JOB_STATUS.FAILED_TERMINAL,
          last_error: clampErr(input.error),
          completed_at: now,
          updated_at: now,
          lease_expires_at: null,
          max_attempt_deadline_at: null,
          claimed_by: null,
          claimed_at: null,
          heartbeat_at: null,
        });
        const backupFileId = (data.backup_file_id as string | null) ?? null;
        if (backupFileId) {
          await transactionUpdateBackupFileIfExists(tx, db, backupFileId, {
            proxy_status: "failed",
            proxy_error_reason: clampErr(input.error),
            proxy_generated_at: now,
          } as Record<string, unknown>);
        }
        return;
      }

      wave += 1;
      if (wave > PROXY_JOB_MAX_RETRY_WAVES) {
        tx.update(ref, {
          status: PROXY_JOB_STATUS.FAILED_TERMINAL,
          last_error: clampErr(input.error),
          retry_after_failure_wave: wave,
          completed_at: now,
          updated_at: now,
          lease_expires_at: null,
          max_attempt_deadline_at: null,
          claimed_by: null,
          claimed_at: null,
          heartbeat_at: null,
        });
        const backupFileId = (data.backup_file_id as string | null) ?? null;
        if (backupFileId) {
          await transactionUpdateBackupFileIfExists(tx, db, backupFileId, {
            proxy_status: "failed",
            proxy_error_reason: clampErr(input.error),
            proxy_generated_at: now,
          } as Record<string, unknown>);
        }
        return;
      }

      const delayMs = PROXY_JOB_RETRY_BACKOFF_MS[wave - 1];
      const nextAt = new Date(Date.now() + delayMs).toISOString();
      tx.update(ref, {
        status: PROXY_JOB_STATUS.FAILED_RETRYABLE,
        last_error: clampErr(input.error),
        retry_after_failure_wave: wave,
        next_attempt_at: nextAt,
        updated_at: now,
        lease_expires_at: null,
        max_attempt_deadline_at: null,
        claimed_by: null,
        claimed_at: null,
        heartbeat_at: null,
      });
      const backupFileId = (data.backup_file_id as string | null) ?? null;
      if (backupFileId) {
        await transactionUpdateBackupFileIfExists(tx, db, backupFileId, {
          proxy_status: "processing",
          proxy_error_reason: clampErr(input.error),
          proxy_generated_at: now,
        } as Record<string, unknown>);
      }
    });
    return { ok: true };
  } catch {
    return { ok: false, code: "conflict" };
  }
}

function clampErr(s: string): string {
  const m = s.trim().slice(0, 1800);
  return m || "unknown_error";
}

/** One-time migration: legacy proxy_jobs.status → canonical vocabulary. */
export async function normalizeLegacyProxyJobStatuses(batchLimit = 200): Promise<number> {
  const db = getAdminFirestore();
  const [pendingSnap, completedSnap] = await Promise.all([
    db.collection(PROXY_JOBS_COLLECTION).where("status", "==", "pending").limit(batchLimit).get(),
    db.collection(PROXY_JOBS_COLLECTION).where("status", "==", "completed").limit(batchLimit).get(),
  ]);
  let n = 0;
  const t = nowIso();
  const batch = db.bulkWriter();
  for (const d of pendingSnap.docs) {
    batch.update(d.ref, { status: PROXY_JOB_STATUS.QUEUED, updated_at: t });
    n++;
  }
  for (const d of completedSnap.docs) {
    batch.update(d.ref, { status: PROXY_JOB_STATUS.READY, updated_at: t });
    n++;
  }
  await batch.close();
  return n;
}

/**
 * Reclaim jobs whose lease or attempt deadline expired (control plane; not transcode errors).
 */
export async function reclaimExpiredProxyJobLeases(scanLimit = 100): Promise<{ reclaimed: number }> {
  const db = getAdminFirestore();
  const activeStatuses = [
    ...PROXY_JOB_ACTIVE_PHASES,
    "processing" as const,
  ];
  const snap = await db
    .collection(PROXY_JOBS_COLLECTION)
    .where("status", "in", activeStatuses)
    .limit(scanLimit)
    .get();

  const nowMs = Date.now();
  const iso = nowIso();
  const nextAttempt = new Date(nowMs + PROXY_JOB_RECLAIM_NEXT_ATTEMPT_DELAY_MS).toISOString();
  let reclaimed = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const leaseAt = d.lease_expires_at ? new Date(String(d.lease_expires_at)).getTime() : 0;
    const deadlineAt = d.max_attempt_deadline_at
      ? new Date(String(d.max_attempt_deadline_at)).getTime()
      : 0;
    const leaseExpired = d.lease_expires_at && leaseAt < nowMs;
    const deadlineExpired = d.max_attempt_deadline_at && deadlineAt < nowMs;
    /** Legacy rows may only have heartbeat_at. */
    const hb = d.heartbeat_at ? new Date(String(d.heartbeat_at)).getTime() : 0;
    const legacyStale =
      d.status === "processing" &&
      !d.lease_expires_at &&
      hb > 0 &&
      nowMs - hb > PROXY_JOB_LEASE_MS * 2;

    if (!(leaseExpired || deadlineExpired || legacyStale)) continue;

    try {
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        if (!fresh.exists) return;
        const row = fresh.data()!;
        const st = row.status as string;
        if (!isActivePhaseForReclaim(st)) return;
        if (st === PROXY_JOB_STATUS.READY || row.completed_at) return;

        const l2 = row.lease_expires_at ? new Date(String(row.lease_expires_at)).getTime() : 0;
        const d2 = row.max_attempt_deadline_at
          ? new Date(String(row.max_attempt_deadline_at)).getTime()
          : 0;
        const le2 = row.lease_expires_at && l2 < nowMs;
        const de2 = row.max_attempt_deadline_at && d2 < nowMs;
        const hb2 = row.heartbeat_at ? new Date(String(row.heartbeat_at)).getTime() : 0;
        const leg2 =
          st === "processing" &&
          !row.lease_expires_at &&
          hb2 > 0 &&
          nowMs - hb2 > PROXY_JOB_LEASE_MS * 2;

        if (!(le2 || de2 || leg2)) return;

        const reason =
          le2 && de2 ? "lease_and_attempt_deadline_expired" : le2 ? "lease_expired" : "attempt_deadline_expired";
        tx.update(doc.ref, {
          status: PROXY_JOB_STATUS.QUEUED,
          claimed_by: null,
          claimed_at: null,
          heartbeat_at: null,
          lease_expires_at: null,
          max_attempt_deadline_at: null,
          next_attempt_at: nextAttempt,
          last_reclaim_reason: leg2 ? "legacy_processing_stale" : reason,
          last_reclaim_at: iso,
          updated_at: iso,
        } as Record<string, unknown>);
      });
      reclaimed++;
    } catch {
      // concurrent complete — ignore
    }
  }

  return { reclaimed };
}
