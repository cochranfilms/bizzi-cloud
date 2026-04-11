/** Firestore-backed metadata extraction jobs (large video ffprobe off Vercel). */

export const METADATA_EXTRACTION_JOBS_COLLECTION = "metadata_extraction_jobs";

export const METADATA_JOB_STATUS = {
  QUEUED: "queued",
  CLAIMED: "claimed",
  COMPLETE: "complete",
  FAILED: "failed",
} as const;

export type MetadataJobStatus = (typeof METADATA_JOB_STATUS)[keyof typeof METADATA_JOB_STATUS];

/** Initial + reclaim lease (worker should complete well inside this window). */
export const METADATA_JOB_LEASE_MS = 45 * 60 * 1000;

export function metadataPresignedTtlSeconds(): number {
  return Math.ceil((METADATA_JOB_LEASE_MS + 15 * 60 * 1000) / 1000);
}
