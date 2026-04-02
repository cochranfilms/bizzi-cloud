"use client";

import { useCallback, useEffect, useState } from "react";
import Script from "next/script";
import {
  BIZZI_COOKIE_CONSENT_UPDATED_EVENT,
  readAnalyticsConsentFromStorage,
} from "@/lib/cookie-consent-storage";

type Props = { portalId: string | null };

/**
 * Loads HubSpot analytics (after analytics cookie consent) so `hubspotutk` is available for
 * waitlist submit (`context.hutk`). Portal ID comes from `HUBSPOT_PORTAL_ID` on the server.
 */
export function HubSpotTracker({ portalId }: Props) {
  const [allowScript, setAllowScript] = useState(false);

  const refresh = useCallback(() => {
    setAllowScript(readAnalyticsConsentFromStorage());
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(BIZZI_COOKIE_CONSENT_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(BIZZI_COOKIE_CONSENT_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  if (!portalId || !allowScript) return null;
  return (
    <Script
      id="hs-script-loader"
      strategy="afterInteractive"
      src={`https://js.hs-scripts.com/${portalId}.js`}
    />
  );
}
