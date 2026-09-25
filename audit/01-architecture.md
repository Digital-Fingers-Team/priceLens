# Audit 01 — Architecture

Date: 2026-09-25 · Branch `feat/price-intelligence-platform` · Started from `phase-00-done` (`19c8c8b`)
Status: **IN PROGRESS**

## How this was run

- Code read from a clone of the branch. Everything that runs (checks, tests, image builds) ran on the pricelens server against the isolated `pricelens-dev` stack on ports 13000/13001.
- Production containers, the prod database and prod Redis were not touched. The one read attempted against production (Meilisearch index stats using the prod key) was refused by the session's safety policy, so the Meilisearch decision rests on code evidence plus container metrics (`docker stats`, read-only).
- Tools: `madge@8 --circular`, `git grep`, Bull's installed source (to confirm how named processors share concurrency).

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

**A-02 — `LiveIngestionService` is a god service (1,555 lines, 13 constructor dependencies).**
- Where: same file.
- Problem: one class holds scrape orchestration, cross-store backfill, the store-coverage sweep, a connector circuit breaker, category/query heuristics, the matching pipeline and all persistence.
- Fix: split by responsibility: connector registry, listing persistence (repository), listing processor (runs the pipeline), store coverage (expansion + sweep + circuit breaker), and the ingestion runs that remain in `LiveIngestionService`.

**A-03 — Adding a store touches core code.**
- Where: `live-ingestion.service.ts:130-157` injects the 8 connector classes by name; `scraping.module.ts` lists them twice.
- Problem: the adapter interface (`RetailerConnector`) exists, but consumers are coupled to the concrete classes, so a new store means editing the ingestion service's constructor.
- Fix: a `RETAILER_CONNECTORS` multi-provider plus a `ConnectorRegistry`. Adding a store = one connector class + one line in the module's connector list.

**A-04 — No shared contracts between api and web.**
- Where: `apps/web/src/types/api.types.ts` vs `apps/api/src/common/filters/http-exception.filter.ts` + `interceptors/transform.interceptor.ts`; `apps/web/src/types/product.types.ts` (`PriceHistory`, `CurrentPrices`) vs `apps/api/src/products/products.service.ts` (`PriceHistoryResponse`, `CurrentPricesResponse`).
- Problem: the same shapes are typed twice by hand; they already drift in small ways (the web's error `details` type is narrower than what the API sends).
- Fix: `packages/contracts` (`@pricelens/contracts`), types only, consumed by both apps. Both Dockerfiles and their `--filter` installs must keep working (proved with throwaway check images).

**A-05 — The error model loses the error code the client needs, and non-HTTP errors come back in a different shape.**
- Where: `apps/api/src/common/filters/http-exception.filter.ts:81-95`; `apps/api/src/billing/billing.errors.ts`.
- Problem 1: `UpgradeRequiredException` sets `code: 'UPGRADE_REQUIRED'` plus `feature`/`requiredTier`/`limit` so the web can show an upgrade prompt instead of a dead end. The filter ignores the body's `code` and maps every 403 to `FORBIDDEN`, and drops the extra fields. The paywall contract never reaches the client.
- Problem 2: an exception that is neither an `HttpException` nor a Prisma error (a thrown `Error`, a CORS rejection) falls through to Nest's default handler and returns `{ statusCode, message }`, not the `{ success: false, error: {...} }` envelope the web parses.
- Problem 3: `billing.controller.ts:143` answers "User not found" with a 403 `UpgradeRequiredException`.
- Fix: one catch-all filter that produces the envelope for every error, honours a domain `code` and its details, and never leaks internals on a 500. Tests for each case.

**A-06 — Queue job names and payload types live in the worker file, so producers import the worker.**
- Where: `apps/api/src/workers/ingestion.processor.ts:14-35`, imported by `products.service.ts`, `products.module.ts`, `admin.controller.ts`, `admin.module.ts`.
- Problem: to enqueue a job, the products module imports the processor module file, which imports scraping, matching, watchlist, billing, seller and brand. Dependency direction is backwards (the HTTP side depends on the worker side), and the job contract has no home.
- Fix: `workers/ingestion.jobs.ts` holds the queue name, job names and payload types. Producers and the processor both import it; nothing imports the processor.

**A-07 — Meilisearch (D-1): running in production, used by nothing.**
- Evidence:
  - `git grep -i meili` in `apps/*/src`: only `config/search.config.ts` (two unused config keys) and `env.validation.ts` (URL format check). No client, no index code, no sync. The npm package was removed in phase 00 (F-14) and nothing broke.
  - Search is Postgres `ILIKE` + `pg_trgm` + a relevance score in SQL (`products.service.ts`), covered by the e2e smoke test.
  - The container still costs little (26.8 MB, idle), but it holds a stale index nobody writes to, keeps a master key in `.env`, and the dev stack waits for its health check on every `dev:up`.
  - A real Meilisearch integration needs a sync strategy (outbox or change feed, retry, full reindex, drift check) that doesn't exist. Two search stores that can disagree about prices is a correctness risk for a price-comparison product.
  - Search latency on Postgres at a realistic catalog size: see the measurement under "Fix log" (A-07).
- Decision: **remove Meilisearch from the code, config, dev stack and compose files.** Keep Postgres as the single source of truth for search. Revisit only if measured search latency or relevance needs it (typo tolerance is the one thing pg_trgm does worse). Recorded as ADR 0003.
- Production: the running `pricelens-meilisearch` container and its `meili_data` volume are left alone. Stopping and deleting them is a decision for Baraa (D-8). Removing the service from `docker-compose.server.yml` doesn't stop it: `deploy-api.sh` runs `compose up --no-deps api proxy`, which never touches other services.

**A-08 — Prisma calls and business logic in controllers.**
- Where: `billing/billing.controller.ts:48-49,142`, `billing/stripe-webhook.controller.ts:169`, `brand/brand.controller.ts:86-145` (full CRUD for brand watches), `public-api/public-api.controller.ts:70-100` (query + response mapping).
- Fix: move each into its service. Controllers keep only HTTP concerns.

### P2

**A-09 — Dead code in the matching module.**
- `PriceSanityService` (registered, never injected), `SemanticService.embed()` (never called), and 5 of the 7 interfaces in `matching/interfaces/matching.interfaces.ts` (`MatchCandidate`, `StepScore`, `MatchScoreBreakdown`, `MatchResult`, `IdentifierSet`) have no users. They describe a weighted-score pipeline that doesn't exist, which misleads anyone reading the module.
- Fix: delete.

**A-10 — One Bull queue, twelve named handlers: up to twelve jobs run at once.**
- Where: `workers/ingestion.processor.ts`.
- Evidence: Bull's `Queue.prototype.process` starts one `processJobs` loop per registered handler (installed `bull/lib/queue.js:955-972`), and each loop takes the next job of any name. So a live ingestion, a coverage sweep and several on-demand scrapes can run concurrently and compete for the same browser contexts. The code already guards the coverage sweep against itself (`coverageSweepInFlight`) for this reason.
- Not changed here: serializing scrape jobs would make on-demand search scrapes wait behind multi-hour sweeps. That's a throughput and UX trade-off. Handoff to phase 08 (with measurements) and phase 10 (worker process split). Documented in ARCHITECTURE.md.

**A-11 — API and workers share one process.**
- The API container runs HTTP, all Bull workers and headful Chrome (about 4 GB RSS per audit 00). A scrape spike slows HTTP.
- Not changed here (deploy topology). ADR 0004 records the target: the same image started in two roles (`api`, `worker`) by an env flag. Handoff to phase 10.

**A-12 — Reconciliation duplicates the ingestion conflict guards, and the two sets have drifted.**
- Where: `matching/reconciliation.service.ts:246-298` vs `live-ingestion.service.ts:1248-1311`.
- Drift: reconciliation treats **color** as a hard conflict; ingestion deliberately doesn't (D-6: colors combined). Reconciliation also skips the product-type and chip guards. The LLM prompt (`semantic.service.ts`) says a different color means a different product.
- Not changed here: fixing it changes matching outcomes. The identifier-conflict helper, which is identical in both, is shared now. The rest goes to phase 02.

**A-13 — Caching has no invalidation path tied to price changes.**
- Redis cache (db 0) holds only entitlements (`billing/entitlements.service.ts`). Prices aren't cached server-side. Next.js pages use time-based ISR (`revalidate = 300` on home and product pages), so a price change shows up within 5 minutes; React Query `staleTime` is 5 s–10 min per hook.
- No bug today, because nothing caches prices where they could go stale beyond those windows. Documented in ARCHITECTURE.md. On-demand revalidation after ingestion is a phase 08 option.

**A-14 — Config is centralized and validated, but not typed.**
- All env reads go through `config/*.config.ts` (validated by the phase 00 zod schema) except `app.setup.ts` (3 bootstrap vars) and `main.ts`. Consumers use string keys (`config.get<number>('retailers.minStoresPerProduct', 7)`), so a typo'd key silently returns the default.
- Deferred: switching roughly 150 call sites to `ConfigType<typeof x>` is a broad mechanical change with no bug behind it. Handoff to phase 03.

**A-15 — `ProductsService` (1,001 lines) mixes search SQL, product detail, price history and scrape triggers.**
- Deferred: search is phase 03's (DTOs, 03-d) and phase 08's (performance) territory. Moving it now would collide with their changes. The seam is noted in ARCHITECTURE.md.

## Plan (more than 15 files, so written before executing)

Each step is its own commit. The full api gate (typecheck, lint, build, unit, integration, e2e) must be green after each one.

1. **Characterization first.** Add `test/e2e/matching-characterization.e2e-spec.ts`: about 70 listings from 4 fake stores (identifiers, exact titles, RAM/storage/display/chip/type/condition conflicts, accessories, junk, a category big enough to arm the price floor, market outliers, the LLM-unavailable fuzzy fallback). It snapshots every listing's outcome: which product it landed on (by group label), match status and confidence. Snapshot committed from the **old** code.
2. **Extract the pure pipeline** (`matching/pipeline/`): types, thresholds, 10 step functions, `findCanonicalMatch` as a function over two ports (`CandidateSource`, `SameProductJudge`). Unit tests per step. `LiveIngestionService` calls it. Characterization snapshot unchanged.
3. **Split `LiveIngestionService`**: `ConnectorRegistry` + `RETAILER_CONNECTORS` (A-03), `IngestionRepository` (all Prisma I/O), `ListingProcessor` (pipeline + persistence), `StoreCoverageService` (expansion, sweep, circuit breaker). Characterization snapshot unchanged.
4. **Queue contract** file (A-06).
5. **Controllers → services** (A-08).
6. **Error model** (A-05) with tests.
7. **`packages/contracts`** (A-04), Dockerfiles updated, check images built and the deploy script's in-image unit tests run.
8. **Meilisearch removal** (A-07) and dead code (A-09).
9. **Docs**: `ARCHITECTURE.md`, ADRs in `docs/adr/`, PROJECT_MAP/README refresh.

## Fix log

(filled in as steps land)

## Summary

(at the end)

## Remaining items

## Handoff → other phases

## Decisions for Baraa
