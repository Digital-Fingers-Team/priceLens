# Audit 01 — Architecture

Date: 2026-09-25 · Branch `feat/price-intelligence-platform` · Started from `phase-00-done` (`19c8c8b`)
Status: **DONE**. Tag `phase-01-done`.

## How this was run

- Code read from a clone of the branch. Everything that runs (checks, tests, image builds) ran on the pricelens server against the isolated `pricelens-dev` stack on ports 13000/13001.
- Production containers, the prod database and prod Redis were not touched. The one read attempted against production (Meilisearch index stats using the prod key) was refused by the session's safety policy, so the Meilisearch decision rests on code evidence plus container metrics (`docker stats`, read-only).
- Tools: `madge@8 --circular`, `git grep`, Bull's installed source (to confirm how named processors share concurrency), mermaid-cli 11 (to check every diagram renders).

## Baseline measurements

| Check | Result |
|---|---|
| Circular imports (madge 8), api `src` (153 files) | none |
| Circular imports (madge 8), web `src` (114 files) | none |
| Nest module graph | acyclic, no `forwardRef` |
| Largest files | `scraping/live-ingestion.service.ts` 1,555 lines · `products/products.service.ts` 1,001 lines |
| Controllers that use Prisma directly | 4: billing, stripe-webhook, brand, public-api |
| Shared packages | none (`packages/*` declared, empty) |
| Types duplicated verbatim between api and web | API envelope + error shape, `PriceHistoryResponse`, `CurrentPricesResponse` |
| Code that talks to Meilisearch | none |
| Prod Meilisearch container | 26.8 MB RSS, 0.02% CPU, idle (`docker stats`, read-only) |

## Findings

Severity: P0 = broken/unsafe · P1 = real harm · P2 = polish.

### P1

**A-01 — The matching pipeline is not a pipeline. Its steps are private methods tangled with database I/O, and none can be tested alone.**
- Where: `apps/api/src/scraping/live-ingestion.service.ts:920-1377` (`persistListing`, `findCanonicalMatch`, `hasIdentifierConflict`, `findByIdentifier`).
- Problem: the ten decisions that attach a scraped listing to a product (price gate, junk filter, normalize/extract, currency, category sanity, identifier match, exact-title match, conflict guards, rank + decide, market-outlier check) are interleaved with `prisma.*` calls inside one class that also runs the scrapers. There are no unit tests for any of them; the only coverage is one e2e run with three listings.
- Why it matters: phase 02 has to fix P0 F-17 (RAM variants merged). Without isolated, pure steps, every matching fix is a change to a 1,555-line service with no fast tests.
- Fix: extract each step into `apps/api/src/matching/pipeline/` as a pure function with explicit input/output types, thresholds in one file, and unit tests per step. The I/O (candidate lookup, LLM judge, persistence) goes behind small ports. **Behavior must not change:** proven by a characterization e2e suite written and snapshotted against the old code *before* the refactor, then re-run after it.
- **Fixed** in `a74e203` (characterization suite, recorded on the old code) and `bc4cf57` (pipeline extraction). Snapshot unchanged after every later commit.

**A-02 — `LiveIngestionService` is a god service (1,555 lines, 13 constructor dependencies).**
- Where: same file.
- Problem: one class holds scrape orchestration, cross-store backfill, the store-coverage sweep, a connector circuit breaker, category/query heuristics, the matching pipeline and all persistence.
- Fix: split by responsibility: connector registry, listing persistence (repository), listing processor (runs the pipeline), store coverage (expansion + sweep + circuit breaker), and the ingestion runs that remain in `LiveIngestionService`.
- **Fixed** in `897dabc`. `live-ingestion.service.ts` is 375 lines; the rest is in `store-coverage.service.ts` (241), `ingestion/listing-processor.service.ts` (229), `ingestion/ingestion.repository.ts` (272) and small pure modules.

**A-03 — Adding a store touches core code.**
- Where: `live-ingestion.service.ts:130-157` injects the 8 connector classes by name; `scraping.module.ts` lists them twice.
- Problem: the adapter interface (`RetailerConnector`) exists, but consumers are coupled to the concrete classes, so a new store means editing the ingestion service's constructor.
- Fix: a `RETAILER_CONNECTORS` multi-provider plus a `ConnectorRegistry`. Adding a store = one connector class + one line in the module's connector list.
- **Fixed** in `897dabc` (`CONNECTOR_CLASSES`, `ConnectorRegistry`, ADR 0006).

**A-04 — No shared contracts between api and web.**
- Where: `apps/web/src/types/api.types.ts` vs `apps/api/src/common/filters/http-exception.filter.ts` + `interceptors/transform.interceptor.ts`; `apps/web/src/types/product.types.ts` (`PriceHistory`, `CurrentPrices`) vs `apps/api/src/products/products.service.ts` (`PriceHistoryResponse`, `CurrentPricesResponse`).
- Problem: the same shapes are typed twice by hand; they already drift in small ways (the web's error `details` type is narrower than what the API sends).
- Fix: `packages/contracts` (`@pricelens/contracts`), types only, consumed by both apps. Both Dockerfiles and their `--filter` installs must keep working (proved with throwaway check images).
- **Fixed** in `f0506a8` (ADR 0002). Check images built for both apps; see Fix log.

**A-05 — The error model loses the error code the client needs, and non-HTTP errors come back in a different shape.**
- Where: `apps/api/src/common/filters/http-exception.filter.ts:81-95`; `apps/api/src/billing/billing.errors.ts`.
- Problem 1: `UpgradeRequiredException` sets `code: 'UPGRADE_REQUIRED'` plus `feature`/`requiredTier`/`limit` so the web can show an upgrade prompt instead of a dead end. The filter ignores the body's `code` and maps every 403 to `FORBIDDEN`, and drops the extra fields. The paywall contract never reaches the client.
- Problem 2: an exception that is neither an `HttpException` nor a Prisma error (a thrown `Error`, a CORS rejection) falls through to Nest's default handler and returns `{ statusCode, message }`, not the `{ success: false, error: {...} }` envelope the web parses.
- Problem 3: `billing.controller.ts:143` answers "User not found" with a 403 `UpgradeRequiredException`.
- Fix: one catch-all filter that produces the envelope for every error, honours a domain `code` and its details, and never leaks internals on a 500. Tests for each case.
- **Fixed**: problem 3 in `c67b708`, problems 1-2 in `574cc05` (ADR 0005).

**A-06 — Queue job names and payload types live in the worker file, so producers import the worker.**
- Where: `apps/api/src/workers/ingestion.processor.ts:14-35`, imported by `products.service.ts`, `products.module.ts`, `admin.controller.ts`, `admin.module.ts`.
- Problem: to enqueue a job, the products module imports the processor module file, which imports scraping, matching, watchlist, billing, seller and brand. Dependency direction is backwards (the HTTP side depends on the worker side), and the job contract has no home.
- Fix: `workers/ingestion.jobs.ts` holds the queue name, job names and payload types. Producers and the processor both import it; nothing imports the processor.
- **Fixed** in `29eee57`.

**A-07 — Meilisearch (D-1): running in production, used by nothing.**
- Evidence:
  - `git grep -i meili` in `apps/*/src`: only `config/search.config.ts` (two unused config keys) and `env.validation.ts` (URL format check). No client, no index code, no sync. The npm package was removed in phase 00 (F-14) and nothing broke.
  - Search is Postgres `ILIKE` + `pg_trgm` + a relevance score in SQL (`products.service.ts`), covered by the e2e smoke test.
  - The container still costs little (26.8 MB, idle), but it holds a stale index nobody writes to, keeps a master key in `.env`, and the dev stack waits for its health check on every `dev:up`.
  - A real Meilisearch integration needs a sync strategy (outbox or change feed, retry, full reindex, drift check) that doesn't exist. Two search stores that can disagree about prices is a correctness risk for a price-comparison product.
  - Search latency on Postgres, measured on a throwaway 5,000-product / 37,500-listing database: 0.5-0.7 s p50 for common queries, the time spent in SQL. Slow, but not a reason for a second store (see Fix log, A-07).
- Decision: **remove Meilisearch from the code, config, dev stack and compose files.** Keep Postgres as the single source of truth for search. Revisit only if measured search latency or relevance needs it (typo tolerance is the one thing pg_trgm does worse). Recorded as ADR 0003.
- Production: the running `pricelens-meilisearch` container and its `meili_data` volume are left alone. Stopping and deleting them is a decision for Baraa (D-8). Removing the service from `docker-compose.server.yml` doesn't stop it: `deploy-api.sh` runs `compose up --no-deps api proxy`, which never touches other services.
- **Fixed** (code side) in `96683a2` (ADR 0003). Stopping the prod container: **Needs decision** (D-8).

**A-08 — Prisma calls and business logic in controllers.**
- Where: `billing/billing.controller.ts:48-49,142`, `billing/stripe-webhook.controller.ts:169`, `brand/brand.controller.ts:86-145` (full CRUD for brand watches), `public-api/public-api.controller.ts:70-100` (query + response mapping).
- Fix: move each into its service. Controllers keep only HTTP concerns.
- **Fixed** in `c67b708`.

### P2

**A-09 — Dead code in the matching module.**
- `PriceSanityService` (registered, never injected), `SemanticService.embed()` (never called), and 5 of the 7 interfaces in `matching/interfaces/matching.interfaces.ts` (`MatchCandidate`, `StepScore`, `MatchScoreBreakdown`, `MatchResult`, `IdentifierSet`) have no users. They describe a weighted-score pipeline that doesn't exist, which misleads anyone reading the module.
- Fix: delete.
- **Fixed** in `1007418`.

**A-10 — One Bull queue, twelve named handlers: up to twelve jobs run at once.**
- Where: `workers/ingestion.processor.ts`.
- Evidence: Bull's `Queue.prototype.process` starts one `processJobs` loop per registered handler (installed `bull/lib/queue.js:955-972`), and each loop takes the next job of any name. So a live ingestion, a coverage sweep and several on-demand scrapes can run concurrently and compete for the same browser contexts. The code already guards the coverage sweep against itself (`coverageSweepInFlight`) for this reason.
- Not changed here: serializing scrape jobs would make on-demand search scrapes wait behind multi-hour sweeps. That's a throughput and UX trade-off. Handoff to phase 08 (with measurements) and phase 10 (worker process split). Documented in ARCHITECTURE.md.
- **Deferred** (phase 08 measures, phase 10 splits the queue with the worker): changing it changes throughput and latency users see.

**A-11 — API and workers share one process.**
- The API container runs HTTP, all Bull workers and headful Chrome (about 4 GB RSS per audit 00). A scrape spike slows HTTP.
- Not changed here (deploy topology). ADR 0004 records the target: the same image started in two roles (`api`, `worker`) by an env flag. Handoff to phase 10.
- **Deferred** to phase 10 (ADR 0004).

**A-12 — Reconciliation duplicates the ingestion conflict guards, and the two sets have drifted.**
- Where: `matching/reconciliation.service.ts:246-298` vs `live-ingestion.service.ts:1248-1311`.
- Drift: reconciliation treats **color** as a hard conflict; ingestion deliberately doesn't (D-6: colors combined). Reconciliation also skips the product-type and chip guards. The LLM prompt (`semantic.service.ts`) says a different color means a different product.
- Not changed here: fixing it changes matching outcomes. The identifier-conflict helper, which is identical in both, is shared now. The rest goes to phase 02.
- **Partly fixed** in `1007418` (shared identifier guard, the drift documented in code and ARCHITECTURE.md). Aligning the guards: **Deferred** to phase 02 (changes outcomes).

**A-13 — Caching has no invalidation path tied to price changes.**
- Redis cache (db 0) holds only entitlements (`billing/entitlements.service.ts`). Prices aren't cached server-side. Next.js pages use time-based ISR (`revalidate = 300` on home and product pages), so a price change shows up within 5 minutes; React Query `staleTime` is 5 s–10 min per hook.
- No bug today, because nothing caches prices where they could go stale beyond those windows. Documented in ARCHITECTURE.md. On-demand revalidation after ingestion is a phase 08 option.
- **Deferred** (documented; event-driven revalidation is a phase 08 option).

**A-14 — Config is centralized and validated, but not typed.**
- All env reads go through `config/*.config.ts` (validated by the phase 00 zod schema) except `app.setup.ts` (3 bootstrap vars) and `main.ts`. Consumers use string keys (`config.get<number>('retailers.minStoresPerProduct', 7)`), so a typo'd key silently returns the default.
- Deferred: switching roughly 150 call sites to `ConfigType<typeof x>` is a broad mechanical change with no bug behind it. Handoff to phase 03.
- **Deferred** to phase 03.

**A-15 — `ProductsService` (1,001 lines) mixes search SQL, product detail, price history and scrape triggers.**
- Deferred: search is phase 03's (DTOs, 03-d) and phase 08's (performance) territory. Moving it now would collide with their changes. The seam is noted in ARCHITECTURE.md.
- **Deferred** to phase 03/08.

### Found while fixing

**A-16 — Stored XSS through scraped titles on search result cards (P0).**
- Where: `apps/web/src/components/product/product-card.tsx:26,110` rendered `product._formatted?.title ?? product.title` with `dangerouslySetInnerHTML`. `_formatted` was a Meilisearch-style highlight field the API filled with the raw scraped title.
- Why it matters: a store title containing HTML (`<img src=x onerror=…>`) would run in every visitor's browser on the search page.
- **Fixed** in `96683a2` (text rendering, field removed from API and web, component test).

**A-17 — Script injection through the product page's JSON-LD (P0).**
- Where: `apps/web/src/app/products/[slug]/page.tsx:110`, `JSON.stringify(jsonLd)` inside a `<script>` via `dangerouslySetInnerHTML`; the JSON includes the scraped title and `<` is not escaped.
- **Deferred** to phase 04 (security scope), flagged P0 in the handoff and in D-10.

**A-18 — Matching outcome depends on database row order for tied candidates.**
- Where: `IngestionRepository.candidates.findInCategory` (unordered `findMany`, 200 rows) + stable ranking sort.
- Evidence: the characterization suite's first version placed the same RAM-unreadable listing on the 8GB product in some runs and the 12GB product in others.
- **Deferred** to phase 02 (fixing it changes outcomes; it is part of F-17).

## Plan (more than 15 files, so written before executing)

Each step is its own commit. The full api gate (typecheck, lint, build, unit, integration, e2e) must be green after each one.

1. **Characterization first.** Add `test/e2e/matching-characterization.e2e-spec.ts`: about 60 listings from 4 fake stores (identifiers, exact titles, RAM/storage/display/chip/type/condition conflicts, accessories, junk, a category big enough to arm the price floor, market outliers, the LLM-unavailable fuzzy fallback). It snapshots every listing's outcome: which product it landed on (by group label), match status and confidence. Snapshot committed from the **old** code.
2. **Extract the pure pipeline** (`matching/pipeline/`): types, thresholds, 10 step functions, `findCanonicalMatch` as a function over two ports (`CandidateSource`, `SameProductJudge`). Unit tests per step. `LiveIngestionService` calls it. Characterization snapshot unchanged.
3. **Split `LiveIngestionService`**: `ConnectorRegistry` + `RETAILER_CONNECTORS` (A-03), `IngestionRepository` (all Prisma I/O), `ListingProcessor` (pipeline + persistence), `StoreCoverageService` (expansion, sweep, circuit breaker). Characterization snapshot unchanged.
4. **Queue contract** file (A-06).
5. **Controllers → services** (A-08).
6. **Error model** (A-05) with tests.
7. **`packages/contracts`** (A-04), Dockerfiles updated, check images built and the deploy script's in-image unit tests run.
8. **Meilisearch removal** (A-07) and dead code (A-09).
9. **Docs**: `ARCHITECTURE.md`, ADRs in `docs/adr/`, PROJECT_MAP/README refresh.

## Fix log

All commands ran on the server. Gate = api `tsc --noEmit`, `eslint "{src,test}/**/*.ts"`, `nest build`, `test:unit`, `test:integration`, `test:e2e --ci`; plus, when the web or contracts changed, contracts `typecheck`, web `tsc --noEmit`, `next lint`, `vitest run`, `next build`. Every commit below was gated green before it was made.

| Commit | What | Gate after it |
|---|---|---|
| `43c0b4a` | This audit and the plan | — (docs) |
| `a74e203` | Characterization suite, snapshot recorded on the **old** code | e2e 11/11, snapshot 5/5; stable over 9 runs in both file orders |
| `bc4cf57` | A-01: pipeline extracted into `matching/pipeline` | unit 321 (+52), integration 16, e2e 11, snapshot unchanged |
| `897dabc` | A-02, A-03: service split, connector registry | unit 331 (+10), integration 16, e2e 11, snapshot unchanged |
| `29eee57` | A-06: queue contract + single producer | unit 333 (+2), integration 16, e2e 11, snapshot unchanged |
| `c67b708` | A-08 and A-05 problem 3: Prisma out of controllers | unit 335 (+2), integration 16, e2e 11 (smoke now checks `/billing/me`) |
| `574cc05` | A-05: one error envelope | unit 343 (+8), integration 16, e2e 12 (+1) |
| `f0506a8` | A-04: `@pricelens/contracts` + Dockerfiles | api as above; contracts typecheck; web tsc, lint, vitest 8, next build; check images (below) |
| `96683a2` | A-07: Meilisearch removed; stored-XSS path removed with it | api as above; web vitest 9 (+1), next build |
| `1007418` | A-09 dead code; A-12 shared identifier guard | unit 343, integration 16, e2e 12, snapshot unchanged |
| `3f67d5a` | ARCHITECTURE.md, ADRs 0001-0006, map/README | madge clean; all 7 diagrams render |

### Evidence worth keeping

- **Characterization suite (A-01).** About 60 listings from 4 fake stores, 4 query runs, cross-store backfill, one store expansion and the coverage sweep, all through the real normalizer, guards, FX fallback table and Postgres. The snapshot records where every listing landed (e.g. `jumia/j1 … REJECTED` after a re-run priced it at 2,000 EGP; `noon/n2` rejected as an outlier at 99,999 EGP, then accepted at 64,999 on the re-run; `jumia/j8` 128GB kept apart from the 256GB product). It is byte-for-byte unchanged after each refactor commit. First version was flaky: the coverage sweep visits ties in an order Postgres doesn't fix, and two F-17 listings (RAM not readable) tie across RAM variants. Both are now outside the snapshot (sweep: totals only; F-17 listings: handed to phase 02).
- **Error model (A-05), before the fix, on the dev stack:**
  ```
  curl -H "Origin: https://evil.example" :13001/api/v1/billing/plans
  → 500 {"statusCode":500,"message":"Internal server error"}
  ```
  After: `403 {"success":false,"error":{"code":"CORS_ORIGIN_NOT_ALLOWED",…}}`; `UpgradeRequiredException` now arrives as `UPGRADE_REQUIRED` with `details: { feature, requiredTier }` (unit test), validation keeps `details: [messages]` (e2e).
- **Contracts in Docker (A-04).** Throwaway images `localhost/pricelens_{api,web}:phase01-check`, built from the working tree and deleted afterwards. Built twice: at `f0506a8` and again at the final HEAD `3f67d5a`.
  - api: `podman build -f docker/Dockerfile.api` ok; `deploy-api.sh`'s in-image command (`NODE_ENV=test … jest --testPathPattern=test/unit --runInBand`) → **30 suites passed, 1 skipped; 341 tests passed, 2 skipped** (the skipped suite is the `.env.example` check, which needs the whole checkout); the image boots against the dev stack (`node dist/src/main`): `/health` ok, search 200.
  - web: `podman build -f docker/Dockerfile.web` ok; `next start` from the image serves `/` and `/search?q=iphone` with 200 against the dev API.
  - `nest build` still emits `dist/src/main.js`; `@pricelens/contracts` appears only in emitted `.d.ts` files, never in a `require`.
- **Meilisearch (A-07).** Search latency, measured on a throwaway `pricelens_bench` database seeded with the `medium` profile (5,000 products, 37,500 listings; dropped afterwards), API process on :13004, 10 requests each after a warm-up:

  | Query | p50 | max |
  |---|---|---|
  | `iphone` | 588 ms | 967 ms |
  | `samsung galaxy 256gb` | 160 ms | 280 ms |
  | `laptop 16gb` | 671 ms | 835 ms |
  | `rtx 4070` | 715 ms | 1022 ms |
  | `iphon` (typo) | 649 ms | 2026 ms |
  | empty query, browse | 152 ms | 302 ms |
  | `samsung` sorted by price | 491 ms | 733 ms |
  | `zzzzqqqq` (no hits) | 543 ms | 666 ms |

  The API's own query log put 0.4-0.5 s of each in the search SQL. So Postgres search needs work (phase 08), but the evidence points at the query, not at a missing search engine. The production catalog size could not be read (see "How this was run"), so these numbers are a lower bound for a larger catalog.
- **Stored XSS found while removing Meilisearch.** `product-card.tsx` rendered `product._formatted?.title ?? product.title` through `dangerouslySetInnerHTML`; `_formatted.title` was the raw scraped title. Any store title containing HTML would have run as markup on the search page. Now rendered as text; `product-card.test.tsx` renders `Phone <img src=x onerror="alert(1)"> 128GB` and asserts no `<img>` exists.
- **Circular dependencies:** `madge@8 --circular`: api 181 files, web 118 files, none.
- **Final gate (HEAD `3f67d5a`):** api tsc ✓, eslint ✓, nest build ✓, unit **343/343** (31 suites), integration **16/16**, e2e **12/12** (snapshots 5/5); contracts typecheck ✓; web tsc ✓, next lint ✓, vitest **9/9** (3 files), next build ✓; `pnpm typecheck` (turbo, 3 packages) ✓, `pnpm lint` ✓; Playwright **6/6** (3 flows × desktop 1440 + mobile 375) against a fresh `pnpm dev:up` on 13000/13001.

### Process notes

- The benchmark cleanup used `pkill -f "node dist/src/mai[n]"`. That pattern also matches the production API process (`node dist/src/main` inside the `pricelens-api` container, visible on the host). Production was not affected: afterwards the container was still `Up 2 hours (healthy)` with the same PID (process started 21:23:59, well before the benchmark ran at about 22:55). Every later cleanup killed by verified PID and working directory only. Future phases: never `pkill` by command line on this host.
- The dev stack's `dev.sh` only cleans up its children on Ctrl-C (a signal to the whole process group). `kill <pid of dev.sh>` leaves the API and web processes running (handoff 10).

## Summary

- The matching pipeline is now ten named, pure steps (`apps/api/src/matching/pipeline`) with explicit types, thresholds in one file, 52 unit tests, and a characterization suite that pins down what the pipeline decides. Phase 02 can change one step and see exactly what moved.
- `LiveIngestionService` went from 1,555 lines to 375; persistence, the per-listing processor, store coverage, the circuit breaker and query builders each have their own home. Stores plug in through one registry list.
- Queue jobs have a contract file and one producer; the HTTP side no longer imports the worker.
- No controller touches Prisma. Every error, of any kind, now uses one envelope, and domain codes like `UPGRADE_REQUIRED` reach the client.
- `@pricelens/contracts` is the single definition of the envelope, error codes and price responses, used by both apps, proven in both Docker images.
- Meilisearch is gone from the code (it was never used). A stored-XSS path that came with it is closed.
- ARCHITECTURE.md (7 diagrams, all checked against the code) and six ADRs describe the result.
- Tests: api unit 269 → 343, e2e 6 → 12 (the phase-00 baseline was 269/16/6); web component tests 8 → 9. No circular dependencies.

## Remaining items

- A-10 (queue concurrency), A-11 (worker process split), A-13 (event-driven page revalidation), A-14 (typed config), A-15 (`ProductsService` split): deferred, with owners below.
- A-12: the reconciliation guards still differ from the pipeline's; aligning them changes outcomes (phase 02).
- The production Meilisearch container is still running (D-8).

## Handoff → other phases

- **02 Logic**
  - F-17 as before. Two findings from this phase make it worse than described:
    - **Ties are nondeterministic.** A listing whose RAM can't be read scores the same against every RAM variant of its model (model agreement, 0.95), and the winner is whichever row Postgres returns first from an unordered `findMany` (`IngestionRepository.candidates.findInCategory`). The characterization suite showed the same listing landing on the 8GB product in one run and the 12GB product in another.
    - After fixing it, add the RAM-unreadable listings (`256GB/8GB`, `256GB/12GB`) to the characterization suite and update its snapshot deliberately.
  - Reconciliation's guards differ from pipeline step 8 (A-12): it treats **color** as a conflict (contradicts D-6), and skips the product-type and chip guards. The LLM judge prompt (`semantic.service.ts`) also tells the model that a different color means a different product. Align all three with D-6.
  - Use the characterization suite for every matching change: `test:e2e -u`, then review the snapshot diff.
- **03 Backend**
  - A-14: typed config access (`ConfigType<typeof retailersConfig>`), ~150 `config.get` call sites.
  - A-15: split search out of `ProductsService` into `SearchService` when adding the search DTOs (03-d).
  - Every search with a query enqueues a live scrape of it (30 s in-process cooldown per query, per API instance). Worth a conscious decision about which searches should scrape.
- **04 Security**
  - **P0: `apps/web/src/app/products/[slug]/page.tsx:110`** puts `JSON.stringify(jsonLd)` into a `<script type="application/ld+json">` via `dangerouslySetInnerHTML`. The JSON contains the scraped product title, and `JSON.stringify` doesn't escape `<`, so a title containing `</script><script>…` breaks out of the tag. Same class of bug as the one closed in `96683a2`. Fix: escape `<` as `<` in the serialized JSON. Audit every `dangerouslySetInnerHTML` (there are no others left in `apps/web/src`).
  - CORS still allows requests with no `Origin` (audit 00); rejected origins now get a clean 403.
- **05 Frontend / 06 UX**
  - Error responses now carry stable codes and details. Show an upgrade prompt on `UPGRADE_REQUIRED` (details: `feature`, `requiredTier`, `limit`, `current`) instead of a generic error. `getApiErrorMessage` handles object `details` correctly already.
  - Colors share one product (D-6); each offer row has its own title, which is where a color filter can read from.
- **08 Optimization**
  - Search: 0.5-0.7 s p50 at 5,000 products, the time in SQL (Fix log, A-07). Start with `EXPLAIN ANALYZE` of the search query and trigram indexes. ADR 0003 sets when a search engine would be reconsidered.
  - A-10: up to 12 jobs run concurrently on the `ingestion` queue; measure browser contention before choosing a scrape concurrency.
  - A-13: consider revalidating a product page when ingestion changes its price, instead of waiting for the 300 s ISR window.
  - Dev Redis runs with `maxmemory-policy allkeys-lru` while holding Bull queues (db 1). Bull needs `noeviction`; production Redis has no maxmemory, so this is dev-only.
- **10 DevOps**
  - A-11 / ADR 0004: one image, two roles (`api`, `worker`), and a scrape queue with bounded concurrency.
  - `scripts/dev.sh` leaves the API and web running when the script itself is killed (only a process-group signal like Ctrl-C cleans up). Trap and kill the process group.
  - Run the characterization suite in CI with the rest of `test:e2e`.

## Decisions for Baraa

- **D-8 — Stop the production Meilisearch container.** Nothing uses it (ADR 0003), and the compose files no longer define it, so it will never be recreated. It still holds a master key and an idle process. **Recommendation:** after the next API deploy, `podman stop pricelens-meilisearch && podman rm pricelens-meilisearch`, remove `MEILI_MASTER_KEY` and `MEILISEARCH_*` from the production `.env`, and delete the volume a week later (`podman volume rm pricelens_meili_data`). The dev copy (`pricelens-dev-meilisearch`, stopped during this phase) and its volume `pricelens-dev_meili_data` can go at the same time.
- **D-9 — Split the workers out of the API process (ADR 0004).** It adds a second container on the shared 10 GB box, and on-demand scrapes would queue behind a sweep instead of running alongside it (unless the scrape queue gets concurrency 2+). **Recommendation:** approve for phase 10, with a scrape queue of concurrency 2 so a search-triggered scrape never waits for a whole sweep.
- **D-10 — Deploy soon after this phase, and fix the JSON-LD script injection first.** Two phase 01 changes matter to users once deployed: the closed stored-XSS path on search cards, and error codes the frontend can act on. The remaining script-injection bug on product pages (handoff 04, P0) is the same class of issue and is live now. **Recommendation:** have phase 04 fix the JSON-LD escaping as its first commit, then deploy api + web together (the error envelope and contracts are shared).
