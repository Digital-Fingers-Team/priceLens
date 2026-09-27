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
| QA-04 | `search/page.tsx` | Client navigations were meant to skip the server fetch by reading the `rsc` header; Next 15.5 does not pass it to `headers()`, so it never fired, and a filter/sort/new search showed the old results unmarked until the server answered. | Trace: no browser `/api/v1/search` call after a client search; the dev API logged a server-side search for an `RSC: 1` request. | P2 | **Fixed** 969b825: dead check removed; the navigation runs in a transition, current results dimmed + `aria-busy` meanwhile. Behaviour otherwise unchanged (the server always fetched). |
| QA-05 | variant parser | GPU memory read as storage on machines that state RAM ("RTX 5060 8GB GDDR7", "RTX 3050 6GB", "12GB NVIDIA GeForce RTX 3060"); "32G"/"1T" not read; "16GB SSD512GB" read as 16GB storage. | Audit 07 handoff (Lenovo in D-12); read-only production query: 6 products with 2+ storage values, 1 with 2 RAM values among accepted listings. | P1 | **Fixed** a887b43, 574933d (tests from the real titles). Stored attributes are from the old parser: see D-37. |
| QA-06 | Arabic UI | The buy/wait reasons were the API's English sentences in the Arabic page. | Audit 07 handoff. | P2 | **Fixed** 64a4626: `reasonCodes` from the API, worded by the dictionaries (Arabic plurals, localized % and prices); English sentences kept for API clients. Plan names and a few API error texts remain English (below). |
| QA-07 | proxy (D-31) | Every visitor was 10.89.1.7 to nginx and the API: one rate-limit bucket for the whole site. | audit 09/10. | P0 | **Fixed and live** 3f23578 (20:54 UTC): proxy in the host network, fixed loopback upstreams. A request from outside (a phone, 196.154.13.91) is logged with its own address. |
| QA-08 | web → API (OPS-14) | The web's server renders shared one bucket and went out through the public URL. | audit 08 P-19. | P1 | **Fixed and live** a0ef2d9 + fc2b1e1 (20:58): SSR calls the API directly; `WEB_INTERNAL_TOKEN`-signed renders are limited per forwarded visitor (search) or not per address (cached pages). Unit tests ×6. |
| QA-09 | API logging | Expected 4xx (unknown product, bad input) logged at `error` level. | Nest 11 boot check with JSON logs. | P2 | **Fixed** 16e3cd0: 4xx → warn, 5xx → error. |
| QA-10 | CI required on `main` | Owner approved; the server's `gh` account (Nad1j) has pull-only access. | `gh api …/permissions`: admin false. | – | **Needs the owner** (repo setting). |
| QA-11 | category pages | `/categories/[slug]` renders per request (reads `searchParams` for `?page`); 200–360 ms TTFB vs ~50 ms for cached product pages. | curl ×5 against production. | P2 | **Deferred**: needs `?page` moved into the path (URL change, SEO) or a client-side page param. |
| QA-12 | offline | Fully offline, a client navigation falls back to a full page load and the browser shows its own offline page. | Playwright `setOffline`. | – | Accepted: standard app-router behaviour. An unreachable **API** shows the app's error state with a retry (tested). |
| QA-13 | product images | Images are hot-linked from store CDNs; one failed to load (`ERR_CONNECTION_CLOSED`) in one run, passing on rerun. | flows console test, desktop. | – | Observation (FYI in the release report). |
| QA-14 | disk | 77% after today's builds; `podman system df`: 52.6 GB of images reclaimable, mostly dangling build layers. | – | P2 | **Needs the owner** (D-38): pruning also removes other projects' dangling images. |

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

## Evidence (commands and results)

(See "Verification" below; numbers filled in as runs complete.)

## Verification

- API gate at a887b43: tsc, eslint, nest build; unit 563, integration 54, e2e 80.
- API gate at fc2b1e1 (D-31/OPS-14): unit 569 (guard ×6), integration 54, e2e 80.
- Web at 9116f61: typecheck, lint, vitest 79, build. Web at 969b825: typecheck, ESLint CLI, vitest 81, build.
- Nest 11 (16e3cd0, separate clone): tsc, eslint, nest build, unit 569; boot as `api` with JSON logs: routes 200/404 as before, no route deprecation warnings.
- Non-root image (b276872, `pricelens_api:p11check`): `id -un` = node; the deploy's in-image unit tests 567 passed / 2 skipped; a root-owned profile volume handed to uid 1000 by the deploy's find/chown; patchright persistent context, headful under Xvfb, **sandbox on** (no `--no-sandbox`) as uid 1000 → page title read.
- Brotli (e0fb3cc, `pricelens_proxy:check`): `nginx -t` with the full production config; a throwaway proxy in front of the live web: home HTML 118,157 B identity, 30,356 B gzip, 21,941 B Brotli.
- Playwright, first full run (54 tests ×3 widths): 45 passed, 8 failed, 1 skipped (theme toggle on mobile, by design). Failures: the new QA tests at every width (3 test bugs + QA-03), and one third-party image load (passes on rerun).
