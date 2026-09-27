# Phase 10 — DevOps & observability

Session 2026-09-27, 10:48 → 19:40 UTC. Run back to back with phase 11 at the
owner's request (no stop between phases; owner questions collected in
`~/pricelens-work/morning-list.md` and at the end of this file).

The phase started in an incident. At 10:36 the production API died of a
JavaScript heap out-of-memory error (6.3 h after the 04:18 deploy), restarted
in place, and nginx sent `/api/` to its old address (502 for 7.5 min). The
audit below starts from that incident and then covers the phase prompt.

## Findings

| # | Where | Problem | Evidence | Sev | Status |
|---|---|---|---|---|---|
| OPS-01 | worker heap | The job/scraping process leaks: ~300-370 MB/h until V8's ~2 GB limit, every ~5-6 h. | 10:36 and 18:28 `FATAL ERROR: Reached heap limit … JavaScript heap out of memory`; `/tmp/worker-rss.log`: 269 MB (13:06) → 1.9 GB RSS (16:26). | P0 | **Partly fixed, root cause open.** One cause found and fixed (OPS-02). The rest is contained: separate worker container (OPS-11), graceful recycle at 1.2 GB with a heap snapshot (362963f, not deployed). Needs decision D-33. |
| OPS-02 | `browser-session.service.ts` | A store's service worker outlives its page; the driver keeps a record of every request the worker handles for the life of the persistent context. | Offline repro (local HTTP server, patchright persistent context, 600 page cycles): no service worker flat at ~36 MB heap; with one +1.25 MB/page (64 → 114 MB in 40 pages); iframes and console noise flat; `serviceWorkers: 'block'` flat at 35 MB. | P0 | **Fixed, deployed 13:03** (01b9958). |
| OPS-03 | `docker/entrypoint.api.sh` | After an in-place restart the container keeps its `/tmp`; Xvfb refused display 99 ("Server is already active"), so every browser store failed with "Missing X server" until the container was recreated. | Container log after 10:36; `podman top` showed no Xvfb. | P0 | **Fixed, deployed** (a617e2a). Proven twice: a throwaway image restarted with the old lock present came back with `:99` answering; the live worker's own OOM restart at 18:28 came back with Xvfb and 0 "Missing X server" lines. |
| OPS-04 | browser relaunch loop | A browser that failed to launch was relaunched by every queued search: 875 failed launches in 20 min. Each wrote a 4 MB `BrowserMetrics/*.pma` into the profiles volume. **The disk filled (183 GB, 100%) by 12:54**, 52 GB in 2 h 20 min, endangering every service on the box. | `podman system df -v`: `pricelens_browser_profiles` 61.7 GB; 6,589 (2b) + 6,468 (jumia) metrics files. | P0 | **Fixed and cleaned up.** Metrics files deleted (owner OK, 71% used after); per-store 60 s launch cooldown (01b9958, deployed); monitor alerts on disk ≥ 85% (OPS-10). |
| OPS-05 | nginx → API | nginx resolves `api` once; a restarted API container on a new IP means 502 until a reload. | 10:36-10:43 outage. | P0 | **Fixed in code, not enabled** (57ad7df: `sync-api-upstream.sh` + timer; tested on throwaway containers: new IP → 504 → reload → 200). Needs D-32. The worker split makes it rarer: the leaking process is no longer the API. |
| OPS-06 | proxy networking (D-31) | Every visitor reaches nginx as `10.89.1.7` (rootless port forwarding), so the API has one throttle bucket for the whole site and per-IP records are meaningless. | audit/09 SEO-17; confirmed again. | P0 | **Needs decision (D-31).** Design below, partly tested. |
| OPS-07 | CI | No CI at all. | `.github/` absent. | P1 | **Fixed** (4215012): gitleaks, `pnpm audit --prod --audit-level high`, typecheck, lint, API unit (incl. matching golden set) / integration / e2e, web build/typecheck/lint/vitest, Playwright against a seeded stack. Green on GitHub for 0b23e09 and 362963f. "Required on main" is a repository setting (owner). |
| OPS-08 | dependencies | `pnpm audit --prod`: 8 high (multer ×6 via @nestjs/platform-express, postcss ×2 via next). | audit output. | P1 | **Fixed** (8789915): overrides `multer ^2.3.0`, `postcss ^8.5.18` → 0 high, 4 moderate, 1 low. Gates green. |
| OPS-09 | product pages | React hydration error 418 on cached (ISR) product pages: "checked 5m ago" was recomputed at hydration with a different clock. Also live in production since phase 08. | Found by the new CI Playwright job (run 36318291665). | P1 | **Fixed** (b778514): first render uses the page's render time (`RenderedAtProvider`/`useNow`). Checked on a production build: cached "this minute" → no page error 75 s later, then "1m ago". **Not deployed (web).** |
| OPS-10 | observability | No alerting, no operational metrics. | – | P1 | **Built, not enabled.** `/health/ops` (5cee2d7: queue counts, per-store priced vs refreshed-in-24 h listings, sweep results, memory; internal only) and `scripts/monitor.sh` (424fe98, timer every 5 min: site/API/502, readiness, containers + restarts, disk, memory, 5xx, queue backlog, stale stores, backup age; FIRING/RESOLVED once each; Telegram / any command / journal). Alerts fired and resolved in tests (below). Needs D-34 (delivery channel) and enabling. |
| OPS-11 | workers in the API process (D-9) | Scrapes, schedulers and Chrome shared the API's process: a leak or crash there took the site's API down. | ADR 0004. | P1 | **Fixed, deployed 13:03** (1bc8e56, 1be9abf): `PROCESS_ROLE=api|worker|all`; `pricelens-worker` container; `deploy-api.sh` swaps it after the API. Scrape jobs capped at 2 concurrent, served by priority. The 18:28 worker OOM left the API untouched (200 throughout). |
| OPS-12 | tokens in localStorage (D-17) | The website kept access and refresh tokens in localStorage (readable by any injected script). | audit 04/05. | P1 | **Fixed** (4a74cbd API, 0b23e09 web): httpOnly cookies, double-submit CSRF, bearer clients unchanged, silent one-time move of existing sessions. **Not deployed**: deploy the API first, then the web. |
| OPS-13 | backups | No automated Postgres backups, no tested restore. | – | P1 | **Built and tested, not enabled** (9b7e1fc): checked `pg_dump -Fc`, retention 7 days + 4 weekly, restore into a new database only. Needs D-35 (enable the timer; off-box copy). |
| OPS-14 | web → API throttling (P-19) | The web's server-side calls share one throttle bucket. | audit 08/09. | P1 | **Deferred until D-31.** A shared-secret bypass would let anyone hitting `/search?q=…` fast trigger unthrottled live scrapes through the web; the web must forward the real visitor IP, which does not exist until D-31. |
| OPS-15 | proxy access log | The affiliate postback's `?secret=` would be logged in full. | audit 04 handoff. | P2 | **Fixed** (28e338c, redacting log format; tested in a throwaway nginx). Residual: nginx's error log prints the raw request line when the upstream is down. Live at the next API deploy (it recreates the proxy). |
| OPS-16 | structured logs | Nest text logs; request IDs exist on HTTP lines, not in job logs. | – | P2 | **Deferred**: JSON logs pay off with a log store to send them to; none exists. Revisit with D-36. |
| OPS-17 | error tracking | No Sentry (or similar). | – | P2 | **Needs decision (D-36)**: an external account/DSN. |
| OPS-18 | bull-board | No queue UI. | – | P2 | **Deferred**: two new dependencies for what `/health/ops` and the admin recent-jobs table show; with cookie sessions deployed it could sit behind the admin role. |
| OPS-19 | API image user | The API/worker image runs as root (Chrome `--no-sandbox`). The web image already runs as `node`. | Dockerfiles. | P2 | **Deferred**: needs the profiles volume re-owned and a sandbox-capable Chrome launch; risky for the scrapers. |
| OPS-20 | carried over | Brotli (P-15), on-demand revalidation (P-17), unused indexes (P-11, recheck ≥ 2026-10-04), Nest 11, `next lint` → ESLint CLI. | – | P2 | **Deferred** (reasons in "Remaining items"). |
| OPS-21 | Meilisearch leftovers | Dev container and volume unused. | – | P2 | **Fixed** for dev (removed `pricelens-dev-meilisearch`, `pricelens-dev_meili_data`). Prod volume `pricelens_meili_data`: remove on/after 2026-10-03 (RUNBOOK). |

## Verification

- **Leak (OPS-02)**, offline repro (`/tmp/leak/pw3.js` on the server, local HTTP server, headless patchright 1.61.1, heap after two GCs):
  ```
  service worker     20 → 64.7 MB   40 → 90.9 MB   60 → 114.4 MB
  iframes            38.2 / 35.4 / 35.1 MB
  console noise      38.2 / 38.3 / 35.5 MB
  sw + block         38.2 / 34.9 / 35.0 MB
  ```
  Ingestion path without the browser (the real Nest modules on a copy of the dev DB, synthetic connector results): 400 expansions / 1,597 store calls, heap 37.7 → 32.9 MB. A copy of production data and real-store scraping from dev were both refused by the permission policy and not pursued.
- **Worker split**: dev api role on :13001 enqueued a search scrape and ran nothing; worker role on :13002 consumed it. Check image: in-image unit tests 552 passed; api role runs only node; worker runs Xvfb; in-place restart with the stale lock present → Xvfb back. Production after the 13:03 deploy: api role node only, worker Xvfb + Chromium, jobs completing, BrowserMetrics back to 3 files.
- **Backups**: dev DB dump 1.7 MB; retention with 8 fake older dumps kept exactly the expected ones; restore into `pricelens_restore_test` matched the source (240 / 1,320 / 42,000 / 66 / 16 rows); second restore to the same name refused.
- **Alerts**: `MONITOR_TEST=1` → FIRING + RESOLVED delivered through `ALERT_COMMAND`; against production: all checks green except `/health/ops` missing (older image), alerted once, not repeated; forced `DISK_PCT=50 MEM_MB=100` → three FIRING, then three RESOLVED; against the dev API it flagged the stores whose dev data is two days old.
- **Cookie sessions**: API e2e `cookie-session` 6/6; Playwright against production builds 19 passed, 1 skipped; a browser with pre-D-17 localStorage tokens stayed signed in and ended with `pl_at`/`pl_rt` httpOnly + `pl_csrf`, no tokens left in storage.
- **Gates (final tree)**: API tsc, eslint, nest build, unit 558, integration 54, e2e 80; web tsc, lint, vitest 79, next build; CI green on GitHub (runs 36321954499, 36324768426, and the run for 362963f).

## Summary

- Production incident handled end to end: the leak's main cause fixed and deployed; the X-server failure after in-place restarts fixed and proven on a real crash; the Chrome relaunch loop that filled the disk (52 GB) stopped and cleaned up; the worker split (D-9) deployed, so a worker crash no longer touches the API.
- The remaining heap growth (OPS-01) is contained and instrumented (recycle + heap snapshot), not yet explained.
- CI exists and is green, including a browser e2e job that already caught a real production bug (OPS-09).
- D-17 cookie sessions, backups with a tested restore, `/health/ops` + alerting, the API upstream watchdog, log redaction and a RUNBOOK are in the repo. Several are **not live**: they wait for the next deploy or for the owner to enable a timer.

## Remaining items

- OPS-01 root cause (D-33). OPS-06/D-31 and then OPS-14. OPS-16/17 with D-36.
- Deploy: API (`/health/ops`, cookie API, worker guard, log redaction) then web (hydration fix, cookie sessions).
- Enable timers: API upstream watchdog, backups, monitor (RUNBOOK has the commands).
- Brotli: needs an nginx image with the module (custom build or a maintained image). On-demand revalidation: needs a stable internal web address (D-31's fixed loopback ports provide one). Unused indexes: recheck `pg_stat_user_indexes` on or after 2026-10-04. Nest 11 and the ESLint CLI move: framework upgrades → phase 11 decides whether they fit.

## Handoff → phase 11

- Deployment state: production runs 1be9abf (API + worker, deployed 13:03) and 04:31's web (ec422ad). Everything after 1be9abf is undeployed.
- The worker recycles by OOM every ~5-6 h until 362963f is deployed; each recycle is harmless (proven 18:28).
- Final QA should cover cookie sessions end to end on the deployed stack and the one-time localStorage move for existing users.

## D-31 design (for the decision)

Tested on the server with throwaway containers: a container in `--network pasta` mode reached a host-loopback port with `pasta:-T,<port>` (`127.0.0.1:3002/health` → 200); a bridge-network container sees callers as `10.89.x`. Proposed:

- `pricelens-proxy` runs with `network_mode: "pasta:-T,3002,-T,3010,-T,3011,-T,3020"`, ports 80/443 (pasta keeps the visitor's source address for connections from outside; this part can only be checked with an outside request after the switch).
- Upstreams become fixed loopback ports: API `127.0.0.1:3002` (already published), web blue/green `127.0.0.1:3010/3011` (published by `deploy-web.sh`), SLI `127.0.0.1:3020`. This also removes the stale-IP problem for good (no container IPs in nginx at all).
- Then give the web's server-side calls a forwarded client IP (OPS-14).
- Cost: a proxy restart (seconds) and changes to `deploy-web.sh`, the compose file and SLI's upstream.

## Decisions for Baraa

- **D-32: enable the API upstream watchdog** (`pricelens-api-upstream.timer`). Recommended: yes, now (commands in morning-list/RUNBOOK). Without it, the next API restart gives 502 until someone reloads nginx.
- **D-33: find the rest of the worker leak.** Recommended: deploy 362963f; the first recycle writes `/tmp/heap/worker-*.heapsnapshot` in the worker (`podman cp pricelens-worker:/tmp/heap .`), which I analyse offline. Alternative, faster but intrusive: allow me to take two heap snapshots from the running worker via its inspector.
- **D-34: where alerts go.** Recommended: a Telegram bot to your account (`ALERT_TELEGRAM_BOT_TOKEN` + `ALERT_TELEGRAM_CHAT_ID` in `~/.config/pricelens/alerts.env`), then enable `pricelens-monitor.timer`.
- **D-35: backups.** Recommended: enable `pricelens-db-backup.timer` now; later copy the dumps off the box (object storage), since a backup on the same disk does not survive losing the disk.
- **D-31: the proxy network change** (design above). Recommended: yes, in a quiet hour; it needs one outside request to confirm real IPs appear.
- **D-36: error tracking.** Recommended: Sentry's free tier for API, worker and web with source maps; needs an account and DSN. Until then, the monitor's 5xx alert is the error signal.
- **Deploy order for what is built:** API first (`deploy-api.sh`), then web (`deploy-web.sh`); after the web deploy, signed-in users move to cookie sessions silently.
- **CI required on main:** a repository setting (Settings → Branches → protect `main`, require the "CI" checks).
