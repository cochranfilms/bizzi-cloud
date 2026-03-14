import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/seo";

/**
 * Sitemap for SEO and AI GEO discoverability.
 * Crawlable pages include marketing, desktop, login, and public share URLs.
 * Dynamic routes (galleries, studios, transfers) are not included here
 * as they require database access—add server-side generation if needed.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = siteConfig.url;
  const now = new Date().toISOString();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/desktop`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/login`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  return staticPages;
}
