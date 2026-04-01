export const MEDIA_STANDARD_WORKER_SECRET_ENV = "MEDIA_STANDARD_WORKER_SECRET";

export function isStandardMediaWorkerConfigured(): boolean {
  return Boolean(process.env[MEDIA_STANDARD_WORKER_SECRET_ENV]?.trim());
}

export function verifyMediaStandardWorkerRequest(request: Request): boolean {
  const secret = process.env[MEDIA_STANDARD_WORKER_SECRET_ENV]?.trim();
  if (!secret) return false;
  const auth = request.headers.get("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  return token === secret;
}
