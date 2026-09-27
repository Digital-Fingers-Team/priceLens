# Phase 11 — Final QA (fresh eyes)

Act as a skeptical QA lead who didn't write any of this. Trust nothing marked "Fixed" until you verify it.

## Do
1. Read every `audit/*.md`. For each item marked Fixed: re-test it and confirm. Reopen anything that isn't.
2. Check every "Handoff → phase NN" item across all audits was actually handled.
3. Full test suite + matching golden set + e2e at 375/768/1440, both languages, light/dark if present.
4. Manual-style exploratory pass: weird inputs, fast clicking, slow network, offline, back button, refresh mid-flow, very long/Arabic/emoji text.
5. Re-run security checks (gitleaks, npm audit, IDOR attempts, headers) and Lighthouse; compare with phase 04/08 numbers.
6. Grep sweep: TODO, FIXME, console.log, mock, demo, fake, lorem, `any`, hardcoded colors, `$queryRawUnsafe`.

## Output: RELEASE_REPORT.md
- Verdict: Ready / Not ready.
- Blockers (P0/P1) with location.
- Metrics snapshot (performance, matching precision/recall, test counts).
- Consolidated "Decisions for Baraa" from all phases, deduplicated, each with a recommendation.

## Carried over (recorded 2026-09-26)
- **D-14 (left as is):** per-color GTINs keep some colors as separate products. Revisit with data now that the color filter exists (phase 06).
- Re-check every "Decisions for Baraa" item in audit/00–10 and list anything still open for the owner.

## Carried over (recorded 2026-09-27, end of phase 09)
- Lenovo parser bug (skipped in the D-12 repair, audit 07 handoff).
- 9,126 of 16,480 products have no accepted listing at all (audit 07): should they be listed or searchable?
- High Total Blocking Time on every page (audit 08 P-13): the search page is one big client component; move what can be server components. Budget for home JS is met (158 kB).
- Server-generated English text in the Arabic UI (intelligence reasons, plan names, some API errors): message codes instead (audit 07).
- Google Search Console (owner, audit 09 SEO-16): soft-404 cleanup; submit the new sitemap (categories + hreflang).
- Open decisions to re-check at the end: D-31 (proxy source IPs, if not done in phase 10), D-14, and the FYIs in audit/07-09.

## Carried over (recorded 2026-09-27 19:50 UTC, end of phase 10; details audit/10-devops.md)

**Production state at hand-off** (baseline 19:45 UTC):
- `pricelens-api` 1be9abf, PROCESS_ROLE=api, started 13:03:11, restarts 0.
- `pricelens-worker` **new container**, 1be9abf, PROCESS_ROLE=worker (Bull jobs, schedulers, Chrome under Xvfb), started 18:28:29 after its own OOM crash, restarts 1.
- `pricelens-web-blue` ec422ad (phase 09), 04:31:54. `pricelens-proxy` 2026-09-25 11:42:35 (NOT recreated by the 13:03 deploy). postgres 04:34:05, redis 2026-09-25.
- Everything committed after 1be9abf is **not deployed**: /health/ops (5cee2d7), D-17 cookie sessions API (4a74cbd) + web (0b23e09), worker memory guard (362963f), hydration fix (b778514), access-log redaction (28e338c, needs the proxy recreated).

**Final QA must check:**
- OPS-01 (open): the worker heap still grows ~350 MB/h (OOM at 18:28, recovered by itself; API unaffected). After 362963f is deployed, the first recycle leaves `/tmp/heap/worker-*.heapsnapshot` in the worker: `podman cp pricelens-worker:/tmp/heap .` and find the retainer. Memory log: `/tmp/worker-rss.log` on the server (sampler pid in `/tmp/worker-rss.pid`).
- Cookie sessions (D-17) end to end on the deployed stack, including the one-time move of old localStorage sessions and CSRF on writes; deploy order API then web.
- The hydration fix on cached product pages (CI's console-errors Playwright test covers it).
- Re-verify disk stays sane: Chrome `BrowserMetrics/*.pma` in `pricelens_browser_profiles` (a launch loop wrote 52 GB in 2 h on 2026-09-27; fixed by the 60 s launch cooldown).
- CI (`.github/workflows/ci.yml`) is green on GitHub; check the latest run with `gh run list --repo Digital-Fingers-Team/priceLens` from the server.

**Owner decisions opened in phase 10** (recommendations in audit/10 and at the top of `~/pricelens-work/morning-list.md`):
- D-32 enable `pricelens-api-upstream.timer` (502 watchdog). D-33 how to finish the leak hunt. D-34 alert delivery (Telegram) + enable `pricelens-monitor.timer`. D-35 enable `pricelens-db-backup.timer`, later off-box copies. D-31 proxy network change (design in audit/10). D-36 error tracking (Sentry). CI "required on main" (repo setting).
- Deferred from phase 10, decide whether they belong in the release: P-19 web SSR throttle allowance (after D-31), JSON logs, bull-board, non-root API image, Brotli, on-demand revalidation, Nest 11, `next lint` → ESLint CLI.
- Dates: remove prod volume `pricelens_meili_data` on/after 2026-10-03; recheck unused indexes (`pg_stat_user_indexes`) on/after 2026-10-04.

**Session constraints learned in phase 10:**
- The permission classifier refuses copying production data into dev and scraping real stores from dev; don't retry, use offline reproductions.
- `~/pricelens` on the server is the prod checkout that `sync.sh` fast-forwards; systemd timers run scripts from it, so a changed script there goes live at once.
- SSH drops on long commands: run builds/deploys detached (`setsid … > log`) and poll the log.
- `wip.sh` works only after `sync.sh` has pushed local commits (the patch is against the server branch HEAD).
