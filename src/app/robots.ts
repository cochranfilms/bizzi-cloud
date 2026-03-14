import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = siteConfig.url;

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard/",
          "/enterprise/",
          "/admin/",
          "/account/",
          "/invite/",
          "/desktop/app/",
          "/client",
        ],
      },
      {
        userAgent: "GPTBot",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard/",
          "/enterprise/",
          "/admin/",
          "/account/",
          "/invite/",
          "/desktop/app/",
          "/client",
        ],
      },
      {
        userAgent: "ChatGPT-User",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard/",
          "/enterprise/",
          "/admin/",
          "/account/",
          "/invite/",
          "/desktop/app/",
          "/client",
        ],
      },
      {
        userAgent: "Claude-Web",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard/",
          "/enterprise/",
          "/admin/",
          "/account/",
          "/invite/",
          "/desktop/app/",
          "/client",
        ],
      },
      {
        userAgent: "anthropic-ai",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard/",
          "/enterprise/",
          "/admin/",
          "/account/",
          "/invite/",
          "/desktop/app/",
          "/client",
        ],
      },
      {
        userAgent: "PerplexityBot",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard/",
          "/enterprise/",
          "/admin/",
          "/account/",
          "/invite/",
          "/desktop/app/",
          "/client",
        ],
      },
      {
        userAgent: "Google-Extended",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard/",
          "/enterprise/",
          "/admin/",
          "/account/",
          "/invite/",
          "/desktop/app/",
          "/client",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
