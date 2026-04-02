/**
 * Central SEO configuration for Bizzi Cloud.
 * Used by metadata, sitemap, robots, and structured data.
 */

const BASE_URL =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_APP_URL) ||
  "https://www.bizzicloud.io";

export const SITE_URL = BASE_URL.replace(/\/$/, "");

export const SITE_NAME = "Bizzi Cloud";
export const SITE_TITLE = "Bizzi Cloud | Cloud storage built for creators";
export const SITE_DESCRIPTION =
  "Fast, reliable cloud storage that follows your workflow. From your Bizzi Byte SSD to the cloud—access your projects anywhere, anytime. Built for videographers, photographers, and creative teams.";

export const ORGANIZATION = {
  name: "Bizzi Cloud",
  legalName: "Bizzi Cloud",
  url: SITE_URL,
  logo: `${SITE_URL}/icon`,
  description: SITE_DESCRIPTION,
  sameAs: [
    "https://www.bizzicloud.io",
    "https://bizzicloud.io",
  ] as string[],
  foundingDate: "2024",
};

export const DEFAULT_OG_IMAGE = `${SITE_URL}/opengraph-image`;

/** Dedicated `/waitlist` page — search + AI GEO (entity clarity, canonical URL). */
export const WAITLIST_PATH = "/waitlist" as const;
export const WAITLIST_TITLE = "Bizzi Cloud waitlist | Pre-register for early access";
export const WAITLIST_DESCRIPTION =
  "Pre-register for Bizzi Cloud early access. Tell us what storage and workflow you need—built for videographers, photographers, and creative teams. Join the waitlist to be first in line when spots open.";
export const WAITLIST_KEYWORDS = [
  "Bizzi Cloud waitlist",
  "Bizzi Cloud early access",
  "creator cloud storage waitlist",
  "pre-register cloud storage",
  "video production cloud storage",
  "photography cloud backup waitlist",
] as const;
export const WAITLIST_OG_IMAGE = `${SITE_URL}/waitlist/opengraph-image`;

/** FAQ content for structured data (FAQPage schema) and AI GEO. */
export const FAQ_ITEMS = [
  {
    question: "What is Bizzi Cloud?",
    answer:
      "Bizzi Cloud is cloud storage built for creators. Store and organize your projects—video, photo, design—in one place. From your Bizzi Byte SSD to the cloud, access your work anywhere, anytime. Fast, reliable, built for how creators work.",
  },
  {
    question: "Who can use this platform?",
    answer:
      "Bizzi Cloud is for creators of all kinds: videographers, photographers, designers, and creative teams. Solo creators, indie filmmakers, production houses, and agencies all use Bizzi Cloud to store, share, and deliver their work.",
  },
  {
    question: "Can I share files with external clients or partners?",
    answer:
      "Yes. Bizzi Cloud supports smart share links, password-protected delivery, and branded client pages. Share folders or individual files with anyone—clients, collaborators, or partners—without giving them full account access.",
  },
  {
    question: "How does Bizzi Cloud work with Bizzi Byte SSDs?",
    answer:
      "Bizzi Cloud extends your Bizzi Byte SSD workflow into the cloud. Upload from your SSD, sync across devices, and deliver to clients—all from one platform. Same philosophy: fast, reliable, built for creators.",
  },
] as const;

/** Unified config for metadata, robots, sitemap, manifest. */
export const siteConfig = {
  url: SITE_URL,
  name: SITE_NAME,
  shortName: "Bizzi Cloud",
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  ogImage: DEFAULT_OG_IMAGE,
} as const;
