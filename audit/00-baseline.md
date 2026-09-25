# Audit 00 — Baseline & safety net

Date: 2026-09-25 · Branch `feat/price-intelligence-platform` · Starting point: tag `phase-00-start` (`e3017e9`)
Status: **AUDIT COMPLETE — fixes not started (waiting for owner OK)**

## How this was run

Everything ran on the pricelens server, isolated from production:

- Dependencies were installed on the host with `npx pnpm@11.4.0 install --frozen-lockfile` (1m50s). `.dockerignore` excludes `node_modules`, so this doesn't touch image builds.
- The dev infra was a separate compose project, `pricelens-audit` (`~/.cache/pricelens-audit/compose.yml`, outside the repo). Ports were bound to 127.0.0.1 only: pg `15432`, redis `16379`, meili `17700`.
- The API ran from `dist` on port `13001`, with every store connector, schedule and FX fetch disabled. It was started from a directory where `../../.env` doesn't exist, so no production values could load (see F-05).
- Production (pricelens-*) containers were not touched. The only production access was two read-only `SELECT count(*)` queries.

## Results snapshot

| Check | Result | Evidence |
|---|---|---|
| api typecheck (`tsc --noEmit`, includes src/test/seed/scripts/prisma) | ✅ 0 errors | exit 0 |
| web typecheck | ✅ 0 errors | exit 0 |
| api lint | ❌ 2 errors | `src/main.ts:6:21`, `7:26` no-var-requires |
| web lint | ❌ 1 error | `src/app/seller/[orgId]/page.tsx:8:10` unused `Badge` |
| api build (`nest build`) | ✅ 41s | `dist/src/main.js` |
| web build (`next build`) | ❌ **fails on lint** | same error as web lint; `next build --no-lint` ✅ builds 19 routes in 55s |
| api unit tests | ✅ 21 suites / 243 tests | 17.4s |
| api integration tests (vs isolated DB) | ✅ 2 suites / 16 tests | 23.6s, needs `--forceExit` |
| api e2e (`test:e2e`) | ❌ config file missing | `jest.e2e.config.js` does not exist |
| web tests | ❌ none exist | no runner, no specs |
| Playwright e2e | ❌ none exist | Chromium 1243 is already in `~/.cache/ms-playwright` |
| migrations from zero | ✅ 11/11 applied, "Database schema is up to date" | |
| schema drift | ⚠ only the 6 known raw-SQL indexes | HNSW, 2× trgm, 2× covering, BRIN. Documented in STAGE-STATUS |
| circular deps (madge 8) | ✅ none | api 150 files, web 114 files |
| TODO/FIXME/HACK in src | ✅ 0 | |
| console.log/debug in src | ✅ 0 (4 console.* total, all error paths) | |
| demo/mock fallbacks in src | ✅ none found | grep for mock/demo/fake/dummy/placeholder/lorem; every hit is a legitimate domain term |
| demo products in prod DB | ✅ 0 of 14,580 | `image_url LIKE '%dummyimage.com%'` |
| test users in prod DB | ✅ 0 | `email LIKE 'test\_%@example.com'` |
| API boot against clean infra | ✅ | `/health` → `{"status":"ok"}` |
| Smoke: search | ✅ | `q=galaxy` returns seeded hits; empty query browses the catalog (the old empty-query block is gone) |
| Smoke: product page API | ✅ | `GET /products/:slug` → 200 |
| Smoke: auth | ✅ | register → login → `/auth/me` 200 → logout 204 → refresh 401 |
| Seed (demo profile) | ✅ | 240 products, 1,200 listings, 120 challenge listings, 42,000 price points in 19.6s |

## Findings

Severity: P0 = broken/unsafe · P1 = real harm · P2 = polish. Status is filled in during FIX.

### P0

**F-01 — Dev compose shares volumes with production; `pnpm docker:reset` would delete the prod database.**
- Where: `docker-compose.yml` (no `name:`), `package.json:28-30`
- Problem: on this server, compose derives project name `pricelens` from the directory. Production containers carry the label `com.docker.compose.project=pricelens`, and their volume is `pricelens_postgres_data`. The dev file declares `postgres_data`, which resolves to the same volume. So `docker:reset` (`docker compose down -v`) removes prod volumes, and `docker:up` starts a second Postgres on prod's data directory. The dev file also publishes 5432/6379/7700 on all interfaces, with hardcoded passwords, on a shared internet-facing host.
- Why it matters: one habitual dev command wipes production.
- Fix: add top-level `name: pricelens-dev`, bind ports to `127.0.0.1`, and make `docker:reset` refuse to run unless the project is `pricelens-dev`.
- Status: Open

**F-02 — Test, seed and migrate scripts load the root `.env`, which on the server is production.**
- Where: `apps/api/package.json:11-15` (`dotenv -e ../../.env -- jest…`), root `package.json:24-27` (`db:*`)
- Problem: on the server, `pnpm test` / `test:integration` run against the prod DB. `auth.integration.spec.ts` registers real users there. `pnpm db:seed` targets prod, and `SEED_RESET=true` deletes marketplace rows (see F-11).
- Why it matters: routine test runs corrupt production data.
- Fix: tests load `.env.test` only, with `NODE_ENV=test`. A Jest global setup refuses to run unless the DB name ends in `_test`, or the host is localhost and the name isn't the prod DB name. Seed gets the same kind of guard (F-11).
- Status: Open

**F-03 — Web production build fails, so no new web image can be deployed.**
- Where: `apps/web/src/app/seller/[orgId]/page.tsx:8` (unused `Badge` import). It came in with `9513e8c wip(web): seller workspace…`, which STAGE-STATUS marks as never built.
- Problem: `next build` runs lint and fails. `Dockerfile.web` runs that build, so `deploy-web.sh` can't produce an image from HEAD. The running `web-green` was built from earlier code.
- Fix: remove the unused import.
- Status: Open

### P1

**F-04 — API lint is red.** `src/main.ts:6-7` use `require()` for helmet and compression. Both packages ship ESM/CJS typings, so default imports work. Fix: `import helmet from 'helmet'; import compression from 'compression';` and confirm that behavior is unchanged. Status: Open

**F-05 — Env file location depends on the working directory.** `app.module.ts:56` uses `envFilePath: ['../../.env.local', '../../.env']`, resolved from `process.cwd()`. Started from `apps/api` (as the npm scripts do), it quietly loads every prod secret not already set. Started from anywhere else, it loads nothing. Fix: resolve the path from `__dirname` or an explicit `ENV_FILE`, and log which file was loaded. Status: Open

**F-06 — No env validation at startup.** Only the JWT secrets are checked, and only in production (`config/auth.config.ts`). A missing `DATABASE_URL` or Redis host shows up later as runtime errors or a hang (see Handoff 03-a). Fix: a zod schema passed to `ConfigModule.forRoot({ validate })` that fails fast with a clear list of what's missing or invalid. `zod` is already a declared api dependency, so nothing new is added. Status: Open

**F-07 — `.env.example` is incomplete.** Used in code but not documented: `API_INTERNAL_URL BROWSER_EXECUTABLE_PATH COMPETITOR_DETECTION_CRON CONNECTOR_COOLDOWN_MINUTES CONNECTOR_FAILURE_THRESHOLD CROSS_STORE_BACKFILL_ENABLED CROSS_STORE_BACKFILL_LIMIT_PER_QUERY CROSS_STORE_BACKFILL_MAX_PRODUCTS FX_BASE_CURRENCY FX_RATES_API_URL FX_RATES_CACHE_TTL_MS FX_RATES_ENABLED LAUNCH_DETECTION_CRON MAP_SWEEP_CRON MEILISEARCH_MASTER_KEY MIN_STORES_PER_PRODUCT NEXT_PUBLIC_SITE_URL STORE_COVERAGE_RETRY_COOLDOWN_HOURS TRUST_PROXY_HOPS WEEKLY_REPORTS_CRON`. Used by compose and set in prod `.env` but not documented: `POSTGRES_USER/PASSWORD/DB`, `MEILI_MASTER_KEY`. Documented but unused: `DRY_RUN`. Status: Open

**F-08 — Missing test harness.** There is no web test runner, no Playwright, and `test:e2e` points at a missing config. The required smoke tests don't exist as automated tests: API health, search with real results, product page, auth login/logout, one matching-pipeline run. Proposed:
- api: Jest smoke suite against the `_test` DB (already installed)
- web: Vitest + @testing-library/react. New deps; justification: nothing installed can render React components.
- e2e: `@playwright/test`, pinned to the version that matches the installed Chromium 1243. New dep; justification: the phase requires Playwright.

Status: Open

**F-09 — No one-command start.** Today you start infra, migrate, seed, then run api and web by hand, and the root `start` script rebuilds everything first. Fix: a `pnpm dev:up` that brings up the isolated infra, waits for health, runs `migrate deploy`, optionally seeds, then runs `turbo dev`. Plus a `.env.development.example` preset with the connectors off, so dev never scrapes real stores by accident. Status: Open

**F-10 — Seed has no production guard, and its defaults are heavy.** `seed/config.ts:46-48`: `SEED_GENERATE_PRODUCTS=true` inserts synthetic products and `SEED_RESET=true` deletes marketplace rows, with only the admin-password check for production. The default profile is `full` (51k products, ~20.4M price rows). Fix: refuse `generateProducts`/`reset` when `NODE_ENV=production` or when the DB isn't local/dev, and default to `demo`. Status: Open

### P2

**F-11 — `lint` script auto-fixes.** `apps/api/package.json:9` has `--fix`, so a check changes files. Split it into `lint` (check) and `lint:fix`. Status: Open

**F-12 — Integration tests leak handles.** They need `--forceExit` (probably Redis/Bull connections from `AppModule`). Fix: close the queues in `afterAll`. Status: Open

**F-13 — Toolchain mismatch on the host.** Host has pnpm 10.34 and no corepack; `packageManager` pins 11.4.0. Host Node is 26.10, while the images use 22. Fix: document `npx pnpm@11.4.0`, and add `.nvmrc`/`engines` guidance. Status: Open

**F-14 — Unused dependencies (knip, verified by grep: 0 imports anywhere in src/scripts/seed/prisma/test).**
- api deps: `bullmq compromise date-fns decimal.js express-rate-limit fast-levenshtein ioredis meilisearch natural nest-winston pino pino-pretty validator winston`. `zod` stays, because F-06 will use it.
- api devDeps: `@types/bull @types/natural`
- web: `dotenv`
- root: `class-transformer class-validator validator`
- Unlisted: `@nestjs/schematics` (nest-cli.json)
- Fix: remove them. Removing `ioredis`/`bullmq` is safe only if `cache-manager-ioredis-yet` and `bull` still resolve, so I'll re-run build and tests after removal. `meilisearch` removal waits on Decision D-1.

Status: Open

**F-15 — Dead code.** Unused files: `web/src/components/search/search-results-skeleton.tsx`, `web/src/components/ui/spinner.tsx`, `api/seed/datasets/brands.ts`. There are also 22 unused exports and 34 unused exported types (full list in knip output). Fix: delete the files, and un-export or delete each export after checking it isn't meant for the web/api contract. Status: Open

**F-16 — 23 unwired scripts in `apps/api/scripts`.** They fall into three groups:
- Ops tools still useful for bot walls: `login-store` (wired), `diagnose-stores`, `probe-stores`, `probe-dom`, `probe-cookies`, `probe-turnstile`, `solve-captcha`
- Applied one-off data fixes: `cleanup-bad-matches`, `cleanup-category-junk`, `merge-color-variants`, `unmerge-wrong-matches`, `split-bad-merges`, `reconcile-duplicates`, `run-reconcile-live`, `dry-run-reconcile-check`, `backfill-brand`, `backfill-embeddings`, `backfill-fx-normalize`
- Scratch experiments: `test-fuzzy-score`, `test-llm-prompt`, `test-model-code-guard`, `test-score-values`, `test-size-guard`

`split-bad-merges.ts` contains a copy of the normalizer ("Mirrors normalizer.service.ts"), which is a duplicate utility. See Decision D-2. Status: Needs decision

## Summary

- The code compiles and the existing 259 api tests pass. There are no circular deps, TODOs, stray console.logs or demo-data fallbacks in production paths, and prod data is clean.
- What's broken: the web build (1 lint error blocks every web deploy) and lint in both apps.
- The biggest risk is operational, not code. On this server, the dev compose, test scripts and seed are all wired to production data (F-01, F-02, F-10). Each is one command away from damaging prod.
- What's missing: env validation, a complete `.env.example`, a one-command dev start, web tests, Playwright, and automated smoke tests.
- Junk: 15 unused api deps, 3 dead files, ~56 unused exports, 17 one-off scripts.
- No code changed in this phase so far. The only commits are the WIP checkpoint (`66baa6c`) and the prompts (`e3017e9`).

## Proposed fix order (once approved)

1. F-01, F-02, F-10: safety guards first, so nothing later can reach prod data.
2. F-03, F-04, F-11: all checks green.
3. F-05, F-06, F-07: env loading + validation + `.env.example`.
4. F-09, F-13: one-command dev start (isolated project, localhost ports, connectors off).
5. F-08, F-12: test harnesses + the 5 smoke tests. The matching smoke test drives `LiveIngestionService` with a fixture listing against the test DB.
6. F-14, F-15, F-16: junk removal, one commit per group, full checks after each.
7. Tag `phase-00-done`.

## Remaining items

All findings are open until the fix step.

## Handoff → other phases

- **01 Architecture**
  - Meilisearch is in the stack and running but used nowhere in code; search is Postgres ILIKE/trgm in `products.service.ts`.
  - `packages/*` is declared but doesn't exist, so the API and web share no contracts.
  - Two queue libs are declared; only `bull` (via `@nestjs/bull`) is used.
  - The matching logic lives inside `LiveIngestionService.findCanonicalMatch` (`scraping/live-ingestion.service.ts:1179`, a 1,555-line file), mixed with DB I/O. There is no explicit 10-step pipeline in the code.
  - The API and the workers run in one process.
- **02 Logic**
  - There's no golden set. The unit tests cover normalizer, fuzzy matcher and outlier filter only.
- **03 Backend**
  - (a) With Redis unreachable, the API never starts listening. It loops on `[ioredis] Unhandled error event: ECONNREFUSED` (42 times in 45s, still not listening).
  - (b) `/health` (`main.ts:40`) checks no dependencies.
  - (c) `ingestion.scheduler.ts:45`: `LIVE_INGESTION_SCHEDULE_ENABLED=false` returns early, which skips price alerts, notification retry, subscription maintenance, reconciliation and brand jobs. That contradicts the comment at line 70 ("not behind an enable/disable flag"), and it removes all repeatables first.
  - (d) `search.controller.ts` takes raw `@Query` strings with no DTO validation.
  - (e) `prisma migrate diff` keeps proposing to drop 6 raw indexes; this needs a durable guard.
- **04 Security**
  - Prod publishes the API on `0.0.0.0:3002`. From my mobile network the port answers with a bare 405 (inconclusive), while localhost returns 200. Verify from a neutral network, and bind it to 127.0.0.1 if the proxy is the only consumer.
  - Access tokens stay valid after logout until they expire (15m).
  - CSP allows `'unsafe-inline'` scripts.
  - CORS accepts requests with no Origin.
  - noVNC in the API image (off by default, password-gated).
- **08 Optimization**
  - The prod API container uses ~3.97 GB RAM and ~117% CPU at idle-ish load (Chrome scrapers in-process).
  - `/products/[slug]` first-load JS is 263 kB.
- **10 DevOps**
  - `podman system df`: 18.17 GB of 24.12 GB of images is reclaimable (24 dangling), and the disk is 89% full.
  - Migrations run at app start (`entrypoint.api.sh`); the phase wants a deploy step.
  - Four `.env.bak*` files with prod secrets sit in the repo dir (gitignored).

## Decisions for Baraa

- **D-1 — Meilisearch: keep or remove?** It runs in prod and is used by nothing. Recommendation: decide in Phase 01 with numbers. If Postgres trgm search passes the Phase 02 Arabic query tests, remove Meili (a container, a dependency and config fewer). Until then I leave it running and only drop the unused npm package once you agree.
- **D-2 — One-off scripts.** Recommendation: move the 7 ops tools to `apps/api/scripts/ops/` and add package scripts for them. Delete the 11 applied data fixes and the 5 scratch `test-*.ts` experiments; git history keeps them.
- **D-3 — Where dev/test runs.** This box has 2 CPUs, 10 GB RAM and 22 GB free disk, shared with production and other projects. Recommendation: keep a small isolated dev stack here (`pricelens-dev`, localhost ports, connectors off) for smoke tests, and run the full CI (typecheck/lint/test/build/e2e) on GitHub Actions in Phase 10.
- **D-4 — Prune dangling images (18 GB)?** Recommendation: yes, keeping the `latest`, `staging` and `rollback` tags. It's safe, but it's your server, so I haven't done it.
- **D-5 — Web test runner.** Recommendation: Vitest + Testing Library for components, and Playwright for e2e. Alternative: Jest, to match the api (one runner, but slower and needs more Next config).
