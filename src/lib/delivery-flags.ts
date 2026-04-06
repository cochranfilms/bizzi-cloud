/**
 * Feature flags for unified asset delivery (egress + Vercel CPU).
 * Defaults preserve legacy behavior until explicitly enabled in env.
 */

function envIsTrue(key: string): boolean {
  const v = process.env[key];
  return v === "true" || v === "1";
}

/** Prefer Firestore proxy_* over HeadObject when resolving proxy presence (skips Class B when DB says ready). */
export function deliveryUseFirestoreProxyHints(): boolean {
  return envIsTrue("DELIVERY_USE_FIRESTORE_PROXY_HINTS");
}

/** Break-glass: allow extra HeadObject verification when hints are on (rare DB/bucket drift). */
export function deliveryHeadFallbackEnabled(): boolean {
  return envIsTrue("DELIVERY_HEAD_FALLBACK");
}

export function thumbnailRedirectToCdnEnabled(): boolean {
  return envIsTrue("THUMBNAIL_REDIRECT_TO_CDN");
}

export function assetPreviewConsolidatedEnabled(): boolean {
  return envIsTrue("ASSET_PREVIEW_CONSOLIDATED");
}

export function galleryVideoNoOriginalFallbackEnabled(): boolean {
  return envIsTrue("GALLERY_VIDEO_NO_ORIGINAL_FALLBACK");
}

export function migrationProxyEnqueueV2Enabled(): boolean {
  return envIsTrue("MIGRATION_PROXY_ENQUEUE_V2");
}

export function mountMetadataUseDbProxyOnlyEnabled(): boolean {
  return envIsTrue("MOUNT_METADATA_USE_DB_PROXY_ONLY");
}

export function previewPollBackoffMaxMs(): number {
  const raw = process.env.PREVIEW_POLL_BACKOFF_MAX_MS;
  if (raw && /^\d+$/.test(raw)) return parseInt(raw, 10);
  return 30_000;
}
