# Phase 08: Performance and optimization

Started 2026-09-26 23:40 UTC from `d0df31b` (`phase-07-done`, deployed at 23:05/23:19 the same night). Rule followed: measure, change, measure again on the same data. The owner is asleep; decisions are made here and in `~/pricelens-work/morning-list.md`.

## How this was measured

- **Production, read-only:** table sizes and settings, `EXPLAIN ANALYZE` of the exact search SQL inside `BEGIN TRANSACTION READ ONLY`, pipeline counts from `scraping_jobs`, and sequential HTTP samples through nginx (n=15 for the API, n=8 for pages). Nothing was written to the production database or Redis. Production was not load-tested: it is live and shares 2 CPUs with other projects.
- **Same data, before and after:** a read-only `pg_dump --data-only` of the four search tables (categories, platforms, canonical_products, source_listings) was restored into a throwaway database (`pricelens_bench08`) on the **dev** Postgres at the deployed schema. The old SQL ran there, then the new migrations, then the new SQL. `apps/api/scripts/bench/search-sql.ts` prints the exact SQL `SearchService` runs for a fixed set of searches, so the benchmark is repeatable.
- **End to end after:** the built API (dev, port 13001) against that copy, and `next build && next start` (port 13000) against that API.
- **Lighthouse 12.8.2**, mobile preset (simulated 4G, 4x CPU slowdown), on this server's Chromium, median of 3 runs. This box is a shared 2-CPU ARM machine, so absolute TBT is higher than on a phone; compare rows, not against Google's field data.
- Bundle sizes are from `next build` (first-load JS, gzipped as Next reports them).

## Baseline (before any change)

| Area | Measurement | Before |
|---|---|---|
| Catalog | products / listings / match decisions | 16,856 / 10,079 / 72,390 |
| Postgres | shared_buffers / work_mem / pg_stat_statements | 128 MB / 4 MB / not installed |
| Search SQL (prod, warm) | "galaxy", page + count | 871 + 475 ms |
| | "iphone 15 pro" | 798 + 554 ms |
| | "سامسونج" (Arabic) | 1,324 + 1,673 ms |
| | "laptop" (category word) | 1,647 + 725 ms |
| | browse, no query | 106 + 221 ms |
| | type-ahead "gal" / "iphone 1" / "سامس" | 1,005 / 1,060 / 1,705 ms |
| Search API (prod, end to end) | "galaxy" p50 / p95 | 1,150 / 1,881 ms |
| | Arabic query p50 / p95 | 1,593 / 3,542 ms |
| | browse p50 / p95 | 324 / 367 ms |
| | type-ahead p50 / p95 | 1,174 / 1,823 ms |
| Product API (prod) | product / prices / history p95 | 78 / 68 / 82 ms |
| Pages (prod) | `/products/…` p50 / p95 | 178 / 253 ms, rendered on every request (`no-store`) |
| Bundle | `/products/[slug]` first load | 271 kB (116 kB of it the page: Recharts) |
| Bundle | home first load | 158 kB |
| Pipeline (prod, 7 days) | scrape jobs | 357 in 2 days (~7.5/hour); 288 completed, avg 56 s, p95 177 s; 65 failed in under 1 s (13 each at AliExpress, Amazon, Alibaba, Carrefour, Noon) |
| Pipeline | freshness | 4,143 of 10,144 listings seen in the last 24 h (41%), 7,049 in 7 days |

## Findings

| # | Where | Problem | Evidence | Sev | Status |
|---|---|---|---|---|---|
| P-01 | `search.service.ts` search + suggest | Every search and every keystroke ran `regexp_replace(translate(lower(title)))` (the Arabic normalizer) on every product row, several times per row in the relevance score. | ~60 µs per row: 0.8-1.7 s per search, 1.0-1.7 s per keystroke in prod. | P1 | **Fixed** |
| P-02 | `search.service.ts` | The page and its total ran the whole search twice (page query + `COUNT(*)` subquery). | Plans above: count as slow as the page. | P1 | **Fixed** |
| P-03 | `search.service.ts` | Category-name and category-search-term matches were correlated `EXISTS` subqueries, run once per joined row (7,469 loops for "galaxy"). | Plan: SubPlan loops=7469. | P2 | **Fixed** |
| P-04 | `canonical_products` | No index could serve `LIKE '%term%'` over title/brand/model/slug: four separate ILIKEs per term, sequential scan. | 386 ms of seq scan after P-01. | P1 | **Fixed** |
| P-05 | relevance score | The accessory penalty ran 16 `ILIKE`s on the raw title per matched row. | ~135 µs per row for "laptop". | P2 | **Fixed** |
| P-06 | `/products/[slug]` | Never cached: the route built as `ƒ`, prod answered `no-store`, so `revalidate = 300` did nothing (handoff A-13, 05). Two more blockers found on the way: `OfferList` used `useSearchParams` (ISR then fails; `/ar/products/…` returned **500** in the first test build), and English URLs are rewritten by middleware, which Next does not cache (it matches the original path against the prerender manifest). | Headers above; `app-page.js` `isSSG` check. | P1 | **Fixed** |
| P-07 | product page | Recharts (104 kB gzipped) in the first-load JS, for a chart below the offers. | Build: 271 kB first load. | P1 | **Fixed** |
| P-08 | browse (no query) | After P-01..P-05 the browse page was the slowest search: every product with a live offer grouped and ranked, then 20 products mapped. | p50 293 / p95 438 ms on the prod copy. | P2 | **Fixed** |
| P-09 | `/search` | CLS 0.159 on mobile: the result count arrives with the data and wraps the heading onto a second line, pushing the results down. | Lighthouse `layout-shifts`. | P1 | **Fixed** |
| P-10 | `canonical_products.title_embedding` | D-16: a 768-float column and an HNSW index, NULL on every production row (0 of 16,857), read by nothing since phase 02. | Read-only count. | P2 | **Fixed** (owner-approved) |
| P-11 | indexes | Never scanned since the stats reset (2026-09-25 restart): `canonical_products_title_trgm_idx` (GIN, 9.8 MB), `source_listings_title_trgm_idx` (5.6 MB), the two `normalized_title` btrees. | `pg_stat_user_indexes.idx_scan = 0`. | P2 | **Deferred**: two days of stats, and matching/reconciliation paths that run rarely may use them. Recheck after a week of traffic (handoff → 10). |
| P-12 | Postgres | Default memory settings; no `pg_stat_statements`, so slow queries are invisible in prod. The whole database is ~150 MB, so memory is not the bottleneck today. | `SHOW`. | P2 | **Needs decision** (D-30): enabling it restarts prod Postgres. |
| P-13 | client JS | High Total Blocking Time on every page (1.4-6 s on this host): React hydrates whole client pages (search, product detail, home sections), and the framework chunks alone are 103 kB. | Lighthouse `bootup-time`: `2803-*.js` 1.1-3.9 s of script. | P2 | **Deferred**: needs server-component refactors (the search page is one client component). Budget for home JS is met. Handoff → phase 09/10 backlog. |
| P-14 | i18n | Both dictionaries (en + ar) ship in the client bundle (~11 kB gzipped). | Handoff from 07. | P2 | **Deferred**: home is within budget (158 kB); passing one dictionary as a prop moves those bytes into every page's HTML instead. |
| P-15 | nginx | gzip only, no Brotli (Brotli is ~15% smaller on JS). | `Accept-Encoding: br` → uncompressed fallback to gzip. | P2 | **Deferred**: stock nginx has no Brotli module; needs a custom proxy image (phase 10). |
| P-16 | pipeline | 18% of scrape jobs fail in under a second at five stores (bot walls), and 59% of listings were not refreshed in the last 24 h. | `scraping_jobs`, `source_listings.last_seen_at`. | P2 | **Handoff → 10/11** (worker container, scrape concurrency, store blocks). |
| P-18 | `/search` | Results only started loading after the bundle downloaded, hydrated and called the API: a request waterfall in front of the LCP image (the first product photo). | Lighthouse: search LCP 4.1-6.1 s. | P1 | **Fixed** |
| P-19 | web → API | Every server-side call from the web (product pages, now the first search page) comes from one IP and shares one throttle bucket (100/min). Under real traffic those calls get 429s. | `ThrottlerModule` default 100/min per IP; `API_INTERNAL_URL` is called directly. | P2 | **Mitigated / handoff → 10**: search falls back to the browser on any error; product pages are now cached (fewer calls). A proper fix is an internal allowance for the web container (config + secret), part of the phase 10 container work. |
| P-17 | revalidation | On-demand revalidation when ingestion changes a price (A-13). | – | P2 | **Deferred → 10**: the web runs blue/green with no stable internal address, and ingestion moves to its own worker container in phase 10, which is where that hook belongs. Until then: 5-minute ISR, and the browser refetches prices after hydration when the cached HTML is older than 2 minutes. |

## Fixes

| # | Change |
|---|---|
| P-01 | Migration `20260927000000_search_text_columns`: generated columns `search_title` (normalized title) and `search_text` (normalized `concat_ws(' ', title, brand, model, slug)`, spelled with `\|\|` because a generated column must be immutable). Search, relevance and type-ahead read them. Declared in `schema.prisma` with `@ignore` (no client can write a generated column) and the introspected default, so `migrate diff` reports no drift. `test/integration/search-columns.integration.spec.ts` keeps the SQL in step with `normalizedTextSql()` for every character class the normalizer touches, and checks that an update regenerates them. |
| P-02 | One query per page: `COUNT(*) OVER ()` returns the total with the page; a separate count only runs for a page past the end. |
| P-03 | Category matches are `cp.category_id = ANY (ARRAY(SELECT id FROM categories WHERE …))`: an InitPlan run once per query, which the category index can join. The `categories` join is gone from search and suggest. |
| P-04 | One `search_text LIKE` per term replaces the title/brand/model/slug ILIKEs, and `canonical_products_search_text_trgm_idx` (GIN, `gin_trgm_ops`) serves it. Matching is the same or slightly more lenient (brand and model now also go through the Arabic normalizer); the 73 e2e tests, including every search-ranking case in English and Arabic, pass unchanged. |
| P-05 | The accessory penalty tests `search_title LIKE` (already lower-cased; the keywords are ASCII). |
| P-06 | `/products/[slug]`: `generateStaticParams` returns `[]` (cached after the first visit, re-rendered at most every 5 minutes). `OfferList` reads `?color` from `window.location` after mount instead of `useSearchParams`, so the offers stay in the server HTML. English product URLs are rewritten in `next.config.js` (`beforeFiles`) and excluded from the middleware matcher. The ISR cache stays in memory (`isrFlushToDisk: false`, 50 MB LRU): writing every product page ever crawled to the container's disk would be gigabytes. The page passes `fetchedAt`, and `useProduct` sets `initialDataUpdatedAt`, so a cached page older than the 2-minute stale time refetches prices after hydration. |
| P-07 | `PriceChart` loads with `next/dynamic` (`ssr: false`; it rendered a skeleton on the server already, because its colors come from the browser). |
| P-08 | Browse pages (no query text) are cached in Redis for 60 s, keyed on filters, page and sort. Searches with text are never cached: they queue a live scrape and the page refetches for what it finds. A Redis failure falls through to Postgres. `test/unit/search-browse-cache.spec.ts`. |
| P-09 | The count is always rendered with a reserved width (`min-w-32`, a non-breaking space while loading). |
| P-10 | Migration `20260927000100_drop_title_embedding`; the schema-drift test now allows no drift at all. |
| P-18 | `/search` is a server page now: it fetches the first page of results (2.5 s timeout, best effort) and hands it to the existing client component, which uses it as the query's initial data when the filters match. The HTML carries 20 results with their image preloads (checked per query, en and ar). Client navigations (filters, sort, paging) skip the server fetch (`RSC` header) and keep today's behavior: instant URL change, previous results dimmed while the browser fetches. |

## After

### Search SQL on the same data (copy of prod, 16,875 products / 10,095 listings; dev Postgres)

| Query | Before (page + count) | After (one query) |
|---|---|---|
| "galaxy" | 2,268 + 2,154 ms | 136 ms |
| "iphone 15 pro" | 1,498 + 1,824 ms | 114 ms |
| "سامسونج" (Arabic) | 3,401 + 3,260 ms | 148 ms |
| "laptop" (category word) | 1,623 + 893 ms | 106 ms |
| browse, no query | 115 + 258 ms | 74 ms |
| "galaxy", cheapest first | 1,643 + 870 ms | 39 ms |
| type-ahead "gal" / "iphone 1" / "سامس" | 2,642 / 3,177 / 2,234 ms | 98 / 90 / 40 ms |

The copy ran slower than prod before the change (the dev Postgres shares the box with builds and tests), so the fair comparison is within this table: 10-60x faster.

Migration cost, measured on the copy: the column migration rewrites `canonical_products` in **6.5 s** plus **2.5 s** for the GIN index, under an exclusive lock: search and product pages wait for those ~9 s during the deploy's migration step. Dropping the embedding took 48 ms.

### API end to end (built API against the copy, sequential n=15)

| Endpoint | Before (prod) p50 / p95 | After p50 / p95 |
|---|---|---|
| search "galaxy" | 1,150 / 1,881 ms | 159 / 311 ms (232 / 296 ms in a second run, box at load 14) |
| search Arabic | 1,593 / 3,542 ms | 165 / 240 ms |
| search "laptop" | – | 125 / 158 ms |
| browse, no query | 324 / 367 ms | 293 / 438 ms uncached; **33 / 76 ms** from the 60 s cache |
| type-ahead | 1,174 / 1,823 ms | 45-73 / 73-95 ms |
| product / prices | 58 / 78, 48 / 68 ms | 16 / 24, 7 / 17 ms |
| categories | 99 / 177 ms | 26 / 37 ms |

### Pages and bundles

| Measurement | Before | After |
|---|---|---|
| `/products/[slug]` build | `ƒ` (every request), first load 271 kB | `●` ISR, first load **167 kB** |
| `/products/…` response | `no-store`, 124-207 ms | first visit 504 ms (MISS), then **24 ms** (HIT), en and ar |
| home first load | 158 kB | 158 kB (budget 170 kB) |
| `/search` first load | 164 kB | 164 kB |

### Lighthouse (mobile, median of 3)

| Page | Before: prod, LCP / TBT / CLS / score | After, local build: LCP / TBT / CLS / score |
|---|---|---|
| home | 1,959 / 3,335 / 0 / 68 | 2,766 / 4,262 / 0 / 66 |
| search "galaxy" | 4,081 / 5,341 / **0.159** / 49 | 5,376 / 4,398 / **0** / 49 (6,139 / 6,703 before P-18) |
| search, category | 4,270 / 5,543 / **0.158** / 47 | 5,226 / 3,750 / **0** / 50 (6,356 / 6,615 before P-18) |
| product | 2,593 / 2,810 / 0 / 68 | 2,967 / 3,578 / 0 / 65 |
| `/ar` | 2,667 / 3,827 / 0 / 67 | 3,157 / 4,309 / 0 / 60 |

Read this table with care. Only CLS is a clean before/after. The timing columns come from two different setups on a box at **load average 13-15 on 2 CPUs** the whole time (production scrapers' Chromium, the AradoBot restart loop, D-29): "before" is production through nginx; "after" is `next start` calling a dev API on another origin (a CORS preflight per request, query logging on). Home did not change in this phase and still reads 0.8 s "slower", which is the setup, not the code. The fair comparison is inside the "after" column: server-rendering the search results (P-18) took search LCP from 6.1 to 5.4 s and TBT from 6.7 to 4.4 s under the same conditions. The remaining search LCP is the first product photo on a third-party store CDN (new connection, then decode), plus render delay on a throttled, overloaded CPU.

## Budgets

| Budget | Result |
|---|---|
| LCP < 2.5 s (mobile 4G) | **Not met in the lab on this host** (home ~2-2.8 s, product ~2.6-3 s, search ~5 s). Structural causes removed: the product page is cached and 104 kB lighter, search results arrive in the HTML. What remains is image loading from store CDNs and CPU on this overloaded box; field data after deploy is the real test. |
| INP < 200 ms | Not measurable in the lab (needs field data). Its lab proxy, TBT, is high on this host (P-13). |
| CLS < 0.1 | **Met**: 0 on every page measured (search was 0.159). |
| Home JS ≤ 170 kB gzipped | **Met**: 158 kB. |
| Search API p95 < 300 ms | **Met for text searches** except "galaxy" at 311 ms on a busy box (Arabic 240, "laptop" 158); browse is served from the 60 s cache after the first request. |

## Summary

- 19 findings (0 P0, 8 P1, 11 P2): 11 fixed, 5 deferred with reasons, 1 mitigated and handed off, 1 needs a decision, 1 handed off.
- Search is 10-60x faster in the database on the same data, and end to end drops from 1.2-1.6 s (p50) to 125-165 ms. Type-ahead goes from over a second to under 100 ms. Search results now arrive in the HTML.
- Product pages are cached for the first time (24 ms from cache) and load 104 kB less JavaScript.
- Search no longer shifts its layout.
- Gate: see the commit list; numbers are in the final section.
- Not deployed. The deploy runs two migrations (~9 s of locked search, see above).

## Remaining items

- P-11, P-13, P-14, P-15, P-17 are deferred (reasons in the table).
- Lighthouse on this host overstates TBT and LCP (load 13-15 during every run); field data (CrUX or a RUM beacon) would give real INP and LCP. Not added: it is a new dependency or an external service.
- Playwright against the production build (`next start`) on the prod-data copy: 19 passed, 1 skipped (theme toggle on mobile, by design); no console errors or hydration warnings signed out or in.

## Handoff → other phases

- → phase 10: on-demand revalidation from the ingestion worker (P-17); Brotli in the proxy image (P-15); recheck unused indexes after a week (P-11); scrape failures and freshness (P-16); a throttle allowance for the web's server-side API calls (P-19).
- → phase 09 (SEO): product pages are now ISR, so crawlers get cached HTML; unknown slugs return a real 404, cached for up to 5 minutes. The sitemap still lists products; a product created after a 404 was cached shows up within 5 minutes.
- → phase 11: 18% of scrape jobs fail within a second at five stores (bot walls).

## Decisions for Baraa

- **D-30 — `pg_stat_statements` in production Postgres.** It needs `shared_preload_libraries` and a Postgres restart (~10 s of downtime for the API). It is the only way to see slow queries in production after this phase. **Recommendation:** yes, at the next planned deploy.
- **D-15 (asked again, as you said after measuring):** the normalized-title backfill. Measured: 66 of 16,943 products have Arabic titles, 20 of them with live offers. Search now also matches Arabic spellings through `search_text`, so the backfill helps fewer searches than when it was proposed. **Recommendation:** run it anyway (dry run, then `--apply`, rollback file), low priority.
- **D-20 (CSP nonces), revisited with caching as asked:** nonces require rendering every page per request, which undoes the product-page caching this phase added. **Recommendation:** keep `'unsafe-inline'` (as now).
- FYI, behavior: product pages can be up to 5 minutes old in the HTML; the prices refresh in the browser right after load when the copy is older than 2 minutes. Browse pages (no search text) can be up to 60 s old.
