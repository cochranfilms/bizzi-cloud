import { EXPLORE_NAV, EXPLORE_FAQ } from "@/content/explore-sections-data";
import {
  EXPLORE_CONTENT_DATE_MODIFIED,
  EXPLORE_DESCRIPTION,
  EXPLORE_OG_IMAGE_ALT,
  EXPLORE_TITLE,
  exploreOgImageUrl,
  explorePageUrl,
} from "@/content/explore-seo";
import { ORGANIZATION, SITE_URL } from "@/lib/seo";

const PAGE_URL = explorePageUrl();
const OG_IMAGE_URL = exploreOgImageUrl();

function itemListElementsForToc(): Record<string, unknown>[] {
  const out: { name: string; url: string }[] = [];
  for (const n of EXPLORE_NAV) {
    out.push({ name: n.label, url: `${PAGE_URL}#${n.id}` });
    if (n.children) {
      for (const c of n.children) {
        out.push({ name: `${n.label}: ${c.label}`, url: `${PAGE_URL}#${c.id}` });
      }
    }
  }
  return out.map((item, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: item.name,
    item: item.url,
  }));
}

/**
 * Single JSON-LD @graph: Organization, WebSite, WebPage, BreadcrumbList, ItemList (TOC), FAQPage.
 * Optimized for search + AI/GEO entity linking.
 */
export default function ExploreJsonLd() {
  const webPageId = `${PAGE_URL}#webpage`;
  const websiteId = `${SITE_URL}/#website`;
  const orgId = `${SITE_URL}/#organization`;

  const organization = {
    "@type": "Organization",
    "@id": orgId,
    name: ORGANIZATION.name,
    legalName: ORGANIZATION.legalName,
    url: ORGANIZATION.url,
    logo: { "@type": "ImageObject", url: ORGANIZATION.logo },
    description: ORGANIZATION.description,
    sameAs: ORGANIZATION.sameAs,
  };

  const webSite = {
    "@type": "WebSite",
    "@id": websiteId,
    name: "Bizzi Cloud",
    url: SITE_URL,
    publisher: { "@id": orgId },
    inLanguage: "en-US",
  };

  const webPage = {
    "@type": "WebPage",
    "@id": webPageId,
    url: PAGE_URL,
    name: EXPLORE_TITLE,
    headline: EXPLORE_TITLE,
    description: EXPLORE_DESCRIPTION,
    inLanguage: "en-US",
    isPartOf: { "@id": websiteId },
    about: {
      "@type": "Thing",
      name: "Bizzi Cloud creative cloud storage and media workflow platform",
      description:
        "Cloud storage, editing workflows, client proofing, and delivery for photographers, videographers, and creative teams.",
    },
    publisher: { "@id": orgId },
    dateModified: EXPLORE_CONTENT_DATE_MODIFIED,
    primaryImageOfPage: {
      "@type": "ImageObject",
      url: OG_IMAGE_URL,
      width: 1200,
      height: 630,
      caption: EXPLORE_OG_IMAGE_ALT,
    },
    breadcrumb: { "@id": `${PAGE_URL}#breadcrumb` },
  };

  const breadcrumb = {
    "@type": "BreadcrumbList",
    "@id": `${PAGE_URL}#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Explore Bizzi", item: PAGE_URL },
    ],
  };

  const tocList = itemListElementsForToc();

  const itemList = {
    "@type": "ItemList",
    "@id": `${PAGE_URL}#toc`,
    name: "Explore Bizzi — table of contents",
    description: "In-page sections and anchors for the Explore Bizzi guide.",
    numberOfItems: tocList.length,
    itemListElement: tocList,
  };

  const faqPage = {
    "@type": "FAQPage",
    "@id": `${PAGE_URL}#faq`,
    mainEntity: EXPLORE_FAQ.map((item) => ({
      "@type": "Question",
      "@id": `${PAGE_URL}#faq-${item.id}`,
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  const payload = {
    "@context": "https://schema.org",
    "@graph": [organization, webSite, webPage, breadcrumb, itemList, faqPage],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
    />
  );
}
