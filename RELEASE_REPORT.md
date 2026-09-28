# PriceLens release report (overhaul phases 00–11)

2026-09-28, end of phase 11 (final QA). Details: `audit/00-baseline.md` … `audit/11-final-qa.md`.

## Verdict: Ready

Production runs the whole overhaul and is serving normally. It is ready as a
release: nothing is broken or unsafe for users. Three conditions stand, none
of them a code change:

(All three conditions of the first version of this report were resolved on
2026-09-28: worker memory leak fixed at its cause, Telegram alerts on, the
two mixed products split.) Remaining: Google has to re-crawl the site after
the canonical fix (Search Console), and one pre-existing phone navigation
glitch (QA-18).

## Blockers (P0/P1)

None open. The P0/P1 items found in phase 11 are fixed and deployed:

| # | Where | Fix |
|---|---|---|
| QA-01 P1 | product page, watchlist, chart, intelligence panel: a failed background refresh replaced the page with an error | 9116f61 |
| QA-03 P1 | `components/search/search-bar.tsx`: an earlier search landing late overwrote the one being typed | 969b825 |
| QA-05, QA-15 P1 | `matching/text/specs.ts`: GPU memory as storage, "32G"/"1T", "SSD512GB", "DDR6" as RAM | a887b43, 574933d, 6e9b928 |
| QA-07 P0 (D-31) | every visitor had the same address; one rate-limit bucket | 3f23578 (proxy in the host network) |
| QA-08 P1 (OPS-14) | the web's renders shared one bucket | a0ef2d9 |

## What is live (baseline 2026-09-28 01:12 UTC)

| Container | Version | Started |
|---|---|---|
| pricelens-api (`PROCESS_ROLE=api`, uid 1000) | 6e9b928 | 23:00:31 |
| pricelens-worker (`PROCESS_ROLE=worker`, uid 1000, Chrome sandboxed) | 6e9b928 | 23:00:54 |
| pricelens-web-green (127.0.0.1:3011) | a8eccbb | 09-28 01:11:28 |
| pricelens-proxy (host network, nginx 1.27.5 + Brotli) | e0fb3cc image | 22:28:47 |
| pricelens-postgres / pricelens-redis | unchanged | 09-27 04:34 / 09-25 |

Timers: web upstream (existing), API upstream watchdog (D-32), nightly backups
03:15 UTC (D-35), certificate renewal. Not enabled: the monitor (waits on D-34).

## Metrics snapshot

**Tests** (release tree): API unit 576, integration 54, e2e 83 (incl. the
matching characterization, 5 snapshots unchanged); web vitest 81; Playwright
54 tests at 375 / 768 / 1440 px, both languages, light and dark: 53 passed,
1 skipped (theme toggle on phones, by design); one pre-existing intermittent
failure on phones (QA-18) is retried once in CI. CI on GitHub runs the same gates plus gitleaks
and `pnpm audit`.

**Matching precision** (production, read-only, accepted listings): products
mixing RAM or storage variants: 7 before today's parser fixes (stored
attributes), 3 in a dry run with the current parser; 2 are real (D-37), 1 is a
multi-variant wholesale listing. Recall is not measurable without a labelled
production sample; the golden set and characterization suite cover the
matcher's behaviour in CI.

**Search API** (phase 08, production): p50 "galaxy" 186 ms (was 1,150),
Arabic 232 ms (was 1,593), browse 76 ms, type-ahead 84 ms.

**Lighthouse** (mobile, production, median of 3; this 2-CPU host inflates
TBT/LCP):

| Page | Phase 08 before | Now |
|---|---|---|
| Home | 68 · LCP 1,959 · TBT 3,335 · CLS 0 | 67 · 2,669 · 2,392 · 0 |
| Search "galaxy" | 49 · 4,081 · 5,341 · **0.159** | **59** · 3,817 · 2,701 · **0** |
| Product | 68 · 2,593 · 2,810 · 0 | 63 · 3,044 · 3,642 · 0 |
| Category | – | 74 · 2,266 · 1,387 · 0 |

**Transfer**: home HTML 22 KB with Brotli (30 KB gzip, 118 KB raw).

**Security**: `pnpm audit --prod` 0 high (moderate express/body-parser items
addressed by the Nest 11 upgrade); httpOnly cookie sessions with CSRF; CSP,
HSTS, frame, nosniff, referrer and permissions headers on every page; API bound
to loopback; image optimizer off; access-log secret redaction; the API image
runs as an unprivileged user with Chrome's sandbox on.

## Decisions for Baraa (all phases, deduplicated)

All decided (owner, 2026-09-28 ~03:20 UTC), and done unless noted:

- **Worker memory (OPS-01)**: root cause fixed and live (75a707d): the browser
  driver pinned every closed page through leftover CDP sessions (heap
  snapshot, audit 11); each store's browser now recycles every 40 pages.
  Worker memory since: 300-420 MB, no longer climbing.
- **D-37** two mixed Lenovo LOQ products split (rollback file reconstructed:
  `~/pricelens/backups/repair-variant-mixes-d37-2026-09-28-reconstructed.json`).
- **D-39** products without an offer: out of search, browse and sitemap; their
  pages are noindex (407c39b).
- **D-38** dangling images pruned: disk 79% → 62%.
- **D-34** Telegram alerts via @Pricelens1_bot; `pricelens-monitor.timer` on.
  Its first run found the queue backlog fixed in 95cb145.
- **D-36** Sentry: skipped for now. **SEO-15**: Latin slugs kept. **D-14**, **D-20**: left as they were.

Owner actions left (settings, no decisions):
- **CI required on `main`** (Settings → Branches; needs a repo admin).
- **Search Console**: sitemap resubmitted 2026-09-28; request indexing of `/` and `/ar`, check the Pages report in a week.

## Known limitations and follow-ups

- Matching has no CPU-model guard (QA-16).
- Category pages render per request (QA-11, 200-360 ms TTFB).
- On phones a sort change occasionally does nothing (an aborted navigation inside Next, pre-existing, QA-18); trying again works.
- Some API error texts and Deal Hunter explanations are English in the Arabic UI (plan names and buying advice are translated).
- 18% of scrape jobs fail fast at five stores (bot walls); Alibaba needs a manual CAPTCHA re-solve now and then (`npm run login:alibaba`, RUNBOOK).
- Store product images are hot-linked from the stores' CDNs and occasionally fail to load.
- Dates: remove the old Meilisearch volume on/after 2026-10-03; recheck unused indexes on/after 2026-10-04.
