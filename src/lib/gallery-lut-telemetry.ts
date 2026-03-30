/**
 * Structured diagnostics for public gallery LUT / WebGL video grading (dev logs today; wire analytics later).
 */

export type GalleryLutTelemetryEvent =
  | "gallery_lut_state_invalid"
  | "gallery_lut_selection_sanitized"
  /** Option id resolved but `source` empty (bad library row). */
  | "gallery_lut_option_missing_source"
  | "gallery_lut_fetch_failed"
  | "gallery_lut_parse_failed"
  | "gallery_video_webgl2_unavailable"
  | "gallery_video_texture_upload_failed"
  | "gallery_video_stream_swapped"
  | "gallery_video_lut_context_reinitialized"
  | "gallery_video_lut_disabled_fallback";

export type GalleryLutTelemetryDetail = {
  galleryId?: string;
  assetId?: string;
  surface?: "hero" | "grid" | "modal";
  selectedLutId?: string;
  sanitizedLutId?: string;
  resolvedLutSource?: string | null;
  fallbackReason?: string | null;
  streamUrlSample?: string;
  passwordProtected?: boolean;
  message?: string;
  player?: "hls.js" | "native_hls" | "progressive";
};

export function logGalleryLutEvent(
  event: GalleryLutTelemetryEvent,
  detail?: GalleryLutTelemetryDetail
): void {
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- intentional dev signal
    console.debug(`[gallery-lut] ${event}`, detail ?? {});
  }
}
