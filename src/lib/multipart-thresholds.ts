/** Browser Uppy, UploadManager, and `/api/uploads` — single PUT below this; multipart at or above. Must exceed B2’s 5 MiB minimum part size. */
export const MULTIPART_THRESHOLD_BYTES = 100 * 1024 * 1024;

/** Parallel multipart part PUTs (Uppy AwsS3 `limit`, UploadManager worker pool). */
export const BROWSER_MULTIPART_CONCURRENCY = 6;

/**
 * Labels for upload telemetry / future A–B tuning (`locked_default`, `conservative`, `aggressive`).
 * Wire parts/concurrency from this when you add alternate profiles.
 */
export function getUploadMultipartProfileLabel(): string {
  const raw = process.env.NEXT_PUBLIC_UPLOAD_MULTIPART_PROFILE?.trim();
  if (raw === "conservative" || raw === "aggressive") return raw;
  return "locked_default";
}
