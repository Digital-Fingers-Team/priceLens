# Phase 09 — SEO

Price comparison sites live on search traffic. Product and category pages are the main entry points.

## Technical
- Product and category pages server-rendered (content in initial HTML). ISR/revalidate aligned with price freshness.
- Metadata API per page: unique templated titles/descriptions (e.g. product name + lowest price + number of stores), no duplicates.
- Canonical URLs everywhere. Filter/sort/tracking params: canonical to the clean URL or noindex, to avoid duplicate-content explosion.
- Pagination handled cleanly and crawlable.
- Dynamic `sitemap.xml` (split into sitemap index for large catalogs) + `robots.txt`.
- hreflang ar / en + x-default (if bilingual). Slug strategy for Arabic → "Decisions for Baraa" with recommendation.
- Removed products → 410 or redirect to category; changed slugs → 301. Real 404 page with search.
- Clean HTML: one h1, logical headings, descriptive alt text.

## Structured data (JSON-LD)
- Product + AggregateOffer (lowPrice, highPrice, offerCount, priceCurrency, availability) on product pages. Values must match what's on the page.
- BreadcrumbList, Organization, WebSite with SearchAction.
Validate with a schema validator and fix all errors/warnings.

## Social
Open Graph + Twitter cards; dynamic OG images (next/og) for product pages with brand styling.

## Content & linking
- Product pages must have unique value beyond scraped text: comparison table, price history, specs summary.
- Internal linking: breadcrumbs, categories, related products, popular searches.
- Outbound store/affiliate links: rel="sponsored nofollow" (or as appropriate).

## Definition of done
Every indexable page has unique metadata, canonical, valid structured data. Sitemap and robots correct. Crawl the local site (e.g. a crawler script) with zero broken links. `audit/09-seo.md` written.
