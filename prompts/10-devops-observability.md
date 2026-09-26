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
