export const MEDIA_STANDARD_WORKER_SECRET_ENV = "MEDIA_STANDARD_WORKER_SECRET";

export function isStandardMediaWorkerConfigured(): boolean {
  return Boolean(process.env[MEDIA_STANDARD_WORKER_SECRET_ENV]?.trim());
}

export type StandardMediaWorkerAuthFailure =
  | "no_secret_env"
  | "missing_authorization"
  | "invalid_token";

/**
 * Distinguished auth outcomes for correct HTTP status (401 vs 403).
 * Call only after `isStandardMediaWorkerConfigured()` is true.
 */
export function verifyMediaStandardWorkerRequestDetailed(
  request: Request
): { ok: true } | { ok: false; reason: StandardMediaWorkerAuthFailure } {
  const secret = process.env[MEDIA_STANDARD_WORKER_SECRET_ENV]?.trim();
  if (!secret) return { ok: false, reason: "no_secret_env" };
  const auth = request.headers.get("Authorization");
  if (!auth?.trim()) return { ok: false, reason: "missing_authorization" };
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return { ok: false, reason: "missing_authorization" };
  if (token !== secret) return { ok: false, reason: "invalid_token" };
  return { ok: true };
}

export function verifyMediaStandardWorkerRequest(request: Request): boolean {
  if (!isStandardMediaWorkerConfigured()) return false;
  return verifyMediaStandardWorkerRequestDetailed(request).ok;
}
