/**
 * JSON-LD structured data for the homepage.
 * Enables rich results in Google and AI GEO citations in ChatGPT, Perplexity, etc.
 */

import { JsonLd } from "./JsonLd";
import {
  SITE_URL,
  ORGANIZATION,
  SITE_NAME,
  SITE_DESCRIPTION,
  FAQ_ITEMS,
} from "@/lib/seo";
import { plans, freeTier } from "@/lib/pricing-data";

export function HomePageStructuredData() {
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: ORGANIZATION.name,
    legalName: ORGANIZATION.legalName,
    url: ORGANIZATION.url,
    logo: ORGANIZATION.logo,
    description: ORGANIZATION.description,
    foundingDate: ORGANIZATION.foundingDate,
    sameAs: ORGANIZATION.sameAs,
  };

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    publisher: { "@id": `${SITE_URL}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/?s={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };

  const softwareApp = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, macOS",
    description: SITE_DESCRIPTION,
    offers: {
      "@type": "AggregateOffer",
      lowPrice: "0",
      highPrice: String(Math.max(...plans.map((p) => p.price), 0)),
      priceCurrency: "USD",
      offerCount: plans.length + 1,
    },
  };

  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    brand: { "@type": "Brand", name: "Bizzi Cloud" },
    offers: [
      {
        "@type": "Offer",
        name: freeTier.name,
        price: "0",
        priceCurrency: "USD",
        description: freeTier.description,
      },
      ...plans.slice(0, 3).map((p) => ({
        "@type": "Offer",
        name: p.name,
        price: String(p.price),
        priceCurrency: "USD",
        description: p.features.slice(0, 2).join(". "),
      })),
    ],
  };

  return (
    <JsonLd
      data={[
        { ...organization, "@id": `${SITE_URL}/#organization` },
        website,
        softwareApp,
        faqPage,
        productSchema,
      ]}
    />
  );
}
