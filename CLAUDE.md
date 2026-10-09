# PriceLens: the one project file

Everything a session needs, in one place. On 2026-10-09 it replaced the old docs: ARCHITECTURE, DEPLOY_NOTES, NEXT_SESSION, PROGRESS, PROJECT_MAP, RELEASE_REPORT, SECURITY, docs/RUNBOOK, docs/adr, docs/matching-pipeline, the feature plan, `audit/00-11` and the folder READMEs. They are still in git history at tag `v2.0.0` and commit `550c2a6`. Code comments that cite audit ids (F-17, D-31, QA-18, …) point there.

## Rule: keep this file current

- **When you finish something** (a feature, fix, deploy, data job or owner decision), update this file in the same commit. Edit **Status**, **Open items** and whatever section the work touched. Remove anything that is done or no longer true.
- This is not a log. Don't append session diaries. Keep it short (under ~300 lines). Write absolute dates (2026-10-09), never "yesterday".
- Don't create new plan, report or notes `.md` files in the repo or in `~/pricelens-work/`. Put the lasting facts here. If a long spec is unavoidable, delete it when the work is done and keep only the decision here.
- `README.md` stays as a short public front page. It holds no project knowledge.

## Status (updated 2026-10-09)

- Live at **https://pricelens.store**, Arabic by default (`/en/...` for English, `/ar/...` 308-redirects). `pricelens.work.gd` and `www` 301 to it; work.gd still proxies `/api/`.
- Live code: `main` at `550c2a6`. Web on `pricelens-web-green` (127.0.0.1:3011), deployed 2026-10-09.
- Latest work:
  - 2026-10-09: PageSpeed and SEO. A CDN-resizing image loader, inline CSS, "سعر X في مصر اليوم" titles, the brand in the home title, and the favicon. Also legal pages with consent at sign-up and payment, and a nightly personal-data cleanup job.
  - 2026-10-03: Ink & Coral rebrand with Space Grotesk, a frontend redesign, the Telegram status board, cross-category duplicate cleanup, a split sitemap and new prices (Plus 99, Seller 799, Seller Plus 1799 EGP).
- Payments: wallet/InstaPay transfer, then the owner approves it in `/admin/payments` (live since 2026-09-30). Paymob and Stripe are off: the owner has no registered business and won't do the paperwork, so don't suggest gateways that need it.
- Categories: 22 departments and 161 leaves. All waves are on (`CATEGORY_SWEEP_MAX_WAVE=4`). `OFFER_MAX_AGE_DAYS=14`.
- Stores: Amazon.eg, Noon, Jumia, 2B, Elaraby, B.TECH, Dream 2000, Tradeline, Compumarts, AliExpress and Alibaba. Carrefour is off: Akamai answers 403 to the cloud IP.

## Open items

Owner only:
- **Search Console:**
  - Add pricelens.store and use Change of Address from work.gd, if not done yet.
  - Request indexing of `/`.
  - The "Page with redirect" entries come from the domain move and are expected. Ignore "missing aggregateRating/review": we never invent reviews.
- **Credentials not set in the prod `.env`:**
  - `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET`. These are for the user bot; the alert bot @Pricelens1_bot already works. After setting them, run `deploy-api.sh --no-build`, then `POST /api/v1/admin/telegram/webhook` once as admin.
  - `SMTP_*` and `EMAIL_FROM`. Until then email alerts are SKIPPED and invites show a link to copy.
  - `ANTHROPIC_API_KEY` (optional).
- **CI required on `main`.** This is a repo setting and needs a GitHub admin; the server's `gh` account `Nad1j` can only pull.
- **Housekeeping:**
  - Change the admin password; it was pasted in chat.
  - Optionally rotate the alert-bot token, which was also pasted in chat.
  - Delete the 16 old `~/pricelens/.env.bak*` / `backups/env-before-*` files when rollback is no longer needed.
  - `podman volume rm pricelens_meili_data`. It has been unused since 2026-09-26 and was due for removal after 2026-10-03.
- **Gemini quota:** the free tier allows 500 requests a day per Google project per model. More keys only help if each comes from a different Google account.
- **Data only the owner can source:**
  - Fees for categories outside electronics and appliances (`/admin/fee-tables`).
  - Installments for valU, Sympl, Souhoola, B.TECH and HSBC, and confirmation of the CIB/Noon terms (`/admin/buyer-offers`).
  - Coupons and bank offers, only codes someone has actually tried.
  - Real customs rates; 15% and 14% VAT are placeholders (`/admin/landed-cost`).

Engineering:
- Disk is 82% full (2026-10-09) and the monitor alerts at 85%. Check `podman system df -v` and the Chrome `BrowserMetrics/*.pma` files.
- Give scheduled jobs their own queue or concurrency so they never wait behind scrapes. Also find what keeps requesting store expansions; they are capped by `STORE_EXPANSION_MAX_WAITING=100`.
- Matcher: no CPU-model guard (QA-16).
- Category pages render per request (QA-11) because `?page` is read from `searchParams`.
- On phones a sort change sometimes does nothing (QA-18). Next aborts the RSC request; it predates the overhaul, and CI retries it.
- Some API error texts and the Deal Hunter reasons are English in the Arabic UI.
- In PDFs, an Arabic label followed by ":" and a Latin value puts the colon on the wrong side.
- Long Arabic product names push "في مصر اليوم" past Google's ~60-character title cut. Shortening them in titles is optional.
- Never built or deferred:
  - MAP email digest.
  - Review summaries: no review source.
  - Repricer auto mode: no official seller API.
  - Raya and Select: no readable catalogue.
  - Grocery and pharmacy stores.
  - Mock checkout: the payment step was never completed end to end.

## Where things are and how to work

- **Server:** `ssh pricelens` (opc@130.110.124.121; 2 CPUs, 10 GB RAM, rootless podman). It is shared with other live projects: AradoBot, SLI, Connection Map, EduKid and others. The deploying checkout is `~/pricelens` (branch `main`, remote `origin` = GitHub).
- **The phone (Termux):**
  - The local clone is `~/pricelens-work/repo`. Its remote `origin` is the server repo.
  - Edit locally on a branch based on `origin/main`.
  - `~/pricelens-work/sync.sh` pushes HEAD to the server branch `phase00-sync` and fast-forwards `~/pricelens`.
  - `~/pricelens-work/apply.sh` copies uncommitted changes onto the server tree for testing. Undo it with `git checkout -q -- . && git clean -fdq <the paths you added>`. Never `git clean` the repo root: it holds the prod `.env` and `backups/`.
  - Termux quirks:
    - `grep`, `which` and `wc` are broken locally (shared-library error), including inside loops; `git grep` with `\|` crashes. Use node, or grep on the server.
    - There is no python.
    - Heredoc quoting over ssh breaks, so edit locally and sync instead.
- **Git:**
  - Other sessions also commit to `main`: fetch and rebase first.
  - Push to `main`, then `git merge --ff-only origin/main` in `~/pricelens`.
  - Keep the Co-Authored-By and Claude-Session trailer lines the session gives.
  - Use `npx --yes pnpm@11.4.0`; the host pnpm is 10.x. If pnpm's minimum-release-age policy wants exceptions in `pnpm-workspace.yaml`, pick an older version instead.
- **Long commands** (builds, deploys, test suites) run in the background. On the server use `setsid … > /tmp/x.log`, then poll; otherwise ssh drops.
- **Permissions:** Claude Code's auto mode may block prod deploys, prod DB writes and `podman exec`. When it does, write the script to `~/x.sh` and have the owner run `! cat ~/x.sh | ssh pricelens bash`. Their input box drops text after `<`.

## Production safety (non-negotiable)

- `~/pricelens/.env` is **PRODUCTION**:
  - Never print its values.
  - Never run `pnpm db:migrate`, `db:seed`, `db:studio` or `dotenv -e .env` against it.
  - Back it up (`cp .env .env.bak-<date>`) before editing it.
- **Never kill processes by name or pattern** (`pkill`, `killall`, `kill $(pgrep …)`). Container processes are visible on the host. A `pkill` once killed the prod API twice, and nginx then served 502s. Kill only PIDs you recorded, after checking `/proc/<pid>/cwd`.
- Don't touch other projects' containers (aradobot*, omp-*, sli-*, quran-*, hermes, …). Don't prune images or volumes you didn't create.
- Before data repairs: take a `pg_dump -Fc` into `~/backups`, do a dry run, then `--apply` with a rollback file. Read-only prod SQL: `~/pq.sh` (psql from stdin), or `podman exec pricelens-postgres psql -U pricelens -d pricelens`.
- Test on the dev stack, never prod: `cd ~/pricelens && API_PORT=13001 WEB_PORT=13000 npx -y pnpm@11.4.0 dev:up`.
  - It runs as compose project `pricelens-dev` on localhost, with every store connector, scrape and paid API off (`.env.development`).
  - Port 3001 belongs to aradobot-web.
  - Stop what you start.
- Run heavy jobs (image builds, `next build`, Playwright) one at a time.

## Stack

- Monorepo (pnpm 11.4.0, turbo, Node 22):
  - `apps/api`: NestJS 11 + Prisma 5.22, PostgreSQL 16 (pgvector, pg_trgm), Redis, Bull.
  - `apps/web`: Next.js 15.5 App Router, React Query, Zustand, Tailwind, Recharts.
  - `packages/contracts`: shared types only.
- Containers, all in `docker-compose.server.yml`:
  - `pricelens-proxy`: nginx 1.27 + Brotli in the **host network**, so upstreams are loopback ports, never container names.
  - `pricelens-api` (`PROCESS_ROLE=api`, 127.0.0.1:3002): HTTP only, enqueues jobs.
  - `pricelens-worker` (`PROCESS_ROLE=worker`): Bull jobs, schedulers, Chrome under Xvfb (patchright, sandbox on, uid 1000).
  - `pricelens-web-blue` / `-green` (127.0.0.1:3010 / 3011).
  - `pricelens-postgres` and `pricelens-redis`: db0 is the cache, db1 the Bull queues.
- Web SSR calls the API directly (`API_INTERNAL_URL`). Its renders are signed with `WEB_INTERNAL_TOKEN`, so search is rate-limited per visitor and cached-page renders are not throttled.
- Env:
  - The root `.env` is shared by both apps.
  - `.env.example` documents every variable; a unit test fails on an undocumented one.
  - The API validates its env with zod at boot and refuses to start on problems.
  - New config keys go in `.env.example` and `test/unit/config-keys.spec.ts`.
  - `NEXT_PUBLIC_*` is compiled into the bundle, so never put a secret there.
- Feature flags: `/admin/flags` wins, then `FEATURE_<KEY>`, then the default. Every feature also needs a plan entitlement (`@RequiresFeature`, `useEntitlement()`).

## Tests and gates

- API:
  - `npx tsc --noEmit`, `npx eslint "{src,test}/**/*.ts"`, `npx nest build`.
  - `pnpm run test:unit`, `test:integration`, `test:e2e`. Integration and e2e need the dev stack.
  - Tests load `.env.test` and refuse any database that isn't local and named `*_test`. Run `pnpm test:db:migrate` after new migrations.
  - e2e suites must use `test/e2e/offline-stores.ts` (`offlineStores()` fakes every connector and the AI judge; call `clearTestRedis()` first).
  - New routes need a line in `endpoints.e2e-spec.ts`. `UPDATE_OPENAPI=1` regenerates `docs/openapi.json`.
- Web: `npx tsc --noEmit`, ESLint, `vitest run`, `next build`. Run Playwright when you touch flows: `E2E_BASE_URL=http://localhost:13000 E2E_API_URL=http://localhost:13001/api/v1 npx playwright test`. URLs are Arabic-first.
- Matching:
  - The characterization suite (`test/e2e/matching-characterization.e2e-spec.ts`) snapshots where about 60 listings land. A deliberate change runs `-u`, and the snapshot diff gets reviewed like code.
  - The golden set (`test/golden/`) holds CI to precision 1.0.
- CI (`.github/workflows/ci.yml`) runs gitleaks, `pnpm audit` (high), and all of the above.
- If you change the Docker or deploy path, prove it with a check image (`localhost/pricelens_api:<tag>-check`) and then delete it.

## Deploy and roll back

- Take `pg_dump -Fc` into `~/backups` before API deploys that carry migrations. Deploy the API before the web when both change.
- `./scripts/deploy-api.sh`:
  1. Builds the image and runs the unit tests inside it.
  2. Applies migrations with `lock_timeout=15s`: a blocked migration fails and the live API stays as it is.
  3. Swaps the API (about 25 s down), reloads nginx, then swaps the worker.
  - `--no-build` only restarts with the new `.env`.
- `./scripts/deploy-web.sh`: blue/green. The new colour boots beside the old one, then nginx switches. If boot fails, the old colour keeps serving.
  - The live colour is in `docker/nginx-upstreams/web.conf`. It is untracked on purpose and written by the script; to edit it by hand, truncate it, never replace the file.
  - The runtime image must contain every file `next start` checks, such as `images.loaderFile`.
- Roll back the API: `podman tag localhost/pricelens_api:rollback localhost/pricelens_api:latest && ./scripts/deploy-api.sh --no-build`.
  - Roll back the web: point `web.conf` at the old colour, or redeploy the old commit.
  - Migrations are never rolled back. So far all are additive; if one ever needs undoing, restore into a new database.
- After a deploy, check:
  - `podman ps`
  - `curl https://pricelens.store/api/v1/billing/plans`
  - the site returns 200
  - `podman logs --tail 50 pricelens-worker`
- `nginx.prod.conf` is a single-file bind mount. After any git operation that rewrites it, run `podman restart pricelens-proxy`; a reload reads the stale inode.

## Runbook

- **Health checks:**
  - `curl -s 127.0.0.1:3002/health/ready` checks Postgres and both Redis dbs.
  - `/health/ops` shows the backlog, per-store freshness and memory. It is internal; the proxy returns 404 for it.
  - `scripts/monitor.sh`.
  - The queue board at `/api/v1/admin/queues` (admin only).
- **Timers** (systemd `--user`):
  - `pricelens-monitor` (every 5 min): alerts go to Telegram via `~/.config/pricelens/alerts.env`; test with `MONITOR_TEST=1`.
  - `pricelens-status`: live status board. `STATUS_DRY=1` prints it, `STATUS_RESEND=1` posts it again.
  - `pricelens-db-backup` (03:15 UTC): writes `~/pricelens/backups/db/`, keeping 7 daily and 4 weekly. `scripts/restore-db.sh <dump> <new_db>` never overwrites.
  - The web and API upstream watchdogs.
  - Certificate renewal.
- **API 502 while the container is healthy:** `podman exec pricelens-proxy nginx -s reload`.
- **A store goes stale** (`refreshed24h` is 0 in `/health/ops`):
  1. Read `podman logs --since 1h pricelens-worker 2>&1 | grep -i <store>`.
  2. A failing store is paused 30 min by its circuit breaker. 18% of scrapes fail fast at bot walls; that is normal.
  3. For a CAPTCHA (Alibaba asks now and then):
     1. Set `ENABLE_NOVNC=true` and run `deploy-api.sh --no-build`.
     2. Open a tunnel with `ssh -N -L 16081:127.0.0.1:6081 pricelens`, then go to http://localhost:16081/vnc.html. The password is `VNC_PASSWORD` in `.env`.
     3. Run the login script in `apps/api/scripts/ops/login-store.ts` (`pnpm login:alibaba|noon|amazon`).
     4. Turn noVNC off again.
     - Browser profiles live on the `pricelens_browser_profiles` volume.
  4. "Missing X server": recreate the worker. Selector changes: fix the connector in `scraping/connectors/`.
- **Ops scripts** (`apps/api/scripts/ops/`, dry run by default, `--apply` writes a rollback file, `--rollback <file>`):
  - `diagnose-stores`, `probe-stores`, `probe-dom`, `probe-cookies`, `probe-turnstile`
  - `repair-variant-mixes`, `clean-duplicate-products` (needs `PROCESS_ROLE=api`), `backfill-normalized-titles`
  - `audit-product-offers`, `recategorize-products`, `category-sweep-plan`
  - In the container run with `BACKUP_DIR=/tmp/backups` (the image is non-root), then `podman cp` the file out.
- **Run a job now:** enqueue its name (for example `run-weekly-reports`) on queue `ingestion`, Redis db `REDIS_QUEUE_DB` (1). Or call the service in a standalone Nest context with `PROCESS_ROLE=api`.
- **Worker memory:** `WORKER_MAX_HEAP_MB=1200` recycles the worker and writes a snapshot to `/tmp/heap`. Each browser recycles every 40 pages, and service workers are blocked. That fixed the old leak; memory now holds at 300-420 MB.
- **Disk:** check `df -h /`, then `podman system df -v`. Chrome `BrowserMetrics/*.pma` files in the profiles volume are safe to delete; a launch loop once wrote 52 GB in 2 h.
- **Rotating secrets:**
  - JWT secrets (32+ characters): change them in `.env`, then `deploy-api.sh --no-build`. Everyone is signed out.
  - Postgres/Redis passwords: change them inside the service first, then in `.env`.
- **Locks:** a long reconciliation query can block a migration, and the site hangs behind it. Check `pg_stat_activity` and cancel that query.
- **Category seeding** in the container: `podman exec pricelens-api sh -lc "cd /repo/apps/api && ./node_modules/.bin/ts-node seed/upsertCategoryTree.ts"`.

## Architecture essentials

- **Data flow:**
  - Crons, every search (30 s cooldown per query), page views below the store target, and admin triggers all enqueue jobs on the `ingestion` queue.
  - A job calls `connector.searchListings`, then `ListingProcessor` runs the matching pipeline and writes to Postgres. The tables are `canonical_products`, `source_listings`, `price_history` (one row per *change*, plus the daily rollup `price_daily`) and `match_decisions`.
  - Prices are converted to EGP once, at ingestion. The column is called `priceUsd` for historical reasons; `rawPrice`/`rawCurrency` keep the store's amount.
- **Queues:** Bull 4 on Redis db 1, with named jobs on `ingestion` (the contract is `workers/ingestion.jobs.ts`) plus `affiliate-conversion`.
  - Every job gets 3 attempts with exponential backoff.
  - On boot the scheduler re-adds the repeatable jobs from config. `LIVE_INGESTION_SCHEDULE_ENABLED=false` disables all of them.
  - Scheduled jobs have priority over store expansions.
- **Matching** (`apps/api/src/matching/pipeline/`; pure steps, all thresholds in `thresholds.ts`):
  - The steps, in order:
    1. Price gate.
    2. Junk filter (sponsored, wholesale).
    3. Normalize: Arabic and English, RAM/storage in every format, colors as whole words only.
    4. Currency: an unknown currency is rejected.
    5. Category sanity: accessories, and the floor at 2.5% of the median.
    6. GTIN/MPN.
    7. Exact title, with every guard applied.
    8. Conflict guards: brand, accessory, type, chip, tier, model code, identifier, condition, bundle, year, storage, RAM, display, quantity. **Never color.**
    9. Rank and decide.
    10. Market outlier.
  - Candidates are the 200 most similar titles in the category plus the model's products.
  - **Only the AI judge's "yes" merges** (Gemini, 8 titles per request, key and model slots rotated). Barcode and exact-title matches still merge without it. With no AI answer the listing becomes its own product, and the hourly reconciliation retries with the same guards.
  - Precision beats recall: two products shown as one is worse than one product shown twice.
- **Live offer** (`prices/offer-rules.ts`): accepted, price above 0, in stock, and seen within `OFFER_MAX_AGE_DAYS`. Each store keeps only its cheapest offer per title. Products with no offer are left out of search, browse and the sitemap, and their pages are noindex.
- **Categories:**
  - Roots are level 0 and leaves level 1.
  - `rollout_wave`: 0 is always swept, 1-4 are the waves, -1 is retired.
  - `min_price_egp`: 0 means no floor; NULL means `MIN_LISTING_PRICE_EGP` (5000) applies to new categories.
  - Model-family aliases live in `scraping/ingestion/category-aliases.ts`, never in `search_terms`.
- **Arabic:**
  - `canonical_products.title_ar` is filled by `TitleTranslationService` (worker job every 15 min, 40 titles per request).
  - The web picks a title with `productTitle(product, locale)`.
  - Search matches `search_text`, which includes `title_ar`.
  - Share cards need `lib/og/arabic-shape.ts`, because Satori can't shape Arabic.
- **Search** is Postgres only (`pg_trgm`, the `search_text` columns, scoring in SQL). p50 is about 190 ms. There is no search engine.
- **Errors:** `{success:true,data,meta?}` or `{success:false,error:{code,message,details?,requestId,timestamp,path}}`, through one `ApiExceptionFilter`. Domain errors extend `AppException`. Codes are never renamed.
- **Adding a store:**
  1. A `RetailerConnector`, usually extending `JsonLdSearchConnector` or `MagentoGraphqlConnector`.
  2. One line in `CONNECTOR_CLASSES` (`scraping/connectors/connector.registry.ts`).
  3. Its `*_ENABLED` and `*_BASE_URL` config.
  4. A `platforms` row with the same slug.
- **Web:**
  - Product pages use ISR at 300 s, and the browser refreshes prices older than 2 minutes. Browse pages are cached 60 s, the sitemap 6 h.
  - The sitemap fetches 8 pages at a time; the build limit is 60 s.
  - Images go through `src/lib/image-loader.ts`, which asks Noon, Amazon, Jumia and Shopify CDNs for the needed width. The Next optimizer stays off.
  - CSS is inlined (`experimental.inlineCss`).
  - Titles come from the dictionaries (`lib/i18n/dictionaries/ar.ts|en.ts`). The home page needs `title.absolute`, because the template skips its own segment.

## Decisions (do not re-ask)

- Former ADRs, cited in code as "ADR 000N":
  - **0001** Matching is ten pure steps behind ports, pinned by the characterization suite.
  - **0002** `@pricelens/contracts` is `.d.ts` only, imported with `import type`, with its own typecheck.
  - **0003** Search stays in Postgres; Meilisearch was removed. Revisit only if a tuned query can't reach p95 < 300 ms.
  - **0004** One image runs in two roles, `PROCESS_ROLE=api|worker`; the queue contract is the only shared part.
  - **0005** One error envelope.
  - **0006** Store adapters are registered in one list; the core never names a store.
- Owner decisions:
  - Colors of one model, storage and RAM share a product (D-6).
  - AI-only merges.
  - Arabic is the default language.
  - Latin slugs.
  - Affiliate links stay: store links go through `/affiliate/go/:listingId`, with `rel=sponsored`.
  - No WhatsApp.
  - Never call a listing "fake" or "scam"; use neutral wording.
  - Store names are plain text, never logos.
  - No invented data: no fake reviews or ratings, no unverified coupons, no guessed installment terms.
  - Sentry skipped (D-36).
  - Keep CSP `'unsafe-inline'`: nonces would kill ISR (D-20).
  - Carrefour off.
  - "Contact sales" is `mailto:Baraasaad006@gmail.com`.
- How the owner works:
  - Terse approvals: "OK" or "Approved" means take my recommendation.
  - Don't re-ask answered questions.
  - Long jobs go in the background.

## Security rules

- Auth: the web uses httpOnly cookie sessions with a double-submit CSRF token (`pl_csrf` → `X-CSRF-Token`; D-17). The API also accepts a bearer access token from API clients.
  - Sessions are rows: revoking one takes effect at once.
  - Refresh tokens are stored as SHA-256 hashes and rotate. Reusing an old one more than 60 s later revokes every session.
  - At most 5 sessions per user.
  - bcrypt cost 12. Login failures are identical in message and timing.
- Every route needs a signed-in user unless it is `@Public()`.
  - Admin and moderator routes use `@Roles`.
  - Query user data with `{ id, userId }`. Workspaces go through `requireMembership` first.
  - Add every new user-owned resource to the "another user cannot read…" e2e.
- Scraped data is hostile:
  - Text is rendered escaped. `dangerouslySetInnerHTML` is allowed only for JSON-LD, via `serializeJsonLd`.
  - Links built from scraped URLs go through `safeExternalHref`.
  - `/affiliate/go` redirects only to the listing's own store (`isStoreUrl`).
  - Raw SQL only through `Prisma.sql` templates.
  - No route fetches a URL a user supplied.
- Only nginx is public. Postgres and Redis publish no ports, and the API listens on loopback only.
- Rate limits are per IP, behind one proxy hop: 100/min overall, login 10, registration 5, refresh 30, Deal Hunter 20. The partner API (`X-API-Key`, stored as a hash) has its own per-key quotas.
- Logs: no passwords or tokens. Secret-like query values are redacted. 4xx log as warn, 5xx as error.
- Run `gitleaks git --redact .` before anything goes public.
