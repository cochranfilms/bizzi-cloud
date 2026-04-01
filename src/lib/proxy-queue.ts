/**
 * Firestore-backed queue for proxy generation jobs.
 * Upload flows enqueue jobs; cron processes them to avoid serverless timeouts.
 * `raw_try` extensions (BRAW, R3D, etc.) are enqueued via canGenerateProxy; only `raw_unsupported`
 * short-circuits to an immediate backup_files update without a job.
 *
 * Enqueue only after backup_files.object_key matches the final B2 key (post-finalize).
 * The worker resolves the canonical key from backup_files when backup_file_id is set.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getProxyObjectKey, objectExists } from "@/lib/b2";
import { canGenerateProxy, getProxyCapability, isBrawFile } from "@/lib/format-detection";
import type { ProxyJobMediaWorker } from "@/lib/braw-media-worker";

const PROXY_JOBS_COLLECTION = "proxy_jobs";
const MAX_RETRIES = 5;

/** True if this job must be processed by the Linux BRAW worker, not Vercel FFmpeg. */
export function proxyJobRowIsBrawQueue(
  data: Record<string, unknown> | undefined,
  object_key: string,
  name: string | null
): boolean {
  if (!data) return false;
  if (data.media_worker === "braw") return true;
  const leaf = name ?? object_key;
  if (isBrawFile(leaf) && data.media_worker !== "standard") return true;
  return false;
}

export interface ProxyJobInput {
  object_key: string;
  name?: string;
  backup_file_id?: string;
  user_id: string;
  /** For extension-less files discovered via probe */
  media_type?: string | null;
}

/**
 * Add a proxy generation job to the queue. Idempotent per object_key.
 * For `raw_unsupported` capability only: marks backup_files and does not enqueue.
 */
export async function queueProxyJob(input: ProxyJobInput): Promise<void> {
  const { object_key, name, backup_file_id, user_id, media_type } = input;

  const nameOrPath = name ?? object_key;
  const capability = getProxyCapability(nameOrPath, media_type ?? undefined);

  if (capability === "raw_unsupported") {
    if (backup_file_id) {
      const db = getAdminFirestore();
      const now = new Date().toISOString();
      await db.collection("backup_files").doc(backup_file_id).update({
        proxy_status: "raw_unsupported",
        proxy_error_reason: "RAW format requires dedicated transcode pipeline",
        proxy_generated_at: now,
      });
    }
    return;
  }

  if (!canGenerateProxy(nameOrPath, media_type ?? undefined)) return;

  const db = getAdminFirestore();

  /** Terminal outcomes: do not enqueue again or we overwrite proxy_status and loop forever (e.g. BRAW without FFMPEG_BRAW_PATH). */
  if (backup_file_id) {
    const bf = await db.collection("backup_files").doc(backup_file_id).get();
    const ps = bf.data()?.proxy_status as string | undefined;
    if (ps === "raw_unsupported") return;
  }

  // Avoid duplicates: check if job already pending
  const existing = await db
    .collection(PROXY_JOBS_COLLECTION)
    .where("object_key", "==", object_key)
    .where("status", "==", "pending")
    .limit(1)
    .get();

  if (!existing.empty) return;

  // Also skip if proxy already exists
  const proxyKey = getProxyObjectKey(object_key);
  if (await objectExists(proxyKey)) return;

  const media_worker: ProxyJobMediaWorker = isBrawFile(nameOrPath) ? "braw" : "standard";
  const now = new Date().toISOString();
  await db.collection(PROXY_JOBS_COLLECTION).add({
    object_key,
    name: name ?? null,
    backup_file_id: backup_file_id ?? null,
    user_id,
    media_worker,
    status: "pending",
    retry_count: 0,
    created_at: now,
    updated_at: now,
  });
  if (backup_file_id) {
    await db.collection("backup_files").doc(backup_file_id).update({
      proxy_status: "pending",
      proxy_generated_at: null,
      proxy_error_reason: null,
    });
  }
}

/**
 * Fetch a pending proxy job by object_key. Returns null if none found.
 */
export async function getProxyJobByObjectKey(object_key: string): Promise<{
  id: string;
  object_key: string;
  name: string | null;
  backup_file_id: string | null;
  user_id: string;
  retry_count: number;
  media_worker: string | null;
} | null> {
  const db = getAdminFirestore();
  const snap = await db
    .collection(PROXY_JOBS_COLLECTION)
    .where("object_key", "==", object_key)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  const data = d.data();
  if ((data.retry_count ?? 0) >= MAX_RETRIES) return null;
  return {
    id: d.id,
    object_key: data.object_key as string,
    name: (data.name as string | null) ?? null,
    backup_file_id: (data.backup_file_id as string | null) ?? null,
    user_id: data.user_id as string,
    retry_count: data.retry_count ?? 0,
    media_worker: (data.media_worker as string | null) ?? null,
  };
}

/**
 * Fetch the next batch of pending jobs for processing (oldest first).
 */
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
  const db = getAdminFirestore();

  const snap = await db
    .collection(PROXY_JOBS_COLLECTION)
    .where("status", "==", "pending")
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
        retry_count: data.retry_count ?? 0,
        _row: data as Record<string, unknown>,
      };
    })
    .filter((j) => j.retry_count < MAX_RETRIES)
    .filter((j) => !proxyJobRowIsBrawQueue(j._row, j.object_key, j.name))
    .map(({ _row: _ignored, ...rest }) => rest)
    .slice(0, limit);

  return jobs;
}

/**
 * Mark a job as completed or failed.
 */
export async function updateProxyJobStatus(
  jobId: string,
  status: "completed" | "failed",
  error?: string
): Promise<void> {
  const db = getAdminFirestore();
  const now = new Date().toISOString();
  await db.collection(PROXY_JOBS_COLLECTION).doc(jobId).update({
    status,
    error: error ?? null,
    updated_at: now,
  });
}

/**
 * Increment retry count for a job (on transient failure).
 */
export async function incrementProxyJobRetry(jobId: string, error: string): Promise<void> {
  const db = getAdminFirestore();
  const ref = db.collection(PROXY_JOBS_COLLECTION).doc(jobId);
  const doc = await ref.get();
  const data = doc.data();
  const retryCount = (data?.retry_count ?? 0) + 1;
  const status = retryCount >= MAX_RETRIES ? "failed" : "pending";

  await ref.update({
    status,
    retry_count: retryCount,
    error,
    updated_at: new Date().toISOString(),
  });
}
