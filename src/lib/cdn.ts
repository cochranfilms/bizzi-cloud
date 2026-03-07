import { createHmac } from "crypto";
import { createPresignedDownloadUrl } from "@/lib/b2";

const CDN_BASE_URL = process.env.CDN_BASE_URL;
const CDN_SECRET = process.env.CDN_SECRET ?? process.env.B2_SECRET_ACCESS_KEY;

/** Whether CDN is configured (Cloudflare Worker in front of B2 for Bandwidth Alliance). */
export const isCdnConfigured = () =>
  !!CDN_BASE_URL &&
  !!CDN_SECRET &&
  typeof CDN_BASE_URL === "string" &&
  CDN_BASE_URL.length > 0;

/**
 * Create a signed CDN URL for downloading. When CDN is configured, use this instead of
 * presigned B2 URLs so traffic flows through Cloudflare (free B2→Cloudflare egress).
 */
export function createCdnDownloadUrl(
  objectKey: string,
  expiresIn = 3600,
  downloadFilename?: string
): string {
  if (!isCdnConfigured() || !CDN_SECRET) {
    throw new Error("CDN not configured: set CDN_BASE_URL and CDN_SECRET");
  }
  const base = CDN_BASE_URL!.replace(/\/$/, "");
  const exp = Math.floor(Date.now() / 1000) + expiresIn;
  const payload = downloadFilename
    ? `${objectKey}|${exp}|${downloadFilename}`
    : `${objectKey}|${exp}`;
  const sig = createHmac("sha256", CDN_SECRET).update(payload).digest("base64url");
  const path = encodeObjectKeyAsPath(objectKey);
  const params = new URLSearchParams({ exp: String(exp), sig });
  if (downloadFilename) params.set("download", downloadFilename);
  return `${base}${path}?${params.toString()}`;
}

/** Verify CDN signature. Used by cdn-presigned API. */
export function verifyCdnSignature(
  objectKey: string,
  exp: number,
  sig: string,
  downloadFilename?: string
): boolean {
  if (!CDN_SECRET) return false;
  const payload = downloadFilename
    ? `${objectKey}|${exp}|${downloadFilename}`
    : `${objectKey}|${exp}`;
  const expected = createHmac("sha256", CDN_SECRET).update(payload).digest("base64url");
  return sig === expected && exp > Math.floor(Date.now() / 1000);
}

/** Encode object key for URL path (e.g. content/abc123 -> /content/abc123). */
function encodeObjectKeyAsPath(objectKey: string): string {
  const segments = objectKey.split("/").map((s) => encodeURIComponent(s));
  return "/" + segments.join("/");
}

/**
 * Get the best download URL: CDN when configured (cost-efficient), else presigned B2.
 */
export async function getDownloadUrl(
  objectKey: string,
  expiresIn = 3600,
  downloadFilename?: string
): Promise<string> {
  if (isCdnConfigured()) {
    return createCdnDownloadUrl(objectKey, expiresIn, downloadFilename);
  }
  return createPresignedDownloadUrl(objectKey, expiresIn, downloadFilename);
}

/** Re-export for convenience. CDN routes need B2 check too. */
export { isB2Configured } from "@/lib/b2";
