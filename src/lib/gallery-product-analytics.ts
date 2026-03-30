/**
 * Lightweight product signals for gallery share / invite UX (optional).
 * Extend with real analytics when a provider is wired.
 */
export type GalleryProductEvent =
  | "gallery_invite_verify_success"
  | "gallery_invite_verify_failure"
  | "gallery_share_link_copied"
  | "gallery_handle_claimed_settings";

export function logGalleryProductEvent(
  event: GalleryProductEvent,
  detail?: Record<string, unknown>
): void {
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- intentional dev signal
    console.debug(`[gallery-product] ${event}`, detail ?? {});
  }
}
