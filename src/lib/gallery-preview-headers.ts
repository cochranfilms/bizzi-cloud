/** Response header: `ok` = real raster preview; `unavailable` = use RAW placeholder UI (do not show as photo). */
export const GALLERY_PREVIEW_STATUS_HEADER = "X-Bizzi-Preview-Status";
export const PREVIEW_STATUS_OK = "ok";
export const PREVIEW_STATUS_UNAVAILABLE = "unavailable";

export function isGalleryPreviewUnavailableResponse(res: Response): boolean {
  return res.headers.get(GALLERY_PREVIEW_STATUS_HEADER) === PREVIEW_STATUS_UNAVAILABLE;
}
