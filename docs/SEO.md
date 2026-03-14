# Bizzi Cloud – SEO & AI GEO Optimization

This document summarizes the SEO and AI Generative Engine Optimization (GEO) setup for Bizzi Cloud.

## Overview

The site is optimized for:

- **Traditional search engines**: Google, Bing, Yandex, DuckDuckGo
- **AI-powered search**: ChatGPT, Perplexity, Google AI Overviews, Claude
- **Social sharing**: Open Graph (Facebook, LinkedIn) and Twitter Cards

## Implemented Optimizations

### 1. Core Infrastructure

| File | Purpose |
|------|---------|
| `src/lib/seo.ts` | Central SEO config (URL, meta, FAQ data, organization) |
| `src/app/robots.ts` | Crawler rules for all bots including GPTBot, PerplexityBot, Claude |
| `src/app/sitemap.ts` | Sitemap with homepage, desktop, login |
| `src/app/manifest.ts` | PWA manifest for installability |

### 2. Metadata & Open Graph

- **Root layout** (`src/app/layout.tsx`): `metadataBase`, title template, OG images, Twitter cards
- **Page-level metadata**: Desktop, login, and client layouts have specific titles, descriptions, and canonicals
- **Default OG image**: `src/app/opengraph-image.tsx` generates a 1200×630 share image

### 3. Structured Data (JSON-LD)

`HomePageStructuredData` injects:

- **Organization** – Brand and legal info
- **WebSite** – Search action, publisher
- **SoftwareApplication** – App category, OS, pricing
- **FAQPage** – FAQ content for rich results and AI answers
- **Product** – Plans and offers

### 4. AI GEO Specifics

- **FAQPage schema** – Helps AI engines cite and surface answers
- **Microdata on FAQ** – Schema.org `itemScope` / `itemProp` for redundancy
- **Robots** – Explicit rules for GPTBot, PerplexityBot, Claude-Web, anthropic-ai, Google-Extended
- **Clear copy** – Definitional answers (e.g., “What is Bizzi Cloud?”) for AI summarization

### 5. Canonical URLs

- Homepage: `metadataBase` and root canonical
- Desktop: `/desktop` canonical
- Login: `/login` canonical  
- Client: `/client` canonical

## Environment Configuration

Set `NEXT_PUBLIC_APP_URL` in `.env.local` for production (e.g. `https://www.bizzicloud.io`).  
Used for:

- `metadataBase` and absolute OG image URLs
- Sitemap and robots
- Canonical URLs

## Google Search Console

At launch:

1. Add property at [search.google.com/search-console](https://search.google.com/search-console)
2. Add verification meta tag in `src/app/layout.tsx`:

```ts
verification: {
  google: "your-verification-code",
},
```

3. Submit `sitemap.xml` in Search Console (e.g. `https://www.bizzicloud.io/sitemap.xml`)

## Sitemap

`/sitemap.xml` includes:

- `/` (homepage)
- `/desktop`
- `/login`

Dynamic routes (galleries, studios, transfers) can be added later if needed.

## Robots Rules

- **Allowed**: `/`, `/desktop`, `/login`, public galleries (`/p/[slug]`, `/[handle]/[gallerySlug]`), transfers (`/t/[slug]`)
- **Disallowed**: `/api/`, `/dashboard/`, `/enterprise/`, `/admin/`, `/account/`, `/invite/`, `/desktop/app/`, `/client`

## Adding New Marketing Pages

1. Add route in `src/app/`
2. Add to `sitemap.ts`
3. Add a `layout.tsx` with `metadata`, `openGraph`, `twitter`, and `alternates.canonical` if appropriate
