/**
 * Base URL for upload control-plane API routes (`/api/uploads/*`, finalize, etc.).
 * Set `NEXT_PUBLIC_UPLOAD_API_BASE_URL=https://upload.bizzicloud.io` in Vercel so
 * presigned multipart traffic uses the dedicated hostname (e.g. with Argo on that host only).
 * When unset, callers use `window.location.origin` in the browser.
 */
export function getUploadApiBaseUrl(): string {
  const fromEnv =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_UPLOAD_API_BASE_URL
      ? process.env.NEXT_PUBLIC_UPLOAD_API_BASE_URL.trim().replace(/\/$/, "")
      : "";
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}
