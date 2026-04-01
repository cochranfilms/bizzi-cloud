/**
 * Single source for proxy job lease, backoff, and URL TTL policy.
 * Do not reinterpret in individual routes — import from here.
 */

/** Sliding lease: initial and per-heartbeat extension. */
export const PROXY_JOB_LEASE_MS = 2 * 60 * 1000;

/** Worker should POST heartbeat at least this often while in active phases. */
export const PROXY_JOB_HEARTBEAT_INTERVAL_MS = 20 * 1000;

/** Hard wall-clock cap per claim attempt (profile-based override later). */
export const PROXY_JOB_ATTEMPT_MAX_MS = 30 * 60 * 1000;

/** Buffer added to presigned URL TTL so URLs outlive the attempt window. */
export const PROXY_JOB_PRESIGN_BUFFER_MS = 15 * 60 * 1000;

/** Reclaim sets next_attempt_at to now + this delay to reduce herd. */
export const PROXY_JOB_RECLAIM_NEXT_ATTEMPT_DELAY_MS = 10 * 1000;

/** Presigned GET/PUT expiry in seconds = ceil((ATTEMPT_MAX + BUFFER) / 1000). */
export function presignedTtlSecondsForAttempt(): number {
  return Math.ceil((PROXY_JOB_ATTEMPT_MAX_MS + PROXY_JOB_PRESIGN_BUFFER_MS) / 1000);
}

/** After failed_retryable: delays before next claim (ms) for waves 1–3; wave 4+ → terminal. */
export const PROXY_JOB_RETRY_BACKOFF_MS = [
  60 * 1000, // wave 1
  5 * 60 * 1000, // wave 2
  15 * 60 * 1000, // wave 3
] as const;

export const PROXY_JOB_MAX_RETRY_WAVES = PROXY_JOB_RETRY_BACKOFF_MS.length;

/** Canonical transcode profile id stored on jobs and validated on complete. */
export const STANDARD_PROXY_TRANSCODE_PROFILE = "720p_h264_aac_mp4_faststart";

export const PROXY_JOBS_COLLECTION = "proxy_jobs";

/** Job document statuses — only these strings on proxy_jobs.status. */
export const PROXY_JOB_STATUS = {
  QUEUED: "queued",
  CLAIMED: "claimed",
  DOWNLOADING: "downloading",
  TRANSCODING: "transcoding",
  UPLOADING: "uploading",
  READY: "ready",
  FAILED_RETRYABLE: "failed_retryable",
  FAILED_TERMINAL: "failed_terminal",
} as const;

export type ProxyJobCanonicalStatus =
  (typeof PROXY_JOB_STATUS)[keyof typeof PROXY_JOB_STATUS];

export const PROXY_JOB_ACTIVE_PHASES: readonly ProxyJobCanonicalStatus[] = [
  PROXY_JOB_STATUS.CLAIMED,
  PROXY_JOB_STATUS.DOWNLOADING,
  PROXY_JOB_STATUS.TRANSCODING,
  PROXY_JOB_STATUS.UPLOADING,
];

export function isProxyJobActivePhase(status: string): status is ProxyJobCanonicalStatus {
  return (PROXY_JOB_ACTIVE_PHASES as readonly string[]).includes(status);
}
