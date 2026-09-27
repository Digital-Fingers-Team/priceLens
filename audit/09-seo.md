# Phase 09: SEO

Started 2026-09-27 02:25 UTC from `eb52b7c` (`phase-08-done`, not deployed; production runs `d0df31b`). The owner is asleep: decisions are made and recorded here and in `~/pricelens-work/morning-list.md`.

## How this was audited

- Production HTML, read-only (`curl` of every public route in English and Arabic): canonical, robots meta, hreflang, `<title>`, number of `<h1>`, JSON-LD.
- Code: `app/sitemap.ts`, `app/robots.ts`, `lib/seo.ts`, every `page.tsx`/`layout.tsx` (which can export metadata, which are client components), the product page's JSON-LD, the categories API.
- Production data, read-only: `product_merges` (0 rows: the merge log is new since phase 03), Arabic-titled products (66 of 16,943).

## Audit (before any change)

| # | Where | Problem | Evidence | Sev | Fix |
|---|---|---|---|---|---|
| SEO-01 | `lib/seo.ts` `baseMetadata.alternates.canonical: '/'`, spread by the `[locale]` layout | Every page without its own canonical declares **the home page** as its canonical: `/search`, `/pricing`, `/deal-hunter`, `/login`, `/watchlist`, `/ar/pricing`, … Google is asked to fold them all into the home page. | `<link rel="canonical" href="https://pricelens.work.gd">` on all of them (prod). | P0 | Canonical per page only; none inherited. |
| SEO-02 | all pages but home and product | The same `<title>Pricelens</title>` and site description everywhere. | prod HTML. | P1 | Unique, localized titles and descriptions per page. |
| SEO-03 | whole site | No hreflang: the English and Arabic versions of a page do not point at each other, and there is no `x-default`. | No `<link rel="alternate" hreflang>` anywhere; sitemap without alternates. | P1 | `alternates.languages` en / ar / x-default on every indexable page and in the sitemap. |
| SEO-04 | `/login`, `/register`, `/watchlist`, `/notifications`, `/account/*`, `/seller/*`, `/admin/*` | Private or utility pages are `index, follow`, and `/watchlist` is in the sitemap. | prod HTML; `sitemap.ts`. | P1 | `noindex, follow`; out of the sitemap. |
| SEO-05 | `/search?…` | Every query, filter, sort and page combination is an indexable URL (with the home page as canonical, SEO-01): an unbounded set of thin duplicates. | – | P1 | `noindex, follow` for search results with a query or filters; the plain browse page stays indexable, canonical to itself. |
| SEO-06 | categories | No category pages: a category is only `/search?categoryId=<uuid>`. Nothing links to categories, so crawlers have no entry point between the home page and 16,000 products. | Categories API: 11 categories, 312-3,813 products each, with slugs. | P1 | Server-rendered, cached `/categories/[slug]` pages with a heading, crawlable pagination, and links from the home page, footer and product breadcrumbs. |
| SEO-07 | structured data | Only `Product` on product pages. No `BreadcrumbList`, `Organization`, or `WebSite` with `SearchAction`; no visible breadcrumbs either. | prod HTML. | P1 | Visible breadcrumbs + `BreadcrumbList` on product and category pages; `Organization` and `WebSite`/`SearchAction` on the home page. |
| SEO-08 | `/search` | No `<h1>` in the HTML: the page bailed out to client rendering. | prod: 0 `<h1>`. | P2 | Fixed by phase 08 P-18 (server-rendered results); checked below. |
| SEO-09 | merged products | A product merged into another (reconciliation) answers 404 at its old URL; its links and ranking are lost. | `product_merges` keeps the merged row (with its slug). | P2 | 301 (permanent redirect) to the product it was merged into. |
| SEO-10 | Open Graph | Product pages share the store's 300x300 thumbnail as a `summary_large_image` card; everything else shares one static image. | prod meta. | P2 | Generated 1200x630 product images (`next/og`, no new dependency) with the brand, the title, the lowest price and the store count. |
| SEO-11 | `robots.ts` | `/api/` is crawlable (JSON endpoints and the affiliate redirect); `host` is a Yandex-only directive. | `robots.txt`. | P2 | `Disallow: /api/`; drop `host`. |
| SEO-12 | `sitemap.ts` | No category pages, no language alternates, a private page (SEO-04). | – | P2 | Categories and products with en/ar alternates; static pages only where indexable. |
| SEO-13 | 404 page | Links to search, but has no search box. | `not-found.tsx`. | P2 | The search box on the 404 page. |
| SEO-14 | product page | No related products: a product page links only back to search. | – | P2 | "More in <category>" links (server-rendered, cached with the page). |
| SEO-15 | Arabic slugs | Product slugs are Latin (from store titles, mostly English); the Arabic site uses the same slugs under `/ar/`. | – | – | Decision for Baraa (below). |
| SEO-16 | old soft-404 URLs | Before phase 05, unknown products answered 200 with a "not found" view. Whether Google still holds those URLs can only be seen in Search Console. | Carried over. | – | Owner action (below). |
| SEO-17 | API throttling behind the proxy | Found by the crawl: server-side calls from the web share one throttle bucket, so a crawler loading pages quickly turned 316 of 500 pages into 500s (699 throttled API calls). Checked in production: nginx sees **every visitor** as `10.89.1.7` (rootless podman port forwarding hides the source address; a request from outside, 196.154.91.231, logged as 10.89.1.7). So all visitors, the web's own calls and Googlebot share one bucket: 100 API calls a minute for the whole site, 10 logins, 5 registrations. | proxy access log; dev API log. | P0 | **Needs decision (D-31)**: an infrastructure change to the production proxy. Not fixed here. |
| SEO-18 | language switch | Pages built ahead of time report their route path (`/en/pricing`), so the "العربية" link pointed at `/ar/en/pricing` (404). A phase 07 bug, found by the crawl. | crawl. | P2 | Fixed. |

## Fixes

| # | Change |
|---|---|
| SEO-01 | `baseMetadata` no longer sets a canonical (or `og:url`); every indexable page sets its own through `localizedAlternates(locale, path)` (`lib/seo.ts`). |
| SEO-02 | Unique, localized titles and descriptions: search, pricing, Deal Hunter, category pages (new `seo` dictionary section, English and Arabic); products and home already had them. |
| SEO-03 | `localizedAlternates` returns the canonical plus `en`, `ar` and `x-default` alternates; used by home, search, pricing, Deal Hunter, categories and products. |
| SEO-04 | Metadata-only server layouts for the client pages: watchlist, notifications, account, seller, login, register get `noindex, follow`; admin pages too. |
| SEO-05 | `/search` with a query, filter, sort or page > 1 is `noindex, follow`, canonical `/search`; the plain browse page stays indexable. |
| SEO-06 | `/categories/[slug]` (and `/ar/…`): server-rendered, heading, product count, the category's products (most stores first), crawlable `?page=N` links (each page its own canonical), "Filter and sort" into search, links to every other category. The home page lists all categories. Empty categories are `noindex`. |
| SEO-07 | Visible breadcrumbs (product: Home › Category › Product, replacing the "Back to search" link, which went to a blank /search; category: Home › Category) with `BreadcrumbList` JSON-LD; `WebSite` + `SearchAction` and `Organization` on the home page. Product JSON-LD: `offerCount` counts the offers the page shows (it counted every listing ever matched), plus `gtin` and `mpn` when known. |
| SEO-08 | Checked: `/search` has one `<h1>` in the HTML now (phase 08 server rendering). |
| SEO-09 | `ProductsService.getBySlug` resolves a slug through `product_merges` (following chains, ignoring undone merges) and returns the product it lives on now; the web page answers with a permanent redirect (308) to that product's URL. Integration test `merged-product-slug.integration.spec.ts`. |
| SEO-10 | `opengraph-image.tsx` / `twitter-image.tsx` for products: a 1200x630 card with the brand, title, lowest price and store count, colors from `design-tokens.js`; English product image URLs are rewritten like the pages. |
| SEO-11 | `robots.txt`: `Disallow: /api/`, no `host`. Private pages stay crawlable so their `noindex` is seen. |
| SEO-12 | Sitemap: indexable static pages, every category, and products with a live offer, each in English and Arabic with hreflang alternates; `/watchlist` removed. |
| SEO-13 | The 404 page has a search box. |
| SEO-14 | "More in <category>" on product pages: four of the category's best-covered products, rendered with the cached page. |
| SEO-18 | `splitLocale` treats `/en/...` as English. |

## Verification

- **Crawl** (`next build && next start` against the dev API and database, a crawler following every internal link in both languages from `/`, `/ar` and the sitemap; 700 pages): **0 broken links**, 0 problems. Every indexable page had a canonical to itself, `en`/`ar`/`x-default` hreflang, exactly one `<h1>`, a unique title, and JSON-LD that parses (`Product` + `BreadcrumbList` on products, `BreadcrumbList` on categories, `WebSite` + `Organization` on home). 234 `noindex` pages: search variants, login, register, watchlist. The only 404 was the deliberate unknown-product probe. Sitemap: 508 URLs, 1,524 hreflang links, no private pages.
- The first crawl hit SEO-17 (316 × 500 from throttling) and SEO-18 (3 × 404); the dev API was restarted with `THROTTLE_LIMIT` raised to test the SEO work itself.
- Share images: 200 `image/png` in English, Arabic and the Twitter variant.
- Gates: API tsc/eslint/build, unit **543**, integration **54** (4 new), e2e **73**; web typecheck, lint, vitest **79**, build. Playwright against the production build: **19 passed, 1 skipped** (theme toggle on mobile, by design). The first Playwright run failed 10 tests because the dev database lacked phase 08's migrations (`column cp.search_text does not exist`); after `migrate deploy` on the dev database, all green.
- Structured data was checked for shape and consistency with the page, not with Google's Rich Results Test (an external service).

## Summary

- 18 findings (1 P0 + 1 P0 needing a decision, 7 P1, 9 P2): 16 fixed, 1 needs a decision (SEO-17 / D-31), 1 owner action (SEO-16), plus the Arabic slug decision (SEO-15).
- The worst live problem, every page naming the home page as its canonical, is fixed in code; it stays live until the deploy.
- Not deployed. The owner chose to deploy phases 08 and 09 together.

## Remaining items

- SEO-17 (D-31): the shared rate-limit bucket. Until it is fixed, a crawler burst can still get 500s on product pages in production.
- The category pages list the API's English category names where the dictionary has none; the 11 current categories all have Arabic names.
- No `/categories` index page; the home page and every category page link to all categories.

## Handoff → other phases

- → phase 10: SEO-17 / D-31 (proxy networking that keeps visitors' addresses; after that, a throttle allowance for the web's own calls).
- → phase 11: nothing new.

## Decisions for Baraa

- **D-31 (new, P0): every visitor has the same IP address as far as the API knows.** Rootless podman's port forwarding hides where connections come from, so nginx logs `10.89.1.7` for everyone (checked with a request from outside). Consequences today: one rate-limit bucket for the whole site (100 API calls a minute, 10 logins, 5 registrations), so a few busy users or one crawler lock everyone out; per-IP records (affiliate clicks, abuse limits) are meaningless. **Recommendation:** in phase 10, run the proxy so it sees real addresses (for example podman's `pasta` network mode or `slirp4netns` with its own port handler, both keep the source address), then give the web's server-side calls their own allowance. It restarts the proxy (a few seconds), so it needs your OK.
- **SEO-15, Arabic slugs:** product URLs use the Latin slug in both languages (`/ar/products/galaxy-a57-…`). Titles come from the stores and are mostly English, and one slug per product keeps redirects, sharing and hreflang simple. **Recommendation:** keep Latin slugs.
- **SEO-16, owner action:** in Google Search Console, check "Pages → Not indexed → Soft 404" and request removal of old product URLs that now 404, if any remain from before phase 05.
- FYI: the "Back to search" link on product pages is replaced by breadcrumbs (Home › Category › Product); it went to an empty /search, not back to the results.
