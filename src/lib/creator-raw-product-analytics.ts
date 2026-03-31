/**
 * Product analytics hooks for Creator RAW uploads. Console-only in development;
 * forward the same payload to your analytics provider when wired (e.g. server-side or GTM).
 */
export type CreatorRawProductEvent = "creator_raw_media_rejected";

export type CreatorRawRejectionAnalytics = {
  validation_code: string;
  rejection_reason: string;
  extension: string;
  detected_codec: string | null;
  detected_container: string | null;
  route_context: string | null;
  source_surface: string | null;
};

/** One event per rejected finalize attempt (correlates with activity_logs creator_raw_media_rejected). */
export function logCreatorRawProductEvent(
  event: CreatorRawProductEvent,
  detail: CreatorRawRejectionAnalytics
): void {
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- intentional dev / future provider forward
    console.debug(`[creator-raw-product] ${event}`, detail);
  }
}
