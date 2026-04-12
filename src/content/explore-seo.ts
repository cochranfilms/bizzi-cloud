/**
 * Explore Bizzi — SEO, GEO, and OG copy in one place.
 * Used by layout metadata, opengraph-image, and JSON-LD.
 */
import { EXPLORE_OG_IMAGE, SITE_URL } from "@/lib/seo";

export const EXPLORE_PAGE_PATH = "/explore" as const;

export const EXPLORE_TITLE = "Explore Bizzi | Learn the platform";

export const EXPLORE_SHORT_TITLE = "Explore Bizzi";

export const EXPLORE_DESCRIPTION =
  "A full guide to Bizzi Cloud for creators: workspaces, cloud editing, stream cache, galleries, delivery, teams, and workflows—plain language, one page.";

/** ISO date string for structured data (update when content materially changes). */
export const EXPLORE_CONTENT_DATE_MODIFIED = "2026-04-12";

export const EXPLORE_KEYWORDS = [
  "Bizzi Cloud",
  "Explore Bizzi",
  "creator cloud storage",
  "video cloud storage",
  "photo cloud storage",
  "creative workflow",
  "media workflows",
  "cloud editing",
  "remote editing workflow",
  "stream cache",
  "proxy editing workflow",
  "video proofing",
  "photo proofing",
  "client gallery",
  "large file delivery",
  "media transfer",
  "creative team collaboration",
  "workspace for video",
  "production storage",
  "post-production cloud",
  "photographer cloud backup",
  "videographer storage",
  "creative agency storage",
  "film production workflow",
  "NLE workflow",
  "media library organization",
  "client delivery platform",
  "Bizzi Editor",
] as const;

export function explorePageUrl(): string {
  return `${SITE_URL}${EXPLORE_PAGE_PATH}`;
}

export function exploreOgImageUrl(): string {
  return EXPLORE_OG_IMAGE;
}

/** Alt text for the generated OG image (keep in sync with opengraph-image.tsx). */
export const EXPLORE_OG_IMAGE_ALT =
  "Explore Bizzi — product education for Bizzi Cloud: workspaces, editing, galleries, and delivery";
