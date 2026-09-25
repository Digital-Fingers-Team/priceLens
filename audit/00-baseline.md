# Audit 00 — Baseline & safety net

Date: 2026-09-25 · Branch `feat/price-intelligence-platform` · Started at tag `phase-00-start` (`e3017e9`)
Status: **DONE**. All findings are fixed or have a recorded decision. Tag `phase-00-done`.

## How this was run

Everything ran on the pricelens server, isolated from production:

- Dependencies were installed on the host with `npx pnpm@11.4.0 install --frozen-lockfile`. `.dockerignore` excludes `node_modules`, so this doesn't touch image builds.
- The audit used a throwaway compose project (`pricelens-audit`, outside the repo, on localhost ports). After F-01, the real dev stack `pricelens-dev` (127.0.0.1:5432/6379/7700) replaced it.
- The API and web app ran on ports 13001/13000, because 3001 on this server belongs to aradobot-web.
- Production (`pricelens-*`) containers were never touched. Production access was limited to read-only `SELECT`s, read-only Redis `SCAN`, and reading `.env` variable names.

## Results

| Check | Before (phase-00-start) | After (phase-00-done) |
|---|---|---|
| api typecheck | ✅ 0 errors | ✅ 0 errors |
| web typecheck | ✅ 0 errors | ✅ 0 errors |
| api lint | ❌ 2 errors | ✅ 0 |
| web lint | ❌ 1 error | ✅ 0 |
| api build | ✅ | ✅ |
| web build (`next build`) | ❌ **fails on lint** | ✅ 19 routes |
| api unit tests | ✅ 243 | ✅ 269 (+26: env, seed, test-DB guard, `.env.example`) |
| api integration tests | ✅ 16, but loaded prod `.env` and needed `--forceExit` | ✅ 16 on `pricelens_test`, exits on its own |
| api e2e smoke | ❌ config missing | ✅ 6: health, matching run, search, product, auth |
| web component tests | ❌ none | ✅ 8 (Vitest) |
| Playwright e2e | ❌ none | ✅ 6 (3 flows × desktop 1440 + mobile 375) |
| one-command dev start | ❌ | ✅ `pnpm dev:up` |
| env validated at startup | ❌ (JWT only) | ✅ zod schema; prod `.env` validated (37 vars) |
| migrations from zero | ✅ 11/11 | ✅ 11/11 (dev and test DBs) |
| circular deps (madge 8) | ✅ none | ✅ none |
| TODO/FIXME, console.log, demo fallbacks in src | ✅ none | ✅ none |
| unused deps / files / exports (knip) | 20 deps, 25 files, 56 exports | 0 deps; remaining files are knip-invisible test entry points; 3 exports kept on purpose (F-15) |

Evidence commands (all run on the server): `npx tsc --noEmit`, `npx eslint "{src,test}/**/*.ts"`, `next lint`, `next build`, `pnpm run test:unit|test:integration|test:e2e` (api), `vitest run`, `playwright test` against `pnpm dev:up` on ports 13000/13001, `npx madge@8 --circular`, `npx knip@5`. Outputs are quoted in the commit messages.

## Findings

Severity: P0 = broken/unsafe · P1 = real harm · P2 = polish.

### P0

**F-01 — Dev compose shared volumes with production. `pnpm docker:reset` would have deleted the prod database.**
- Where: `docker-compose.yml` (no project name), `package.json` docker scripts
- Fix: `name: pricelens-dev`, `-p pricelens-dev` in every script, ports bound to 127.0.0.1, and `pricelens_test` created at init.
- Evidence: `docker:up` created `pricelens-dev_*` volumes; the prod `pricelens_*` volumes were untouched.
- **Fixed** in `80a6342`.

**F-03 — Web production build failed, blocking every web deploy.**
- Where: `apps/web/src/app/seller/[orgId]/page.tsx:8`, unused `Badge` import
- **Fixed** in `e21d300`. `next build` passes.

### P1

**F-02 — Test, seed and migrate scripts loaded the root `.env` (production on the server).**
- Correction to the first version of this audit: I first rated this P0. On the host, the prod `DATABASE_URL` host `postgres` doesn't resolve, so a run fails instead of writing. The real exposure is running the suite inside the API container, which ships `test/` and has the prod env. Downgraded to P1.
- Fix: tests load the committed `.env.test`. A Jest global setup refuses `NODE_ENV=production` and any database that isn't local and named `*_test`.
- Evidence: a prod-style `DATABASE_URL` gets `Refusing to run tests: database "pricelens" does not end in "_test"`; `NODE_ENV=production` gets `Refusing to run tests: NODE_ENV is "production"`.
- Also fixed: `deploy-api.sh` runs the unit tests inside the built image under `NODE_ENV=production`. That step now passes `NODE_ENV=test` and a `*_test` placeholder, otherwise the guard would have blocked the next deploy. Verified by building a real image (see F-02b below).
- **Fixed** in `bfc3a68` and `534d1d6`.

**F-04 — API lint red** (`require()` in `main.ts`).
- Fix: imports. `compression` uses `import * as`, because without `esModuleInterop` a default import is `undefined` at runtime.
- Evidence: helmet headers and gzip verified on a live boot.
- **Fixed** in `e21d300`.

**F-05 — Env file path depended on the working directory.**
- Fix: `config/env-files.ts` walks up to `pnpm-workspace.yaml` (or uses `ENV_FILE`), loads no file under `NODE_ENV=test`, and logs what it loaded. Production is unchanged: the image has no repo root, and compose injects the env.
- **Fixed** in `bfc3a68`.

**F-06 — No env validation at startup.**
- Fix: a zod schema as the ConfigModule `validate` hook. It lists every problem, names only.
- Evidence: a bad env fails boot with `DATABASE_URL: is required / AMAZON_ENABLED: must be "true" or "false" / REDIS_PORT: must be a number`, and the prod `.env` validates.
- **Fixed** in `7739661`.

**F-07 — `.env.example` was incomplete.**
- Fix: added the 20 missing variables plus the compose-only `POSTGRES_*`/`MEILI_MASTER_KEY`. A unit test now fails when code reads an undocumented variable.
- Correction: `DRY_RUN` was a false positive; it only appears inside a comment about `RECONCILIATION_DRY_RUN`.
- **Fixed** in `4bfeee5`.

**F-08 — No test harness and no smoke tests.**
- Fix: API smoke suite in `jest.e2e.config.js` + `test/e2e/`; the request pipeline is extracted to `configureApp()` so tests run exactly what `main.ts` runs. On the web side: Vitest + Testing Library, and Playwright.
- New dependencies, each justified: `vitest` 4.1, `jsdom`, `@testing-library/react` and `/dom` (nothing installed could render React), and `@playwright/test` 1.63.0 (the phase requires it; its Chromium build 1243 was already on the server). I used Vitest 4.x instead of 5.0.2 because 5.0.2 is newer than the workspace's minimum-release-age policy, and pnpm tried to add a policy exception.
- **Fixed** in `558d1ba` (api) and `2e33a20` (web).

**F-09 — No one-command start.**
- Fix: `pnpm dev:up` (infra → health → migrate dev+test → seed if empty → API + web), with the committed `.env.development` keeping all connectors and paid APIs off.
- Evidence: a cold start on the server served `/health` 200, seeded search results, and an SSR product page; Ctrl-C freed both ports.
- **Fixed** in `8dfb1c2`.

**F-10 — Seed had no production guard and defaulted to 20M rows.**
- Fix: `SEED_GENERATE_PRODUCTS`/`SEED_RESET` are refused under `NODE_ENV=production`, and the default profile is now `demo`.
- **Fixed** in `ee311e7`.

### P2

**F-11 — `lint` script auto-fixed files.** Split into `lint` and `lint:fix`. **Fixed** in `e21d300`.

**F-12 — Test runs never exited.**
- Root cause: the CacheModule's ioredis client is never closed. The same bug makes graceful shutdown during deploys wait out the kill timeout.
- Fix: an `OnApplicationShutdown` provider quits it.
- Evidence: no Redis socket remains after `app.close()`, and all suites exit on their own.
- **Fixed** in `64f8bda`.

**F-13 — Toolchain mismatch.** Added `.nvmrc` (22) and documented `npx pnpm@11.4.0` in the README. The server's global pnpm 10 was left alone, because other projects use it. **Fixed** in `8dfb1c2`.

**F-14 — 20 unused dependencies.** Removed. The Meilisearch container keeps running pending D-1.
- Evidence: frozen-lockfile install and all checks; the built API boots and serves search.
- **Fixed** in `1b04c89`.

**F-15 — Dead files and exports.**
- Deleted 4 files and 15 exports. Removed the `export` keyword from 12 symbols that are only used inside their own file.
- Kept on purpose:
  - `LoginDto`: see Handoff 03-f.
  - `InsufficientData`: the "we don't know" state, meant for Phase 06 empty states.
  - `useDeleteSellerProduct`: the seller UI is in progress.
- **Fixed** in `5b349a6`.

**F-16 — 23 unwired scripts.**
- Per D-2: 7 store-ops tools moved to `apps/api/scripts/ops/` with a README; 11 applied data fixes and 5 scratch experiments deleted (all kept in git history).
- **Fixed** in `0d0c6a5`.

### Found while fixing

**F-02b — `deploy-api.sh` would have failed after F-02.** See F-02. **Fixed** in `534d1d6`.

**F-17 — Product pages merge different RAM variants (reported by Baraa with a screenshot of the Galaxy A57 page).** Handed off to Phase 02 as **P0**. Phase 02 owns the matching logic, so it isn't fixed here.
- Evidence (prod, read-only): product `galaxy-a57-galaxy-a57-dual-sim-5g-256gb-8gb-awesome-navy` holds 18 listings, **8 with 8GB RAM and 10 with 12GB RAM**, all `ACCEPTED` at confidence 1.00. So "Best Deal" (EGP 26,325, an 8GB unit), all-time low/high and the median all compare different products.
- Root cause 1: `NormalizerService.extractRam` (`normalizer.service.ts:355`) only recognizes RAM written with a "RAM" label. It returns nothing for Jumia's `256GB/8GB` and `8GB - 256GB` formats. A missing RAM value is then treated as compatible with any RAM.
- Root cause 2: the one-off `merge-color-variants.ts`, run on 2026-09-25 at 17:00 (rollback file `backups/merge-color-variants-2026-09-25T17-00-17-526Z.json`), relies on the same extraction. It moved `Galaxy A57 … 256GB/12GB` into the 8GB product. Live matching then attached the other 12GB listings to it.
- Also seen:
  - 3 Amazon rows with an identical title and price on the same product (duplicate listings shown as separate offers).
  - Four colors merged into one product, which is intended per the color-merge design. Whether it's acceptable when prices differ by color is a decision (D-6).
- Needed in Phase 02:
  - Fix RAM/storage extraction for every title format, with golden tests.
  - Treat an unknown variant as *not* compatible when the other side has one.
  - Re-split affected products using the rollback file plus a re-match.
  - Count how many products have mixed RAM or storage.

## Summary

- The three ways routine commands could damage production are closed: dev compose volumes, tests against the prod env, and seed/reset in production. Each has a guard that fails loudly, and each guard was proven by triggering it.
- Every check is green: lint, typecheck and build in both apps; 269 unit, 16 integration and 6 e2e API tests; 8 component and 6 Playwright tests.
- One command (`pnpm dev:up`) brings up a safe local stack with demo data and no real scraping.
- The environment is validated at boot, and `.env.example` is complete and enforced by a test.
- Two latent production problems were found and fixed along the way: Redis not closed on shutdown, and a deploy-script step that the new guard would have broken.
- Cleanup: 20 unused deps, 4 dead files, 15 dead exports and 16 one-off scripts removed.
- The biggest open product problem is F-17 (wrong variant merges), handed to Phase 02 as P0.

## Remaining items

- None within Phase 00 scope.
- D-4 (prune dangling images) needed no action: by the time of the fix step, someone had already pruned them outside this session. `podman images -f dangling=true` is empty, and disk use is down from 89% to 46%.

## Handoff → other phases

- **01 Architecture**
  - Meilisearch runs but no code uses it; search is Postgres (D-1).
  - `packages/*` is declared but doesn't exist, so there are no shared contracts.
  - Matching lives inside the 1,555-line `LiveIngestionService` alongside I/O. The "10-step pipeline" isn't explicit anywhere in the code.
  - The API and workers run in one process.
  - `CONFIDENCE_THRESHOLDS` (0.88/0.60) was dead code, so the thresholds the matcher actually uses are elsewhere.
- **02 Logic**
  - **F-17 (P0).**
  - There's no golden set.
  - `web/src/lib/utils/price.ts isBestDeal` compares price only, with no variant, stock or staleness awareness.
- **03 Backend**
  - (a) With Redis unreachable, the API never starts listening; it loops on `[ioredis] Unhandled error event`.
  - (b) `/health` checks no dependencies.
  - (c) `ingestion.scheduler.ts:45`: `LIVE_INGESTION_SCHEDULE_ENABLED=false` also skips alerts, notification retry, billing maintenance, reconciliation and brand jobs. Prod runs with `true`, so this isn't live, but `.env.example` recommends `false` (a warning is now documented there).
  - (d) `search.controller.ts` takes raw `@Query` strings with no DTO.
  - (e) `prisma migrate diff` keeps proposing to drop the 6 raw-SQL indexes.
  - (f) Login uses passport-local, whose guard runs before pipes, so the login body is never DTO-validated and `LoginDto` is unwired.
  - (g) Integration tests share the dev Redis (queue db 1) with the dev stack.
- **04 Security**
  - The API is published on `0.0.0.0:3002`; public reachability is inconclusive from a mobile network.
  - Access tokens stay valid until expiry after logout.
  - CSP allows `'unsafe-inline'` scripts.
  - CORS accepts requests with no Origin.
  - `LoginDto`: see 03-f.
  - `next.config.js` allows `dummyimage.com`, which only the dev seed uses.
- **05 Frontend / 06 UX**
  - The mobile menu button has no accessible name.
  - The navbar nests `<button>` inside `<a>` (invalid HTML, double tab stops).
  - The search form has no `action`/`name`, so a submit before hydration reloads the page instead of searching.
  - Store listings table on mobile: a horizontal scrollbar and truncated titles hide RAM and storage (screenshot).
  - `InsufficientData` is ready to use for empty states.
- **08 Optimization**
  - The prod API container uses about 4 GB RAM and ~117% CPU (in-process Chrome).
  - `/products/[slug]` first-load JS is 263 kB.
- **10 DevOps**
  - Migrations run at container start.
  - `.env.bak*` files with prod secrets sit in the repo directory (gitignored).
  - Suggested CI: `pnpm dev:up`-equivalent services + `test:unit/integration/e2e` + vitest + Playwright.
  - A `knip` config would make the dead-code check CI-able; test entry points currently show as "unused files".

## Decisions for Baraa

- **D-1 — Meilisearch:** approved to decide in Phase 01, with measurements. The npm package was removed; the container is untouched.
- **D-2 — One-off scripts:** approved and done (F-16).
- **D-3 — Where dev/test runs:** approved: an isolated `pricelens-dev` here; full CI on GitHub Actions in Phase 10.
- **D-4 — Prune dangling images:** approved; already done outside this session (see Remaining items).
- **D-5 — Web test runner:** approved and done (Vitest + Playwright).
- **D-6 — New: should one product page merge colors?** Today, colors are folded into one product (Galaxy A57: Navy, Gray, Icyblue, Lilac). That's good for comparing stores, but when colors are priced differently, "Best Deal" can point at a color the user doesn't want. **Recommendation:** keep one product per model+storage+RAM, show the color on each offer row, and add a color filter on the page (Phase 06).
- **D-7 — New: repairing F-17 data in production.** Re-splitting the mixed products changes live pages and price history. **Recommendation:** in Phase 02, fix the extraction first, then run a dry-run report of every product with mixed RAM or storage for your review before applying it with a rollback file.
