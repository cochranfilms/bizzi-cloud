/**
 * JSON-LD for /waitlist — rich context for Google Search Console, AI citations (GEO),
 * and entity disambiguation ("Bizzi Cloud" + waitlist intent).
 */

import { JsonLd } from "./JsonLd";
import {
  ORGANIZATION,
  SITE_NAME,
  SITE_URL,
  WAITLIST_DESCRIPTION,
  WAITLIST_OG_IMAGE,
  WAITLIST_PATH,
  WAITLIST_TITLE,
} from "@/lib/seo";

export function WaitlistPageStructuredData() {
  const waitlistUrl = SITE_URL + WAITLIST_PATH;
  const orgId = SITE_URL + "/#organization";
  const webPageId = waitlistUrl + "#webpage";

  const webPage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": webPageId,
    name: WAITLIST_TITLE,
    headline: WAITLIST_TITLE,
    description: WAITLIST_DESCRIPTION,
    url: waitlistUrl,
    inLanguage: "en-US",
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
    },
    primaryImageOfPage: {
      "@type": "ImageObject",
      url: WAITLIST_OG_IMAGE,
      width: 1200,
      height: 630,
    },
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: ["#waitlist-hero", "#waitlist-form-intro"],
    },
    publisher: { "@id": orgId },
    about: {
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
    },
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: SITE_URL,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Waitlist",
        item: waitlistUrl,
      },
    ],
  };

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": orgId,
    name: ORGANIZATION.name,
    url: ORGANIZATION.url,
    logo: ORGANIZATION.logo,
    description: ORGANIZATION.description,
  };

  return <JsonLd data={[webPage, breadcrumb, organization]} />;
}
