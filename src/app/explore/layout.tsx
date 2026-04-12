import type { Metadata } from "next";
import type { ReactNode } from "react";
import ExploreJsonLd from "@/components/explore/ExploreJsonLd";
import {
  EXPLORE_DESCRIPTION,
  EXPLORE_KEYWORDS,
  EXPLORE_OG_IMAGE_ALT,
  EXPLORE_PAGE_PATH,
  EXPLORE_TITLE,
  explorePageUrl,
} from "@/content/explore-seo";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

const exploreUrl = explorePageUrl();
const exploreOgImagePath = `${EXPLORE_PAGE_PATH}/opengraph-image`;

export const metadata: Metadata = {
  title: {
    absolute: EXPLORE_TITLE,
  },
  description: EXPLORE_DESCRIPTION,
  keywords: [...EXPLORE_KEYWORDS],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "technology",
  alternates: {
    canonical: exploreUrl,
    languages: { "en-US": exploreUrl },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: exploreUrl,
    siteName: SITE_NAME,
    title: EXPLORE_TITLE,
    description: EXPLORE_DESCRIPTION,
    images: [
      {
        url: exploreOgImagePath,
        width: 1200,
        height: 630,
        alt: EXPLORE_OG_IMAGE_ALT,
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: EXPLORE_TITLE,
    description: EXPLORE_DESCRIPTION,
    images: [exploreOgImagePath],
  },
};

export default function ExploreLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ExploreJsonLd />
      {children}
    </>
  );
}
