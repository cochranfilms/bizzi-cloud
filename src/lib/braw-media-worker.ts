/**
 * Dedicated Linux media worker for Blackmagic RAW (.braw) proxy generation.
 * Vercel/serverless FFmpeg does not decode brxq; jobs with media_worker "braw" are excluded
 * from the standard proxy cron and must be processed via /api/workers/braw-proxy/*.
 */

export const MEDIA_BRAW_WORKER_SECRET_ENV = "MEDIA_BRAW_WORKER_SECRET";

export type ProxyJobMediaWorker = "standard" | "braw";

export function isBrawMediaWorkerConfigured(): boolean {
  return Boolean(process.env[MEDIA_BRAW_WORKER_SECRET_ENV]?.trim());
}

export function verifyMediaBrawWorkerRequest(request: Request): boolean {
  const secret = process.env[MEDIA_BRAW_WORKER_SECRET_ENV]?.trim();
  if (!secret) return false;
  const auth = request.headers.get("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  return token === secret;
}

/** User-facing when preview runs but no Linux worker is configured. */
export const BRAW_WORKER_NOT_CONFIGURED_USER_MESSAGE =
  "Blackmagic RAW preview requires a dedicated media transcode worker. Configure MEDIA_BRAW_WORKER_SECRET on the app and run the Linux worker that calls /api/workers/braw-proxy/claim. You can still Download the original .braw file.";

/** Stored in proxy_error_reason on decode/worker failures. */
export const RAW_DECODER_UNAVAILABLE_PREFIX = "raw_decoder_unavailable";

export function formatRawDecoderUnavailableMessage(detail: string): string {
  const d = detail.trim() || "transcode failed";
  return `${RAW_DECODER_UNAVAILABLE_PREFIX}: ${d}`;
}
