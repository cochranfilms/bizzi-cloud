/**
 * Lightweight checkout/signup funnel events for gtag (if present) and console.
 * Does not store PII in event params.
 */

export type CheckoutFunnelEvent =
  | "signup_started"
  | "signup_created_account"
  | "checkout_session_created"
  | "redirected_to_stripe"
  | "checkout_success_dashboard"
  | "checkout_recovery_needed"
  | "email_already_in_use_hit";

export function trackCheckoutFunnelEvent(
  event: CheckoutFunnelEvent,
  params?: Record<string, unknown>
): void {
  if (typeof window === "undefined") return;
  try {
    const w = window as Window & {
      gtag?: (...args: unknown[]) => void;
    };
    if (typeof w.gtag === "function") {
      w.gtag("event", event, params ?? {});
    }
    if (process.env.NODE_ENV === "development") {
      console.info(`[checkout-funnel] ${event}`, params ?? {});
    }
  } catch {
    // ignore
  }
}
