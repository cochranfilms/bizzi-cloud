/** Client-build flags (NEXT_PUBLIC_*), kept separate from server-only delivery env. */

export const NEXT_PUBLIC_ASSET_PREVIEW_CONSOLIDATED_ENABLED =
  process.env.NEXT_PUBLIC_ASSET_PREVIEW_CONSOLIDATED === "true";

/** Must match server `THUMBNAIL_REDIRECT_TO_CDN` when using CDN list thumbnails from the hook. */
export const NEXT_PUBLIC_THUMBNAIL_REDIRECT_TO_CDN_ENABLED =
  process.env.NEXT_PUBLIC_THUMBNAIL_REDIRECT_TO_CDN === "true";
