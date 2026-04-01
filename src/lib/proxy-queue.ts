/**
 * Proxy job enqueue API — delegates to proxy-job-pipeline (Firestore source of truth).
 * Re-exports BRAW routing helper for workers and tests.
 */
import { enqueueProxyJob, type ProxyJobEnqueueInput } from "@/lib/proxy-job-pipeline";

export { proxyJobRowIsBrawQueue } from "@/lib/proxy-queue-braw";

const PROXY_JOBS_COLLECTION = "proxy_jobs";
const MAX_RETRIES = 5;

export interface ProxyJobInput {
  object_key: string;
  name?: string;
  backup_file_id?: string;
  user_id: string;
  media_type?: string | null;
}

/**
 * Enqueue or upsert a proxy job (idempotent by backup_file_id document id).
 */
export async function queueProxyJob(input: ProxyJobInput): Promise<void> {
  const body: ProxyJobEnqueueInput = {
    object_key: input.object_key,
    name: input.name,
    backup_file_id: input.backup_file_id,
    user_id: input.user_id,
    media_type: input.media_type,
  };
  await enqueueProxyJob(body);
}

/** @deprecated Legacy — workers use claim API. */
export async function getProxyJobByObjectKey(object_key: string): Promise<{
  id: string;
  object_key: string;
  name: string | null;
  backup_file_id: string | null;
  user_id: string;
  retry_count: number;
  media_worker: string | null;
} | null> {
  const { getAdminFirestore } = await import("@/lib/firebase-admin");
  const db = getAdminFirestore();
  const snap = await db
    .collection(PROXY_JOBS_COLLECTION)
    .where("object_key", "==", object_key)
    .where("status", "==", "queued")
    .limit(1)
    .get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  const data = d.data();
  if ((data.attempt_count ?? 0) >= MAX_RETRIES && data.status === "failed_terminal") return null;
  return {
    id: d.id,
    object_key: data.object_key as string,
    name: (data.name as string | null) ?? null,
    backup_file_id: (data.backup_file_id as string | null) ?? null,
    user_id: data.user_id as string,
    retry_count: data.retry_after_failure_wave ?? data.retry_count ?? 0,
    media_worker: (data.media_worker as string | null) ?? null,
  };
}

/** @deprecated Legacy cron — replaced by dedicated worker + reclaim cron. */
export async function getPendingProxyJobs(limit: number): Promise<
  Array<{
    id: string;
    object_key: string;
    name: string | null;
    backup_file_id: string | null;
    user_id: string;
    retry_count: number;
  }>
> {
  const { getAdminFirestore } = await import("@/lib/firebase-admin");
  const { proxyJobRowIsBrawQueue } = await import("@/lib/proxy-queue-braw");
  const db = getAdminFirestore();

  const snap = await db
    .collection(PROXY_JOBS_COLLECTION)
    .where("status", "==", "queued")
    .orderBy("created_at")
    .limit(limit * 4)
    .get();

  const jobs = snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        object_key: data.object_key as string,
        name: (data.name as string | null) ?? null,
        backup_file_id: (data.backup_file_id as string | null) ?? null,
        user_id: data.user_id as string,
        retry_count: data.retry_after_failure_wave ?? data.retry_count ?? 0,
        _row: data as Record<string, unknown>,
      };
    })
    .filter((j) => j.retry_count < MAX_RETRIES)
    .filter((j) => !proxyJobRowIsBrawQueue(j._row, j.object_key, j.name))
    .map(({ _row: _ignored, ...rest }) => rest)
    .slice(0, limit);

  return jobs;
}

/** @deprecated */
export async function updateProxyJobStatus(
  jobId: string,
  status: "completed" | "failed",
  error?: string
): Promise<void> {
  const { getAdminFirestore } = await import("@/lib/firebase-admin");
  const { PROXY_JOB_STATUS } = await import("@/lib/proxy-job-config");
  const db = getAdminFirestore();
  const now = new Date().toISOString();
  const mapped =
    status === "completed" ? PROXY_JOB_STATUS.READY : PROXY_JOB_STATUS.FAILED_TERMINAL;
  await db.collection(PROXY_JOBS_COLLECTION).doc(jobId).update({
    status: mapped,
    last_error: error ?? null,
    updated_at: now,
  });
}

/** @deprecated */
export async function incrementProxyJobRetry(jobId: string, error: string): Promise<void> {
  const { getAdminFirestore } = await import("@/lib/firebase-admin");
  const {
    PROXY_JOB_MAX_RETRY_WAVES,
    PROXY_JOB_RETRY_BACKOFF_MS,
    PROXY_JOB_STATUS,
  } = await import("@/lib/proxy-job-config");
  const db = getAdminFirestore();
  const ref = db.collection(PROXY_JOBS_COLLECTION).doc(jobId);
  const doc = await ref.get();
  const data = doc.data();
  const wave = ((data?.retry_after_failure_wave as number) ?? 0) + 1;
  const now = new Date().toISOString();
  if (wave > PROXY_JOB_MAX_RETRY_WAVES) {
    await ref.update({
      status: PROXY_JOB_STATUS.FAILED_TERMINAL,
      last_error: error,
      updated_at: now,
    });
    return;
  }
  const delayMs = PROXY_JOB_RETRY_BACKOFF_MS[wave - 1];
  const nextAt = new Date(Date.now() + delayMs).toISOString();
  await ref.update({
    status: PROXY_JOB_STATUS.FAILED_RETRYABLE,
    retry_after_failure_wave: wave,
    last_error: error,
    next_attempt_at: nextAt,
    updated_at: now,
  });
}
