# PriceLens runbook

Production is one box (`ssh pricelens`, rootless podman, shared with other
projects). The checkout that deploys is `~/pricelens` on the server; its
repo-root `.env` is the **production** environment. Never print it, never run
`db:*` scripts against it, never kill processes by name (production container
processes are visible on the host).

| Container | Role |
|---|---|
| `pricelens-proxy` | nginx on :80/:443, TLS, routes `/api/` to the API and everything else to the web |
| `pricelens-api` | NestJS, `PROCESS_ROLE=api`: HTTP only, enqueues jobs; `127.0.0.1:3002` |
| `pricelens-worker` | same image, `PROCESS_ROLE=worker`: Bull jobs, schedulers, Chrome under Xvfb |
| `pricelens-web-blue` / `-green` | Next.js; the live colour is named in `docker/nginx-upstreams/web.conf` |
| `pricelens-postgres`, `pricelens-redis` | data |

## Health at a glance

```sh
podman ps --format '{{.Names}} {{.Status}}' | grep pricelens
curl -s -o /dev/null -w '%{http_code}\n' --resolve pricelens.work.gd:443:127.0.0.1 https://pricelens.work.gd/api/v1/billing/plans
curl -s 127.0.0.1:3002/health/ready        # Postgres, cache Redis, queue Redis
curl -s 127.0.0.1:3002/health/ops          # queue backlog, per-store freshness, memory
df -h /                                      # 2026-09-27: the disk filled in 2 h
scripts/monitor.sh                           # every check the alert timer runs
```

## Deploy

Always from a clean `~/pricelens` at the tagged commit.

```sh
cd ~/pricelens
./scripts/deploy-api.sh      # build, in-image unit tests, migrations, swap API (~25 s down), reload nginx, swap worker
./scripts/deploy-web.sh      # blue/green: new colour boots beside the old one, nginx switches, old one removed
```

- Deploy the API **before** the web when both change: the web may depend on
  new API behaviour (e.g. cookie sessions, D-17); the API stays compatible
  with the previous web.
- Migrations run inside `deploy-api.sh` from the new image before anything is
  swapped. A failed migration leaves the running API untouched.
- Check afterwards: `podman ps`, the API route above answers 200, the site
  answers 200, `podman logs --tail 50 pricelens-worker` shows jobs running.

## Roll back

```sh
podman tag localhost/pricelens_api:rollback localhost/pricelens_api:latest
./scripts/deploy-api.sh --no-build          # API and worker back on the previous image
```

The web keeps its previous image as the other colour until the next deploy:
point `docker/nginx-upstreams/web.conf` at it (see `deploy-web.sh` notes) or
redeploy the previous commit with `./scripts/deploy-web.sh`.

A migration is not rolled back by this. Every migration so far only adds
columns, tables or indexes; if one ever needs undoing, restore (below) into
a new database and compare before anything else.

## Backups and restore

`scripts/backup-db.sh` (timer `pricelens-db-backup.timer`, 03:15 UTC) writes
`~/pricelens/backups/db/pricelens-<UTC>.dump`, checks it, keeps 7 days plus
the newest of each of the last 4 weeks.

Restore never overwrites; it creates a new database and prints row counts:

```sh
scripts/restore-db.sh ~/pricelens/backups/db/pricelens-20261001T031500Z.dump pricelens_restored
```

Then either point `DATABASE_URL` in `.env` at `pricelens_restored` and run
`./scripts/deploy-api.sh --no-build`, or copy the rows you need across.
Tested 2026-09-27 on the dev database (audit/10-devops.md, OPS-09).

Enable the timer (once):

```sh
cp ~/pricelens/scripts/systemd/pricelens-db-backup.* ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now pricelens-db-backup.timer
```

## Alerts

`scripts/monitor.sh` (timer `pricelens-monitor.timer`, every 5 min) alerts
once when a problem starts and once when it clears: site/API down or 502,
readiness, a container not running or restarted, disk ≥ 85%, node memory
≥ 1.5 GB, ≥ 20 5xx in 5 min, queue backlog, a store with no refreshed
listing in 24 h, backup older than 26 h.

Delivery is configured in `~/.config/pricelens/alerts.env` (chmod 600):
`ALERT_TELEGRAM_BOT_TOKEN` + `ALERT_TELEGRAM_CHAT_ID`, or `ALERT_COMMAND`.
Without either, alerts only reach the journal
(`journalctl --user -u pricelens-monitor`). Test delivery:
`MONITOR_TEST=1 ~/pricelens/scripts/monitor.sh`.

Live status board: `scripts/status-report.sh` (timer `pricelens-status.timer`, every 5 min) edits one Telegram
message in place (services, catalog, ingestion now/next, visitors online, Gemini key health).
`STATUS_DRY=1` prints it; `STATUS_RESEND=1` posts a fresh one (to pin).

## The API answers 502 but the container is healthy

nginx resolved the old address of a recreated API container. Reload it:

```sh
podman exec pricelens-proxy nginx -s reload
```

`pricelens-api-upstream.timer` (scripts/sync-api-upstream.sh) does this
automatically when enabled. The web has the same watchdog
(`pricelens-web-upstream.timer`, enabled 2026-09-25).

## A store is failing / prices go stale

1. `curl -s 127.0.0.1:3002/health/ops` — which store has `refreshed24h` 0.
2. `podman logs --since 1h pricelens-worker 2>&1 | grep -i <store>` — the reason:
   - **CAPTCHA** (Alibaba prints "run npm run login:alibaba"), **bot wall**:
     solve it once, by hand, in the worker's browser profile: temporarily
     `ENABLE_NOVNC=true` with a `VNC_PASSWORD` on the worker (noVNC on port
     6080, reached only through an SSH tunnel), then the store's login script
     (`apps/api/scripts/ops/login-store.ts`; see `apps/api/scripts/ops/README.md`).
     Turn noVNC off and recreate the worker afterwards. The profiles live on
     the `pricelens_browser_profiles` volume, so the solve survives deploys.
   - **"Missing X server"**: Xvfb is not running in the worker. Since
     2026-09-27 the entrypoint clears a stale lock; `podman top pricelens-worker`
     should list `Xvfb`. Recreate the worker if not
     (`podman rm -f pricelens-worker && docker compose -f docker-compose.server.yml up -d --no-deps worker`).
   - Selector/markup changes: a code fix in `apps/api/src/scraping/connectors/`.
3. A failing store is paused for 30 min by the circuit breaker; nothing else
   waits on it.

## The worker restarts / memory

The worker's heap grows (OPS-01, open). `WORKER_MAX_HEAP_MB=1200` recycles
it gracefully and writes one heap snapshot:
`podman cp pricelens-worker:/tmp/heap ./heap` and open it in Chrome DevTools
(Memory → Load) to find the retainer. The API is a separate container, so
a worker restart never takes the site down.

## Disk full

`df -h /`, then `podman system df -v`. Known culprits: Chrome's
`BrowserMetrics/*.pma` files in the `pricelens_browser_profiles` volume (a
Chrome launch loop wrote 52 GB in 2 h on 2026-09-27; they are usage
statistics and safe to delete), old images (`podman image prune` removes
only dangling ones; check before removing tagged ones), build caches.

## Rotate secrets

- **JWT secrets** (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, ≥ 32 chars):
  change in `.env`, `./scripts/deploy-api.sh --no-build`. Everyone is
  signed out.
- **Postgres / Redis passwords**: change inside the service first
  (`ALTER USER …` / `CONFIG SET requirepass`), then `.env`, then redeploy the
  API. Postgres and Redis containers keep their data volumes.
- **Store accounts, affiliate and AI keys**: `.env`, then
  `./scripts/deploy-api.sh --no-build`.
- Back up `.env` first (`cp .env .env.bak-<date>`), and never commit it.

## Reindex search

Search runs in Postgres (ADR 0003); Meilisearch is gone. The search columns
are maintained on write. To rebuild the normalized titles after a normalizer
change: `apps/api/scripts/ops/backfill-normalized-titles.ts` (dry run first,
then `--apply`; it writes a rollback file; usage in `apps/api/scripts/ops/README.md`). The old `pricelens_meili_data` volume can be removed on or
after 2026-10-03: `podman volume rm pricelens_meili_data`.

## CI

`.github/workflows/ci.yml` runs on every push and PR: secrets scan,
`pnpm audit` (high+), typecheck, lint, API unit/integration/e2e (with the
matching golden set), web build/typecheck/lint/vitest, and Playwright
against a seeded stack. Make it required on `main` in the repository
settings (Branches → branch protection → require "CI").
