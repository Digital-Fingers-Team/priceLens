# PriceLens release report (overhaul phases 00–11)

2026-09-28, end of phase 11 (final QA). Details: `audit/00-baseline.md` … `audit/11-final-qa.md`.

## Verdict: Ready, with conditions

Production runs the whole overhaul and is serving normally. It is ready as a
release: nothing is broken or unsafe for users. Three conditions stand, none
of them a code change:

1. **The worker still grows ~180-350 MB/h** (OPS-01). It is contained: its own
   container, a graceful recycle at 1.2 GB with a heap snapshot, and the API is
   unaffected by it. The cause is found once the first snapshot is analysed.
2. **No alert reaches a person yet** (D-34). The monitor is built and tested;
   it needs a delivery channel.
3. **Two products still mix variants** in production data (D-37). The fix is a
   reviewed one-off repair.

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

Open, each with a recommendation:

- **D-37: split two mixed Lenovo LOQ products** (a 24 GB model inside a 16 GB
  product; one an AMD model merged with an Intel one). *Recommend: yes*, those two
  only, with the rollback file; skip the GTX 1060 wholesale listing.
- **D-34: where alerts go.** *Recommend:* a Telegram bot
  (`~/.config/pricelens/alerts.env`), then enable `pricelens-monitor.timer`.
- **D-39: 9,860 of 19,489 products have no store offer.** *Recommend:* keep them
  reachable by URL, out of search, browse and the sitemap until a store lists them.
- **D-36: error tracking.** *Recommend:* Sentry's free tier (needs your account and DSN).
- **D-38: prune old dangling images** (~35 GB, some from other projects). *Recommend:*
  `podman image prune` at a convenient time; disk is 73%, alerts would fire at 85%.
- **D-35 follow-up: off-box backup copies.** *Recommend:* object storage for the nightly dumps.
- **CI required on `main`**: a repository setting only an admin can make
  (Settings → Branches → require the CI checks).
- **SEO-15 Arabic slugs:** *recommend* keeping Latin slugs in both languages.
- **SEO-16 Search Console:** remove old soft-404 URLs, submit the sitemap (owner action).
- **D-14 per-colour GTINs:** left as is (owner's answer); revisit if the colour filter shows split products.
- **D-20 CSP nonces:** kept `'unsafe-inline'` (owner's answer): nonces would undo page caching.

Settled during the overhaul (for the record): D-1–D-13, D-15–D-19, D-21–D-33,
D-35 (on-box), D-31. See `~/pricelens-work/morning-list.md` and the audits.

## Known limitations and follow-ups

- Worker heap growth (OPS-01): analyse the first recycle's heap snapshot.
- Matching has no CPU-model guard (QA-16).
- Category pages render per request (QA-11, 200-360 ms TTFB).
- On phones a sort change occasionally does nothing (an aborted navigation inside Next, pre-existing, QA-18); trying again works.
- Some API error texts and Deal Hunter explanations are English in the Arabic UI (plan names and buying advice are translated).
- 18% of scrape jobs fail fast at five stores (bot walls); Alibaba needs a manual CAPTCHA re-solve now and then (`npm run login:alibaba`, RUNBOOK).
- Store product images are hot-linked from the stores' CDNs and occasionally fail to load.
- Dates: remove the old Meilisearch volume on/after 2026-10-03; recheck unused indexes on/after 2026-10-04.
