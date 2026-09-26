# Phase 03 — Backend audit

Started 2026-09-26 from `a2ca40c` (tag `phase-02-done`). Evidence was gathered on the isolated dev stack (`pricelens-dev` Postgres/Redis, demo catalog of 240 products, the built API on port 13001 with store connectors off). Nothing in production was touched.

Baseline gate at the start: api unit **504**, integration **29**, e2e **32**, all green.

Production containers at the start (checked again at the end):
`pricelens-api 2026-09-25 23:35:13 rc=2 · pricelens-web-green 17:32:06 rc=0 · pricelens-proxy 11:42:35 · pricelens-postgres 11:37:34 · pricelens-redis 11:37:34`

Scope notes:
- **Meilisearch:** there is none. ADR 0003 (phase 01) removed it; search is Postgres. The prompt's Meilisearch checks were applied to Postgres search instead: empty query, Arabic handling, typo tolerance. Phase 02 already covered Arabic with 20 real-query ranking tests.
- **Cursor pagination:** decided per list, not blanket:
  - Append-only feeds use a cursor, and already did: notifications, competitor events.
  - Ranked result sets keep page/limit: search, the admin review queue. Relevance order has no stable cursor key, and the web UI shows page numbers.
  - Every other list is capped by a plan limit or a hard `take`.
  - All of them are now validated and documented.

## Findings

Severity: P0 broken/unsafe · P1 real user/business harm · P2 polish.

### P0

**B-01 — With Redis unreachable, the API never starts, and when Redis drops later every signed-in request hangs** (handoff 00-a).
- Where:
  - `workers/ingestion.scheduler.ts:39` and `affiliate/affiliate-conversion.scheduler.ts:18` `await queue.getRepeatableJobs()` in `onModuleInit`. Bull queues the command until Redis connects, so bootstrap never reaches `listen()`.
  - The cache client (`app.module.ts`, ioredis defaults: offline queue on, no command timeout) makes `EntitlementsService.getEntitlements` wait forever. Its try/catch never sees an error.
  - `ProductsService.triggerOnDemandLiveFetch` awaits `queue.add` inside the search request.
- Evidence: the dev API started with `REDIS_PORT=6390` did not answer `/health` within 60 s. The log shows 49 `[ioredis] Unhandled error event: ECONNREFUSED` lines and `MaxListenersExceededWarning`.
- Why it matters:
  - A Redis restart or a slow Redis at deploy time takes the whole site down, not just background jobs.
  - A Redis blip mid-day hangs every page that checks a plan.
- Fix:
  - Register repeatable jobs in the background after bootstrap, retrying with backoff.
  - Cache client: offline queue off, 1 s command timeout, capped reconnect backoff, a logged error listener. Cache misses fall back to Postgres, which the code already does.
  - Queue producers time out after 2 s instead of hanging the request.

### P1

**B-02 — Unvalidated input on public endpoints** (handoff 00-d).
- Where: `search.controller.ts` (every param a raw string), `products.controller.ts` listings page/limit, `prices.controller.ts` `days`, `public-api.controller.ts` `brand/category/type/since/limit`, `seller.controller.ts` / `brand.controller.ts` `limit`/`unacknowledgedOnly`, `api-keys.controller.ts` `days`, `notifications.controller.ts` `:type`, `affiliate-conversions.controller.ts` `status`, `deal-hunter` `interpret?q`.
- Evidence (dev API):
  - `GET /search?minPrice=abc` → 200 with `total: 0`. It should be a 400; instead it silently reports "no products".
  - `GET /search/suggest?q=ap&limit=-1` → **40 items**: `slice(0, -1)` returns every match but one. `limit=100000` → 41.
  - `GET /search?extra=1` and `sortBy=bogus` → 200. Unknown params are accepted, despite `forbidNonWhitelisted`.
  - A 5,000-character `q` → 200 and a scrape job keyed by the 5,000-character string.
- Fix: query/param DTOs with class-validator on every endpoint (the global pipe already whitelists and forbids extra fields once a DTO exists). Bounds: `q` ≤ 200 characters, `limit` 1–100, `page` ≥ 1, enums for sort/tier/status/type.

**B-03 — Admin and affiliate-config bodies are TypeScript interfaces, so nothing validates them.**
- Where: `admin.controller.ts:8-20` (`RunLiveIngestionBody`, `RunReconciliationBody`, `RunStoreCoverageSweepBody`), `resolveReviewItem(@Body() body: ResolveReviewItemInput)`, `affiliate.controller.ts upsertConfig(@Body() body: UpsertAffiliateConfigInput)`.
- Why it matters: an interface has no runtime metatype, so `ValidationPipe` skips it. An admin typo (`limitPerQuery: "50"`) is silently dropped, and `maxPairs: 1e9` goes straight into a job. The affiliate config upsert writes whatever it is sent.
- Fix: class DTOs.

**B-04 — Login is never DTO-validated** (handoff 00-f).
- Where: `auth.controller.ts:40`. The `AuthGuard('local')` guard runs before pipes, so `LoginDto` is unused.
- Evidence: `{"email":{"x":1},"password":[1],"junk":1}` → 401 "Unauthorized" instead of a 400 listing what is wrong. The unknown field is accepted.
- Fix: validate `LoginDto` with the global pipe and call `AuthService.validateUser` from the handler. passport-local goes (one dependency fewer), same responses for valid input.

**B-05 — `/health` checks nothing; no readiness endpoint** (handoff 00-b).
- `app.setup.ts:36` always returns `ok`. The prod-compose healthcheck uses it, so a container with a dead DB connection is "healthy".
- Fix:
  - `/health` stays a cheap liveness check.
  - New `/health/ready` checks Postgres (`SELECT 1`) and Redis (`PING`, cache and queue connections), each with a timeout. It returns 503 with per-dependency status when one is down.

**B-06 — Request IDs don't line up.**
- `LoggingInterceptor` and `ApiExceptionFilter` each generate their own UUID when the client sends none, so the id in an error response is not the one in the log.
- Guard failures (401/403) happen before the interceptor and log no id at all.
- The id is never sent back as a header.
- An incoming `X-Request-ID` is logged unchecked (log injection).
- Fix: one middleware assigns `req.id`, accepts a client id only if it matches `^[\w.-]{1,64}$`, and sets the `X-Request-ID` response header. The interceptor, the filter and the access log all use it.

**B-07 — One failing store query aborts that store's whole sweep; the circuit breaker only guards one path; no per-store pacing.**
- Where: `live-ingestion.service.ts:240-285`.
  - A single `searchListings` throw (timeout, bot wall) or a single listing's DB error ends every remaining category for that store.
  - No retry.
  - `ConnectorCircuitBreaker` is created privately inside `StoreCoverageService`, so sweeps, query ingestion and the cross-store backfill never consult it.
  - Nothing spaces out requests to the same store.
- Fix:
  - One shared breaker for every ingestion path.
  - Per query: one retry with backoff, then log and move on.
  - Per listing: log and continue.
  - Stop the store when its breaker opens.
  - A per-store minimum interval between searches (`STORE_MIN_REQUEST_INTERVAL_MS`, default 2000).

**B-08 — `LIVE_INGESTION_SCHEDULE_ENABLED=false` also turns off alerts, billing maintenance, notification retries, reconciliation and brand jobs** (handoff 00-c).
- Where: `ingestion.scheduler.ts:45` returns early before scheduling everything else.
- Fix: each job family is gated only by its own flag.

**B-09 — A schema diff would drop six hot indexes** (handoff 00-e).
- `prisma migrate diff` from a migrated database to `schema.prisma` proposes dropping `canonical_products_title_trgm_idx`, `canonical_products_title_embedding_hnsw_idx`, `price_history_{recorded_at_brin, product_recorded_price, listing_recorded_price}_idx` and `source_listings_raw_title_trgm_idx`.
- Why it matters: the next `prisma migrate dev` would generate a migration that drops the search and history indexes.
- Fix:
  - Declare the five that Prisma 5.22 can express: GIN with `gin_trgm_ops`, BRIN, and the btree composites, with `map:` names.
  - The HNSW index on an `Unsupported("vector")` column can't be expressed. A test runs `migrate diff` against a freshly migrated test DB and fails on any drift except that one allowlisted line.

**B-10 — Search suggestions load the whole catalog on every keystroke.**
- Where: `products.service.ts:446`, `findMany` over every product with a price, then filtered in JS (also handoff 02).
- Why it matters: cost grows with the catalog on a public, unauthenticated, per-keystroke endpoint.
- Fix: do the same term matching in SQL, with `LIMIT`.

**B-11 — OpenAPI is incomplete and untested.**
- The `@nestjs/swagger` CLI plugin is enabled in `nest-cli.json`, so `nest build` adds DTO schemas. But:
  - comment introspection is off, so the field docs written in the DTOs never reach the document;
  - tags exist for 8 of 17 controllers;
  - the Stripe webhook shows up as a normal endpoint;
  - nothing builds the document outside a running dev server, and nothing checks it matches the routes.
- Fix:
  - Turn on `introspectComments` and tag every controller.
  - Exclude the Stripe webhook with `@ApiExcludeController`.
  - Build the document in one shared function (main.ts and tests).
  - Commit it as `docs/openapi.json`.
  - A test, run with the same plugin as a ts-jest transformer, checks that every registered route is in the document and that the committed file is current.

**B-12 — Most endpoints have no integration test.**
- Existing API tests cover auth, alerts, ingestion concurrency, raw queries, variant repair and smoke flows.
- Fix: an endpoint suite that calls every route at least once (happy path plus a validation or authorization failure). It also asserts no response anywhere contains `passwordHash`, `keyHash`, `verifyToken` or a refresh token outside the auth responses.

### P2

**B-13 — `processingTimeMs: 0` is a fake stat.** A Meilisearch-era field. The web hides it when it is 0, so it is never shown. Fix: measure it.

**B-14 — Integration tests share the dev stack's Redis databases** (handoff 00-g).
- The queue db is hard-coded to 1, so a test run can consume the running dev API's jobs, and the other way round.
- Fix: `REDIS_QUEUE_DB` (default 1, unchanged in prod). `.env.test` uses cache db 2 and queue db 3.

**B-15 — `price_history.currency` defaults to `USD`** (L-23). Every write sets it. Fix: the default becomes the base currency `EGP`, in the schema and a migration, so a missing value can't silently mean dollars. `source_listings.raw_currency` and `affiliate_conversions.currency` are left alone: those are real source currencies, and every write sets them too.

**B-16 — `ProductsService` mixes search with product detail** (A-15). Fix: move search and suggest into `SearchService`, together with the B-02 DTOs and B-10.

**B-17 — Config keys are untyped strings** (A-14). A typo silently returns the default.
- Converting ~150 call sites to `ConfigType<>` is churn with no bug behind it.
- Fix instead: a unit test that resolves every `config.get('<ns>.<key>')` literal in `src` against the registered config factories. A typo fails CI.

**B-18 — `GET /auth/me` returns the raw user row minus the password** (`deletedAt`, `updatedAt`). Fix: the same explicit public-user mapper that register/login already use.

**B-19 — The Magento connector's in-page `fetch` has no timeout** (`magento-graphql.connector.ts:127`). `page.evaluate` has no default timeout, so a hung GraphQL call hangs the job. Fix: an `AbortSignal.timeout(30_000)` inside the page.

**B-20 — Dead helpers in `PrismaService`.** `softDelete()` and `withRetryTransaction()` have no callers. `softDelete` would also fail on most models, which have no `deletedAt`. Fix: remove them.

**B-22 — pgvector is unused; the reconciliation neighbour search can't use its index.**
- `title_embedding vector(768)` has an HNSW cosine index, but nothing reads or writes the column any more:
  - Phase 01/02 moved matching to fuzzy scores and reconciliation to trigrams.
  - `SemanticService.cosineSimilarity/getCanonicalEmbedding/storeCanonicalEmbedding` have no callers.
  - So the "right index type and metric" question has no live query behind it.
- `reconciliation.service.ts:192` runs `ORDER BY a.normalized_title <-> b.normalized_title LIMIT k` per product (hourly). `<->` KNN ordering is only index-assisted by a **GiST** trigram index. The existing one is GIN, so every product sorts its whole category: O(n²) per category.
- Fix:
  - Add a GiST `gist_trgm_ops` index on `canonical_products.normalized_title`, verified with EXPLAIN ANALYZE.
  - Delete the three dead embedding helpers.
  - Dropping the column and its HNSW index is a schema/data removal, so it goes to the owner (D-16).

**B-21 — `canonical_products.normalized_title` backfill** (handoff 02). Products stored before phase 02 have the old normalization, so English queries miss some Arabic-titled products. Fix: `scripts/ops/backfill-normalized-titles.ts` (dry run, then `--apply`). Running it in production needs the owner (D-15).

### Checked, no finding

- **Global `ValidationPipe`:** `whitelist`, `forbidNonWhitelisted` and `transform` are set (`app.setup.ts:104`). The gaps are only where no DTO class exists (B-02, B-03, B-04).
- **Error format:** one envelope for everything (phase 01).
- **Caching:** the only Redis cache keys are entitlements (`entitlements:<userId>`, 60 s TTL, invalidated on every subscription change). Bull keeps 100 completed and 50 failed jobs per queue, and on-demand jobs are removed when done. No unbounded growth.
- **Bull jobs:**
  - Retries: 3 attempts with exponential backoff from 5 s (`app.module.ts`).
  - Idempotency: deterministic `jobId`s dedupe on-demand work (per query, per product), and scheduled jobs use fixed repeat ids.
  - Stalls: Bull defaults (30 s lock, one stall retry). A job interrupted by a deploy is picked up again by the next process.
  - Shutdown: `enableShutdownHooks` closes the queues.
  - Concurrency: handoff A-10, phases 08/10.
- **Transactions:**
  - Listing persistence already runs in one transaction with the per-family lock (phase 02, L-11).
  - Merges and repairs are transactional (`variant-repair.ts`).
  - The billing webhook's subscription and event writes use `$transaction`.
- **Constraints:**
  - Unique keys exist for every natural key (listing `platform+externalId`, GTIN/UPC/EAN, slugs, org membership, dedupe keys).
  - Foreign keys exist on every relation.
  - NOT NULL matches the schema. `migrate diff` reports no drift beyond B-09.
- **Outbound timeouts:**
  - FX 10 s, OpenRouter 45 s, Impact 20 s, Telegram 10 s.
  - axios connectors 30 s, browser navigation 30 s, SMTP at the nodemailer defaults.
  - The only gap is B-19.

## Query plans

Benchmark database: `pricelens_bench` on the dev Postgres, migrated to 43ff342 and seeded with the medium profile (5,000 products, 37,500 listings, 2.1 M price-history rows). Measured with `EXPLAIN (ANALYZE, BUFFERS)`, JIT off; the script is `bench.sql` in the work folder.

| Query | Before GiST | After GiST | Plan after |
|---|---|---|---|
| Reconciliation neighbours (k=5, threshold 0.5, 500 pairs), `reconciliation.service.ts:181` | **46,688 ms** | **11,557 ms** | Index Scan using `canonical_products_title_trgm_gist_idx`, 2.3 ms × 5,000 loops |
| Ingestion candidate pool (top 200 in a 680-product category), `ingestion.repository.ts:176` | 5.8 ms | 5.5 ms | category index + top-N heapsort; the category is small, so the planner rightly skips the GiST index |
| Price history, one product, 90 days (chart) | 3.4 ms cold | 0.2 ms warm | Bitmap Index Scan on `price_history_product_recorded_price_idx` |

- Reconciliation is 4× faster. What is left is the per-row `category_id` filter: the GiST scan walks titles nearest first and discards other categories' rows. A composite `(category_id, normalized_title)` GiST index would need the `btree_gist` extension. 11.6 s for an hourly job is acceptable at this size, so phase 08 revisits it with production row counts.
- Search and suggest filter on an expression over `concat_ws(title, brand, model, slug)`, so no trigram index can serve their `LIKE`. At 5,000 products they answer in tens of milliseconds. An expression index is phase 08 work once production volumes justify it.

## Fix log

(Filled in as fixes land.)

## Summary

## Remaining items

## Handoff → other phases

## Decisions for Baraa
