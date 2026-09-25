# Phase 08 — Performance & optimization

Rule: measure first, optimize second, measure again. No optimization without a number proving it helped.

## Measure (record baseline table in the audit)
- Lighthouse (mobile, throttled) on: home, search results, product page, category page.
- Core Web Vitals: LCP, INP, CLS.
- Bundle analyzer: JS per route, largest dependencies.
- API: p50/p95 latency on hot endpoints (search, product, offers) under load (k6 or autocannon).
- DB: slow query log + EXPLAIN ANALYZE on hot queries.
- Pipeline/queue: jobs per minute, time per matching run, time per store refresh.

## Frontend
- next/image with correct sizes + priority on LCP image; next/font with Arabic subset.
- Cut client JS: fewer client components, lazy-load below-the-fold/heavy widgets, replace heavy libs.
- Streaming with Suspense for slow sections; no request waterfalls.
- No CLS from images, fonts, or late-loading banners.

## Backend
- Cache strategy: Redis for hot search/product reads with short TTLs, invalidated when prices change.
- Indexes, query shape, batching, connection pooling (Prisma pool size, pgbouncer if needed).
- pgvector query tuning (index params vs recall; don't sacrifice matching precision).
- Queue concurrency and batching tuned; pipeline steps parallelized where safe.
- Compression, HTTP caching headers for static assets.

## Budgets (targets)
LCP < 2.5s on mid-range mobile 4G · INP < 200ms · CLS < 0.1 · home route JS ≈ ≤170KB gzipped · search API p95 < 300ms.

## Definition of done
Before/after table for every metric. Budgets met or gaps explained. No regressions in tests or matching precision. `audit/08-optimization.md` written.
