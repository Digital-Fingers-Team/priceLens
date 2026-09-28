# Phase 11 — Final QA

Session 2026-09-27, 20:10 UTC onward, run straight after phase 10 at the
owner's request (no subagents; owner questions collected at the end). At the
start the owner answered every open question (top of
`~/pricelens-work/morning-list.md`): deploy everything built, enable the
watchdog and backup timers, D-31 this session, CI required on main, and all
phase-10 deferred items (Nest 11, JSON logs, bull-board, non-root image,
Brotli, ESLint CLI) into this release.

Method: re-verify what earlier phases marked Fixed, on the live site where
possible (read-only) and on the dev stack otherwise; a Playwright matrix at
375 / 768 / 1440 in both languages and both colour schemes; exploratory cases;
read-only production data checks; security re-checks; the grep sweep.

## Findings

| # | Where | Problem | Evidence | Sev | Status |
|---|---|---|---|---|---|
| QA-01 | product page, watchlist, price chart, intelligence panel | A failed **background** refresh (React Query sets `isError` while keeping the data) replaced a fully rendered page with its error state: one 429 or the ~20 s API restart during a deploy turned a product page into "product unavailable". | Playwright key-page matrix: product page with 0 `<h1>`; the page's price refresh (data older than 2 min) had failed. | P1 | **Fixed** 9116f61: the error shows only without data. Regression test: 503 on the refresh, page and h1 stay (all widths). |
| QA-02 | `/search` | A failed refresh of the same search (resubmit, live-fetch polling) hid the results it had. | Code review after QA-01. | P2 | **Fixed** 9116f61: error only for a search that has no results of its own; a failed *new* search still says so. Test: API aborted, resubmit, results stay, no alert. |
| QA-03 | `search-bar.tsx` | The box copied the URL's query whenever a search landed, so an earlier search landing late overwrote the next one being typed: three quick searches ended on the second. | Playwright, mobile: final URL `q=xiaomi` instead of `q=galaxy a57`. | P1 | **Fixed** 969b825: follows the URL only while the user has not typed since (back/forward still follow). Vitest ×2, Playwright. |
| QA-04 | `search/page.tsx` | Client navigations were meant to skip the server fetch by reading the `rsc` header; Next 15.5 does not pass it to `headers()`, so it never fired, and a filter/sort/new search showed the old results unmarked until the server answered. | Trace: no browser `/api/v1/search` call after a client search; the dev API logged a server-side search for an `RSC: 1` request. | P2 | **Fixed** 969b825, then e63b6e7: dead check removed; current results dimmed + `aria-busy` until the URL changes (a plain flag; the first version used a React transition, suspected wrongly in QA-18). Behaviour otherwise unchanged (the server always fetched). |
| QA-05 | variant parser | GPU memory read as storage on machines that state RAM ("RTX 5060 8GB GDDR7", "RTX 3050 6GB", "12GB NVIDIA GeForce RTX 3060"); "32G"/"1T" not read; "16GB SSD512GB" read as 16GB storage. | Audit 07 handoff (Lenovo in D-12); read-only production query: 6 products with 2+ storage values, 1 with 2 RAM values among accepted listings. | P1 | **Fixed** a887b43, 574933d (tests from the real titles). Stored attributes are from the old parser: see D-37. |
| QA-06 | Arabic UI | The buy/wait reasons were the API's English sentences in the Arabic page. | Audit 07 handoff. | P2 | **Fixed** 64a4626: `reasonCodes` from the API, worded by the dictionaries (Arabic plurals, localized % and prices); English sentences kept for API clients. Plan names and a few API error texts remain English (below). |
| QA-07 | proxy (D-31) | Every visitor was 10.89.1.7 to nginx and the API: one rate-limit bucket for the whole site. | audit 09/10. | P0 | **Fixed and live** 3f23578 (20:54 UTC): proxy in the host network, fixed loopback upstreams. A request from outside (a phone, 196.154.13.91) is logged with its own address. |
| QA-08 | web → API (OPS-14) | The web's server renders shared one bucket and went out through the public URL. | audit 08 P-19. | P1 | **Fixed and live** a0ef2d9 + fc2b1e1 (20:58): SSR calls the API directly; `WEB_INTERNAL_TOKEN`-signed renders are limited per forwarded visitor (search) or not per address (cached pages). Unit tests ×6. |
| QA-09 | API logging | Expected 4xx (unknown product, bad input) logged at `error` level. | Nest 11 boot check with JSON logs. | P2 | **Fixed** 16e3cd0: 4xx → warn, 5xx → error. |
| QA-10 | CI required on `main` | Owner approved; the server's `gh` account (Nad1j) has pull-only access. | `gh api …/permissions`: admin false. | – | **Needs the owner** (repo setting). |
| QA-11 | category pages | `/categories/[slug]` renders per request (reads `searchParams` for `?page`); 200–360 ms TTFB vs ~50 ms for cached product pages. | curl ×5 against production. | P2 | **Deferred**: needs `?page` moved into the path (URL change, SEO) or a client-side page param. |
| QA-12 | offline | Fully offline, a client navigation falls back to a full page load and the browser shows its own offline page. | Playwright `setOffline`. | – | Accepted: standard app-router behaviour. An unreachable **API** shows the app's error state with a retry (tested). |
| QA-13 | product images | Images are hot-linked from store CDNs; one failed to load (`ERR_CONNECTION_CLOSED`) in one run, passing on rerun. | flows console test, desktop. | – | Observation (FYI in the release report). |
| QA-15 | variant parser (my a887b43) | "8G DDR6" on a graphics card read as 8 GB RAM (short unit + `ddr\d`), and a laptop whose cut-short title states no RAM took its GPU memory as storage. | Production dry run of the variant repair (read-only): it would have split one graphics card. | P1 | **Fixed and live** 6e9b928 (23:00): DDR6/7 is never RAM; GPU memory is skipped whenever the title names a computer. |
| QA-16 | matcher | No CPU-model guard: an AMD Ryzen 15AHP10 and an Intel i7 model, and an i7-13700HX / i7-14700HX pair, were merged (their RAM was unreadable then). | Read-only listing titles of the two products in D-37. | P2 | **Handoff**: a CPU family/model conflict guard next to the chip guard (matching work, needs the characterization suite). |
| QA-17 | image permissions | The first non-root deploy stopped itself: a source file with mode 600 in the checkout was unreadable to uid 1000 (in-image unit tests failed; nothing swapped). | `/tmp/deploy-p11-api3.log`. | P2 | **Fixed** 22a6496: the build stage makes the API sources world-readable. |
| QA-18 | search on phones | A sort change intermittently does nothing: Next aborts the RSC request after ~5 ms (`net::ERR_ABORTED`) and the URL never changes. | Trace; 1 in ~8 on the mobile emulation, **also 2/15 with the search code from before this phase**, so not introduced here. First seen as a CI failure on 172d096. | P2 | **Open** (pre-existing). Mitigated: the busy state clears itself (8 s) so the page never stays dimmed; CI retries once and reports it as flaky. Needs a look at the router's abort path (Next 15.5). |
| QA-14 | disk | 77% after today's builds; `podman system df`: 52.6 GB of images reclaimable, mostly dangling build layers. | – | P2 | **Partly fixed**: removed this session's check images and 17 dangling build images (82% → 73%). The rest (older dangling images, incl. other projects') is D-38. |

## Re-verified from earlier phases

Live production (read-only), after the 20:16/20:30/20:54 deploys:

- S-02 CORS: bad login with the site's Origin → 401 + `access-control-allow-origin`; a foreign Origin → 403.
- S-03 image optimizer `/_next/image` → 404. API listens on `127.0.0.1:3002` only.
- Security headers on every page: CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, referrer and permissions policies, COOP.
- D-17 cookie sessions: a cookie-authenticated write without the CSRF header → `CSRF_TOKEN_INVALID`. (End-to-end sign-in covered by API e2e `cookie-session` 6/6 and Playwright sign-in flows on the dev stack; not exercised against production to avoid writing to its database.)
- OPS-15 log redaction: `…/postback?secret=REDACTED…` in the live access log.
- `/health` and `/health/ready` 200 (database, cache, queue ok); `/health/ops` internal only (404 through the proxy).
- Worker: `PROCESS_ROLE=worker`, `WORKER_MAX_HEAP_MB=1200`, snapshot dir set (OPS-01 guard live).
- SEO: canonical per page, `en`/`ar`/`x-default` hreflang, `noindex` on searches, one `<h1>`, Product + BreadcrumbList JSON-LD, `robots.txt` disallows `/api/`, sitemap 17,384 URLs all well-formed, unknown product → 404.
- F-17 (P0, phase 02): accepted listings under one product with 2+ RAM values: 1 (a real mix, D-37); 2+ storage values: 6 (parser misreads fixed in QA-05, one duplicate spelling "1000GB"/"1TB").
- D-32 watchdog and D-35 backups enabled; one backup run by hand: checked 17 MB dump.
- IDOR: API e2e `endpoints` "another user cannot read or change what is not theirs (S-07, S-19)" and workspace membership checks, green in every gate run.
- Handoffs: every "Handoff → phase 11" item is handled above (Lenovo parser QA-05; 9,126 → 9,860 products without an accepted listing D-39; 18% bot-wall failures noted; TBT P-13 remeasured below; English server text QA-06).

## Verification

- API gate at a887b43: tsc, eslint, nest build; unit 563, integration 54, e2e 80.
- API gate at fc2b1e1 (D-31/OPS-14): unit 569 (guard ×6), integration 54, e2e 80.
- Web at 9116f61: typecheck, lint, vitest 79, build. Web at 969b825: typecheck, ESLint CLI, vitest 81, build.
- Nest 11 (16e3cd0, separate clone): tsc, eslint, nest build, unit 569; boot as `api` with JSON logs: routes 200/404 as before, no route deprecation warnings.
- Non-root image (b276872, `pricelens_api:p11check`): `id -un` = node; the deploy's in-image unit tests 567 passed / 2 skipped; a root-owned profile volume handed to uid 1000 by the deploy's find/chown; patchright persistent context, headful under Xvfb, **sandbox on** (no `--no-sandbox`) as uid 1000 → page title read.
- Brotli (e0fb3cc, `pricelens_proxy:check`): `nginx -t` with the full production config; a throwaway proxy in front of the live web: home HTML 118,157 B identity, 30,356 B gzip, 21,941 B Brotli.
- Playwright, first full run (54 tests ×3 widths): 45 passed, 8 failed, 1 skipped (theme toggle on mobile, by design). Failures: the new QA tests at every width (3 test bugs + QA-03), and one third-party image load (passes on rerun).
- Playwright, full run after the fixes (969b825): 51 passed, 2 failed, 1 skipped. Back-after-reload: a test timing issue, 9/9 once the test waited for the page to settle (5005656). The sort failure was first called load flakiness; CI then failed on it too, and repeats showed an intermittent aborted navigation that predates this phase (QA-18).
- Full run after the busy-state rework: 53 passed, 0 failed, 1 skipped; the search/navigation tests 18/18 on the final code. The key-page matrix (8 pages × en/ar × light/dark, status, `dir`, one `<h1>`, no sideways scroll, background) passed at 375, 768 and 1440.
- Full API gate on the release tree (Nest 11, dd1acec): tsc, eslint, nest build; unit 573, integration 54, e2e 83 (queue board ×3). After 6e9b928: unit 576, characterization snapshots 5/5 unchanged.
- Deploys: proxy (Brotli) 22:28 (~2 s); API/worker 22:43 (21 s; first attempt stopped itself, QA-17); web green 22:51 (blue/green on fixed ports, no downtime); API/worker 23:00 (25 s, parser fix). Checked: both API containers run as `node`, JSON logs, 60 Chromium processes, store expansions finishing, no sandbox/permission/X errors; queue board 404 unauthenticated; outside request logged with its real address; `content-encoding: br`; SLI 200.
- Variant repair dry run in production (read-only, current parser): 3 products; 2 genuine (D-37), 1 a multi-variant wholesale listing (skip).
- Lighthouse 12.8.2 mobile, production, median of 3 (box load ~4): home 67 / LCP 2,669 / TBT 2,392 / CLS 0; search "galaxy" 59 / 3,817 / 2,701 / 0; product 63 / 3,044 / 3,642 / 0; category 74 / 2,266 / 1,387 / 0. Phase 08 production before: home 68 / 1,959 / 3,335 / 0; search 49 / 4,081 / 5,341 / 0.159; product 68 / 2,593 / 2,810 / 0. Search improved clearly (CLS 0.159 → 0, TBT halved); the other timings move within this host's noise (phase 08 measured at load 13-15, this at ~4).
- Security: `pnpm audit --prod` 0 high, 4 moderate, 1 low before Nest 11 (the moderate ones are express/body-parser, upgraded with Nest 11); gitleaks runs in CI on every push. Grep sweep: no TODO/FIXME, no `$queryRawUnsafe`/`$executeRawUnsafe`, `console.log` only in CLI scripts under `scripts/ops` and the seed, "demo"/"fake" only as the seed profile name and the fake-discount feature, 10 `any` (Express request/adapter types in `auth.controller`, `app.setup`, Prisma event hooks).

## Summary

- Production now runs the whole overhaul: API/worker 6e9b928 (Nest 11, non-root with Chrome's sandbox, JSON logs, queue dashboard), web e63b6e7 (blue, 127.0.0.1:3010; redeployed 2026-09-28 00:31:23 UTC with the QA-18 mitigation), proxy on the host network with Brotli; backups and the upstream watchdog run on timers.
- D-31 is done: the site sees real visitor addresses, and the web's own renders are rate-limited per visitor (OPS-14).
- QA found and fixed four user-facing bugs: product pages turning into an error after a failed background refresh (QA-01), lost typed searches (QA-03), missing busy state on search navigation (QA-04), and English advice text in the Arabic UI (QA-06); plus parser misreads seen in production data (QA-05, QA-15).
- Everything earlier phases marked Fixed that can be checked from outside was re-verified live (list above).
- Open: the worker heap growth (OPS-01; the snapshot arrives ~4-6 h after the 23:00 restart), two real variant mixes to split (D-37), and owner settings/decisions below.

## Remaining items

- OPS-01 / D-33: analyse `/tmp/heap/worker-*.heapsnapshot` from the worker's first recycle (expected ~03:00-05:00 UTC 2026-09-28; the sampler log is `/tmp/worker-rss.log`).
- QA-11 category pages per request; QA-16 CPU-model guard; plan names and some API error texts still English in the Arabic UI (API sends English names; the dictionary covers the error codes the forms use).
- Deal Hunter reasons are English only (its parser understands English only; audit 07).
- Dates: remove prod volume `pricelens_meili_data` on/after 2026-10-03; recheck unused indexes on/after 2026-10-04.

## Handoff → other phases

None: this is the last phase. Follow-ups are in RELEASE_REPORT.md.

## Decisions for Baraa

- **D-37: split the two mixed Lenovo LOQ products** (a 24 GB listing each; one is an AMD model merged with an Intel one). Recommended: yes: `repair-variant-mixes.ts --product <slug> --apply` for the two LOQ slugs only, rollback file copied out; skip the GTX 1060 wholesale listing. Dry run: `~/pricelens-work/d37-dryrun.txt`.
- **D-38: prune old dangling images** (~35 GB reclaimable, including other projects'). Recommended: `podman image prune` when you are fine with rebuilding caches; disk is 73%, the monitor alerts at 85%.
- **D-39: products with no accepted listing** (9,860 of 19,489). Recommended: keep them reachable by URL but out of search, browse and the sitemap until a store lists them.
- **D-34** alert channel (Telegram recommended), **D-36** error tracking (Sentry recommended, needs a DSN): open.
- **CI required on main**: needs a repo admin (the server's gh account is read-only).
- **SEO-16**: Search Console soft-404 cleanup and sitemap submission (owner action).
