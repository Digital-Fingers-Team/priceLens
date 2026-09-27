# Phase 10 — DevOps & observability

Goal: everything from phases 00–09 stays fixed, and when something breaks in production you know within minutes.

## CI (every PR)
Install → typecheck → lint → unit/integration tests → matching golden set → build → e2e. Turborepo caching. Fails on any error. Dependency audit step.

## Build & deploy
- Multi-stage Docker images, small, non-root user.
- Migrations run as a deploy step, not at random app startup.
- Env validated at boot. Separate configs for dev/staging/prod.
- Zero-downtime deploy considerations (graceful shutdown for API and workers).

## Observability
- Structured logs (pino) with request IDs across API and workers.
- Error tracking (e.g. Sentry) for API, workers, and web, with source maps.
- Metrics: request latency/errors, queue depth, job failures, scraper success rate per store, matching throughput.
- Alerts: API down, error spike, queue backing up, a store's scraper failing, prices going stale.
- bull-board (or similar) behind auth.
- Uptime checks on key pages and health endpoints.

## Data safety
- Automated Postgres backups AND a tested restore (document the test).
- Meilisearch full reindex command documented and tested.

## Docs
`docs/RUNBOOK.md`: how to deploy, roll back, reindex, restore a backup, handle a failing store, rotate secrets.

## Definition of done
CI green and required on main. Alerts fire in a test. Restore tested. `audit/10-devops.md` written.

## Carried over (recorded 2026-09-26)
- **D-17 (approved):** move the website's tokens from localStorage to httpOnly cookies with CSRF protection and a cookie-reading refresh; the partner API keeps bearer keys.
- **D-9 (approved):** give the workers their own container, with scrape-queue concurrency 2. Keep a single consumer per product family, or move the matching lock to Postgres advisory locks.
- Lasting fix for nginx holding a recreated API container's old IP (the 502 after restarts).
- Delete the old Meilisearch volumes: `podman volume rm pricelens_meili_data` (prod, on or after 2026-10-03) and `pricelens-dev_meili_data` (dev).
- CI: `next-env.d.ts` references `.next/types/routes.d.ts`, so run `next typegen` (or a build) before `tsc`. `next lint` is deprecated: move to the ESLint CLI before Next 16.
- The earlier handoffs listed in audit/00–04 (health checks, `/health/ready` in the deploy script, `pnpm audit`, gitleaks, the `FRONTEND_URL` value, affiliate `?secret=` in nginx logs, Nest 11).

## Carried over (recorded 2026-09-27, end of phase 09; phases 08+09 deployed 04:18/04:31 UTC)
- **URGENT, do before anything else: the API runs out of memory after ~6 h.** 2026-09-27 10:36:10 UTC `pricelens-api` died with `FATAL ERROR: Ineffective mark-compacts near heap limit ... JavaScript heap out of memory` (heap ~2.0 GB, process uptime 22,636 s = started at the 04:18 deploy), so memory grew steadily for 6.3 h: a leak. The container restarted itself on a new IP; nginx kept the old one, so `/api/` answered **502 for ~7.5 min** until `podman exec pricelens-proxy nginx -s reload` (10:43:35). Expect the same around **16:40 UTC** and every ~6 h until fixed. The 90 min before the crash were mostly store-expansion jobs (514, each finishing within a second) and Alibaba CAPTCHA warnings; no sitemap or bulk-browse burst. Unknown whether the leak is new in phases 05-09 or older (the API used to be redeployed before 6 h passed; before phase 05 it ran ~29 h without an OOM). Container memory 2.5 GB 8 min after the restart (includes the scrapers' Chromium). Plan: (1) take heap snapshots / `--heapsnapshot-near-heap-limit` on a dev API under load, find the retainer; (2) meanwhile, with the owner's OK, a watchdog like `sync-web-upstream` for the API upstream so a restart never leaves nginx on a dead IP (this is the "lasting fix for nginx holding the old IP" item above, now urgent); (3) the worker split (D-9) moves the scrapers out of the API process.
- **D-31 (P0, do first; needs the owner's OK before touching prod):** production sees every visitor as `10.89.1.7`. Rootless podman port forwarding (rootlessport) hides the source address, so nginx logs one IP for everyone (checked: a request from 196.154.91.231 logged as 10.89.1.7). Consequence: one API throttle bucket for the whole site (100 calls/min, login 10/min, register 5/min), and meaningless per-IP records (affiliate clicks). Recommended: run `pricelens-proxy` with a network mode that keeps the source address (podman `pasta`, or `slirp4netns:port_handler=slirp4netns`); verify with an outside request that nginx logs the real IP and the API's `req.ip` matches (`trust proxy` is 1 hop). It restarts the proxy (seconds). Details: audit/09-seo.md SEO-17.
- **After D-31, throttle allowance for the web's server-side calls** (audit 08 P-19): product pages, category pages, the first search page and "More in <category>" all call the API from the web container. Today they reach it through the public URL and nginx (the prod web container gets only `NEXT_PUBLIC_API_URL`; `API_INTERNAL_URL` is not set by `deploy-web.sh`). Give them their own allowance (e.g. a shared-secret header, or `API_INTERNAL_URL` plus skipping the private network once real client IPs are visible). The phase 09 crawl turned 316 of 500 pages into 500s on the dev stack this way.
- **On-demand revalidation** (audit 08 P-17 / A-13): product pages are ISR (5 min, in-memory cache, `isrFlushToDisk: false`). When the workers get their own container (D-9), have ingestion ask the web to revalidate a product whose price changed. Needs a stable internal address for the blue/green web.
- **Brotli** in the proxy image (audit 08 P-15): nginx serves gzip only.
- **Unused indexes** (audit 08 P-11): recheck `pg_stat_user_indexes` on or after 2026-10-04 (`canonical_products_title_trgm_idx` 9.8 MB, `source_listings_title_trgm_idx`, the `normalized_title` btrees had 0 scans). Drop only with a week of evidence.
- **`pg_stat_statements` is enabled in prod** (D-30, 2026-09-27 04:34). Use it for the slow-query metric and alert; `SELECT ... FROM pg_stat_statements ORDER BY mean_exec_time DESC`.
- **Scraper health** (audit 08 P-16): 18% of scrape jobs fail in under a second at AliExpress, Amazon, Alibaba, Carrefour and Noon (13 each in 2 days); only 41% of listings were refreshed in the last 24 h. This is the "a store's scraper failing / prices going stale" alert.
- **Deploy notes:** the phase 08 search migration locks `canonical_products` ~9 s (done). The web is live on `pricelens-web-blue`. After adding migrations, also run `prisma migrate deploy` on the dev database (`.env.development`); the first phase 09 Playwright run failed only because the dev DB lacked phase 08's columns.
- **Health path:** `https://pricelens.work.gd/health` answers 404 publicly (only `/api/` goes to the API); the uptime check should use `/api/v1/health` or the internal port. Check which one exists before wiring alerts.
- **Measurement caveat:** the box ran at load 13-15 on 2 CPUs during phase 08 (production scraper Chromium, and until 2026-09-27 02:38 the AradoBot pm2 restart loop, D-29, now fixed). Lab Lighthouse numbers here are unreliable; prefer field data.
- D-29 (done): `/etc/systemd/system/pm2-opc.service.d/override.conf` (`PIDFile=` empty) stopped AradoBot restarting every 90 s. Not a PriceLens change, but it is on this box: keep it.
