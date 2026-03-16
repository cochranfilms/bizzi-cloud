/**
 * Firestore-backed queue for proxy generation jobs.
 * Upload flows enqueue jobs; cron processes them to avoid serverless timeouts.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getProxyObjectKey, objectExists } from "@/lib/b2";

const PROXY_JOBS_COLLECTION = "proxy_jobs";
const MAX_RETRIES = 5;

export interface ProxyJobInput {
  object_key: string;
  name?: string;
  backup_file_id?: string;
  user_id: string;
}

/**
 * Add a proxy generation job to the queue. Idempotent per object_key.
 */
export async function queueProxyJob(input: ProxyJobInput): Promise<void> {
  const { object_key, name, backup_file_id, user_id } = input;

  const db = getAdminFirestore();

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

  await db.collection(PROXY_JOBS_COLLECTION).add({
    object_key,
    name: name ?? null,
    backup_file_id: backup_file_id ?? null,
    user_id,
    status: "pending",
    retry_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
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
    .limit(limit * 2) // Fetch extra in case we filter some out
    .get();

  const jobs = snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        object_key: data.object_key,
        name: data.name ?? null,
        backup_file_id: data.backup_file_id ?? null,
        user_id: data.user_id,
        retry_count: data.retry_count ?? 0,
      };
    })
    .filter((j) => j.retry_count < MAX_RETRIES)
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
