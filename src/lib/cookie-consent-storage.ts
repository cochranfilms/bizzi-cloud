/** Shared with CookieConsentBanner and optional marketing scripts (e.g. HubSpot). */
export const BIZZI_COOKIE_CONSENT_KEY = "bizzi_cookie_consent";

/** Dispatched on same-document save so listeners load analytics without a full reload. */
export const BIZZI_COOKIE_CONSENT_UPDATED_EVENT = "bizzi_cookie_consent_updated";

export type StoredCookieConsent = {
  essential: boolean;
  analytics: boolean;
  functional: boolean;
  timestamp: number;
};

export function readAnalyticsConsentFromStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(BIZZI_COOKIE_CONSENT_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as StoredCookieConsent;
    return parsed.analytics === true;
  } catch {
    return false;
  }
}
