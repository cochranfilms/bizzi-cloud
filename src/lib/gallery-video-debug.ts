/**
 * Opt-in debug for gallery video pipeline. Enable with ?galleryVideoDebug or localStorage galleryVideoDebug=1
 */
export function isGalleryVideoDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem("galleryVideoDebug") === "1") return true;
    return new URLSearchParams(window.location.search).has("galleryVideoDebug");
  } catch {
    return false;
  }
}
