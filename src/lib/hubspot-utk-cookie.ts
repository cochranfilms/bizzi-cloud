/**
 * HubSpot sets the `hubspotutk` cookie when tracking loads — link form submissions
 * to visitors via Forms API `context.hutk`.
 * @see https://developers.hubspot.com/docs/api-reference/legacy/forms-v3-integrations/post-submissions-v3-integration-submit-portalId-formGuid
 */
export const HUBSPOT_UTK_COOKIE_NAME = "hubspotutk";

/** Read HubSpot visitor token from `document.cookie` (browser only). */
export function getHubSpotUtkFromDocument(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${HUBSPOT_UTK_COOKIE_NAME}=([^;]*)`),
  );
  if (!match?.[1]) return undefined;
  try {
    const v = decodeURIComponent(match[1].trim());
    return v.length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}
