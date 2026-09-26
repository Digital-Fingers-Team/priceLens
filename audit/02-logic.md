# Audit 02 — Business logic correctness

Date: 2026-09-26 · Branch `feat/price-intelligence-platform` · Started from `phase-01-done` (`f3f7dab`)
Status: **IN PROGRESS**.

## How this was run

- Code read from a local clone; everything that runs (tests, golden-set runs, the repair tool, search tests) ran on the pricelens server against the isolated `pricelens-dev` stack (Postgres/Redis on localhost, `pricelens_test` for the suites).
- Production containers, the production database and Redis were not touched. A read-only count of affected products in production was attempted (a throwaway `psql` container on the prod network, `default_transaction_read_only=on`); **the session's safety policy refused it**, so no production numbers are in this report. The exact read-only queries are under Decisions for Baraa (D-11).
- Production container start times were recorded at the start (`pricelens-api 2026-09-25 23:35:13 restarts=2`, `web-green 17:32:06`, `proxy 11:42:35`, `postgres 11:37:34`, `redis 11:37:34`).

## Baseline measurements

| Check | Result at `phase-01-done` |
|---|---|
| api unit / integration / e2e | 343 / 16 / 12, snapshots 5/5 |
| Golden set (109 listings, written this phase), forward | **precision 0.5234, recall 0.5333**, 51 wrong-merge pairs, 5 mixed products |
| Golden set, reversed order | precision 0.4758, recall 0.5619, 6 mixed products |
| Holdout set (24 listings, written after the fixes, never tuned on) | precision 1.0000, recall 0.1250 |

The golden-set "before" numbers were measured by running the new harness against the phase-01 `src/` (`git stash -- apps/api/src`, then `npx ts-node test/golden/report.ts`).

## Findings

Severity: P0 = broken/unsafe · P1 = real harm · P2 = polish.

### P0 — F-17: product pages merge different RAM variants

**L-01 — RAM/storage extraction misses the formats stores actually use.**
- Where: `apps/api/src/matching/normalizer.service.ts:97-101,322-370` (`STORAGE_PATTERN`, `RAM_PATTERNS`, `extractStorage`, `extractRam`).
- Problem: RAM was only read with a "RAM"/"Memory"/"DDR" label next to it. Jumia's `256GB/8GB` and `8GB - 256GB`, Noon's `(8+256)`, `8/128GB`, `12GB 256GB`, and every Arabic title (`رام ١٢ جيجا`) returned no RAM. `8+256` with no unit returned no storage either.
- Why it matters: with no RAM on one side, the RAM guard never fires, so 8GB and 12GB listings of the Galaxy A57 merged (the owner's screenshot).
- Fix: `matching/text/specs.ts` reads RAM and storage from labelled forms, unit-less and unit pairs (`8+256`, `256GB/8GB`, `8GB - 256GB`, `12GB 256GB`, `8/128GB`), `ROM`/`SSD`/`Storage` labels, and Arabic after `matching/text/arabic.ts` has normalized digits and spelled `رام`/`جيجا`/`ذاكرة` as `ram`/`gb`/`storage`. A pair is read as RAM + storage only when both sizes are plausible for their role, so a GPU's `16GB` is never RAM. 30 table tests.

**L-02 — An unknown variant was compatible with any variant.**
- Where: `matching/pipeline/steps/08-conflict-guards.ts` (guards fire only when both sides state a value) and step 9 ranking.
- Problem: a title with no RAM passed the RAM guard against every product, tied at the model-agreement score with all of them, and joined whichever came first. Worse, a product *founded* by such a title accepted listings of every RAM size afterwards.
- Fix (step 9, per dimension RAM and storage): a listing that states the value never joins a product that does not; a listing that does not state it joins a product that does only when the model family has exactly one known value, and otherwise joins an equally unstated product or founds one. The family is judged on all same-brand/model/tier candidates *before* the guards, so a 12GB product the RAM guard removed still counts. Reconciliation applies the stricter form (stated vs unstated never merge).

**L-03 — Candidate pool and ties depended on Postgres row order (A-18).**
- Where: `scraping/ingestion/ingestion.repository.ts` `findInCategory` (unordered `findMany`, `take: 200`) and the stable sort in step 9.
- Problem: the pool was "the first 200 rows of the category", so in a category with more products the right one could be missing entirely, and among tied candidates the winner was whichever row came first.
- Fix: the pool is the 200 most similar titles (`pg_trgm similarity`, ties by id) plus every product of the listing's model; ranking breaks ties by "states the same variants" and then by id; step 7 picks the lowest id among equal titles. Unit tests prove the order of input no longer matters.

**L-04 — Production already holds mixed-variant products, and nothing can find or split them.**
- Where: production data (the A57 product: 8 listings at 8GB and 10 at 12GB, audit 00 F-17); the one-off `merge-color-variants` run on 2026-09-25 moved a 12GB listing into the 8GB product.
- Fix: `apps/api/scripts/ops/repair-variant-mixes.ts` (D-7): dry-run report of every product whose listings disagree on RAM or storage (using the fixed extraction), `--apply` re-splits them in one transaction per product and writes a rollback file; `--rollback <file>` restores. Tested on the test database with a fixture that reproduces the A57 case. Running it in production is the owner's (D-12).

### P1

**L-05 — No golden set, no measured precision/recall.**
- Fix: `test/golden/matching-golden.fixtures.ts` (109 listings: Arabic/English, transliterations, typos, missing brands, marketing noise, RAM/storage/tier/condition/year/bundle/pack/volume/weight/display-size variants, accessories naming the phone, spare parts) plus a 24-listing holdout written after the fixes; `golden-harness.ts` runs them through the real steps; `test/unit/matching-golden.spec.ts` asserts precision 1.0 and the recall floors in CI; `test/golden/report.ts` prints the numbers.

**L-06 — Reconciliation and the LLM judge contradict D-6 (colors combined).**
- Where: `matching/reconciliation.service.ts:246-316` (color conflict on titles and on stored attributes; no product-type/chip guards, A-12); `matching/semantic.service.ts:52` (prompt: "a different color … means they are NOT the same product").
- Why it matters: the hourly reconciliation refused to merge real duplicates that differ only in color, and the judge answered "different" for them, so the same phone stayed split across stores.
- Fix: reconciliation runs the pipeline's `checkConflicts` (all step 8 guards, never color) plus the strict stated-vs-unstated variant rule; accessories no longer auto-merge on model agreement. The prompt says color does not matter and lists what does (RAM/storage, tier, model code, condition, bundle, size/pack, Arabic titles).

**L-07 — Guards missing for packs, sizes, bundles, model years and accessory kinds; step 7 bypassed most guards.**
- Where: step 8 (no quantity/bundle/year guard); step 7 checked only brand, model, identifiers, condition, type; `normalizeTitle` deletes "bundle", "kit", "combo", "set", so `PS5 bundle` and `PS5` had the same normalized title.
- Evidence (golden set, before): `Nokia 105 (2023)` merged with `(2019)`; cases, screen protectors and chargers for one phone merged with each other (model agreement); `Oppo A6 6+128` merged with `8GB/256GB`.
- Fix: new guards `accessory-kind`, `bundle`, `model-year`, `quantity` (volume, weight, pack count; no pack stated = 1); step 7 runs every step 8 guard; accessories get no model-agreement boost.

**L-08 — Arabic text is not normalized for matching or search.**
- Where: `normalizer.service.ts` (Arabic titles compared raw); the Arabic accessory regex (`حافظة`, `زجاج مقوى`) only matches one spelling; `products.service.ts` search compares raw `ILIKE`.
- Fix: `matching/text/arabic.ts` normalizes digits (٠-٩, ۰-۹, `٫`, `٬`, `،`), alef/hamza forms, `ى`, `ة`, `ؤ`, `ئ`, diacritics, tatweel, and spells fixed-meaning words (brands, tiers, units, condition, colors) in English for the matcher. Search: see L-15.

**L-09 — Color extraction is unreliable, and offers do not expose it (needed for the phase 06 color filter).**
- Where: `normalizer.service.ts:392-461` (`lower.includes(color)`: "Redmi" is red, "Goldfish" is gold; store color names like "Awesome Navy", "Icyblue", "Desert Titanium" missing; Arabic colors missing); `products.service.ts mapListing` does not return it.
- Fix: whole-word matching, the store color names seen in this market, Arabic colors via the matching text; every listing's `extractedAttributes.color` is stored at ingestion (unchanged) and returned as `color` on each offer.

**L-10 — Stale offers count as current prices.**
- Where: `products.service.ts visibleListings`, search SQL `MIN(sl.price_usd)`, `price-intelligence.service.ts getCurrentMarket/getCompetitorPrices`, `price-alert.service.ts getMarketSnapshots`.
- Problem: a listing last seen months ago keeps its old price and stays "in stock"; it can be the headline "Best price" and trigger alerts.
- Fix: one definition in `prices/offer-rules.ts`: an offer is **live** when it is accepted by matching, priced above 0, not reported out of stock, and **seen within the last 7 days** (`OFFER_MAX_AGE_DAYS`, the same window `getAdvertisedPreviousPrice` already used for "was" prices). Every consumer uses it. The window is D-13.

**L-11 — A listing that goes out of stock keeps its last price and `inStock = true`.**
- Where: `live-ingestion.service.ts`, `store-coverage.service.ts` (step 1 drops a priceless listing before anything is written).
- Problem: Noon and Amazon return sold-out cards with no price and `inStock: false`; the stored listing never learns about it.
- Fix: a priceless listing the store explicitly reports out of stock marks the stored row `inStock = false` (and refreshes `lastSeenAt`); it is then excluded everywhere by L-10's rule.

**L-12 — Duplicate offers.**
- Where: `products.service.ts visibleListings` dedupe key `platform | price | title`.
- Problem: one store listing the same title under several ids at different prices (Amazon sellers, Alibaba suppliers) shows several rows; the A57 page showed three Amazon rows.
- Fix: one offer per store and normalized title (case, spacing, punctuation), the cheapest kept.

**L-13 — "All-time low/high" and "52-week low/high" are the current min/max.**
- Where: `products.service.ts getPriceStats` (both blocks are `getProductStats`, i.e. current listings).
- Fix: computed from price history of the product's live-matched listings (all time, and the last 365 days), `dataPoints` = history points.

**L-14 — Price history chart: wrong listings, per-change minimums, UTC days.**
- Where: `products.service.ts getPriceHistory`.
- Problems: history of REJECTED listings (junk that was once accepted) and of listings since moved to another product is included; a day's "min" is the minimum of the prices that *changed* that day (a store whose price did not change is missing from it); days are UTC, so a change at 01:00 Cairo lands on the previous day.
- Fix: history of listings currently accepted on the product; the daily series is forward-filled per listing (reusing `forwardFillDailySeries`, which the intelligence panel already uses); days bucketed in `Africa/Cairo` (`MARKET_TIME_ZONE`).

**L-15 — Search price filter/sort and Arabic queries.**
- Where: `products.service.ts buildSearchWhereSql/buildHavingSql/buildOrderBySql`.
- Problems: `MIN(sl.price_usd)` used for the price filter and "price" sort includes out-of-stock and stale listings, so a product can sort or filter by a price the card does not show; Arabic queries with a different alef/taa marbuta/digit form, or an Arabic brand name (`سامسونج`) for an English-titled product, find nothing.
- Fix: the SQL uses the live-offer predicate; queries are normalized and Arabic words expanded to their English spellings; the same normalization is applied to titles in SQL (`translate`). 20 real-query ranking tests (L-24).

**L-16 — Intelligence panel's "best price" differs from the product page's.**
- Where: `intelligence/price-intelligence.service.ts getCurrentMarket, getCompetitorPrices`.
- Fix: both use the live-offer rule and the same dedupe/outlier filter as the product page.

**L-17 — Price alerts: wrong market price, can fire twice, wrong baseline, "all-time" is 90 days.**
- Where: `watchlist/price-alert.service.ts`.
- Problems: (a) the market price includes out-of-stock, stale and outlier listings; (b) the trigger is a plain `update` after a read, so two overlapping sweeps both fire and both notify (the notification dedupe key only covers one cooldown bucket); (c) drop alerts use the first price-history row of *any* listing after the alert was created as the baseline, not the product's best price then; (d) `LOWEST_EVER` compares with the lowest of the last 90 days and counts "days of history" as days with a price *change*.
- Fix: live-offer predicate in the snapshot; a compare-and-set update (`updateMany where status/lastNotifiedAt unchanged`) so exactly one sweep wins and only the winner notifies; baseline = the best price across listings as of creation (last point per listing at or before `createdAt`), falling back to the earliest later point; `LOWEST_EVER` over all history of live-matched listings, with a 10-day tracking span.

**L-18 — An unknown currency is converted 1:1 into EGP.**
- Where: `matching/fx-rates.service.ts fallbackViaEgpRatio`.
- Problem: a listing priced in a currency neither the live table nor the fallback knows (e.g. CNY from AliExpress) is stored as that many pounds, i.e. usually far too cheap, and becomes "Best Deal".
- Fix: `convert` returns null; the listing is rejected with a logged reason instead of stored with an invented price.

**L-19 — Concurrency: duplicate price points, duplicate products.**
- Where: `ingestion.repository.ts appendPriceHistoryIfChanged` (read-then-insert), `ListingProcessor.process` (match-then-create), `createCanonicalProduct` (slug check-then-insert).
- Problem: up to 12 ingestion jobs run at once (A-10). Two jobs seeing the same listing can both append the same price point; two jobs seeing the same new product can both create it; two new products with the same slug make one insert fail and the listing is lost for that run.
- Fix: price history append in a transaction behind a per-listing advisory lock; steps 6-persist run under a per-model-family lock (in-process; ADR 0004 has one worker process, and the lock is keyed so phase 10's worker split knows what to preserve); slug collisions retry.

**L-20 — Web "Best Deal" badge compares price only.**
- Where: `apps/web/src/lib/utils/price.ts isBestDeal`, `components/product/listing-table.tsx`.
- Fix: the badge goes only to an in-stock offer whose base-currency price is the lowest among in-stock offers (ties all marked: they are all the lowest price). Component test.

### P2

**L-21 — The ten pipeline steps are not documented as input/output/assumptions/failure modes.** Fix: `docs/matching-pipeline.md`.

**L-22 — Per-color GTINs split colors (tension with D-6).** The identifier guard (step 6/8) treats two different GTINs as two products. Stores that publish a GTIN per color (Apple does) therefore keep colors apart, which D-6 says to combine. Not changed: GTINs are also what keeps different SKUs with near-identical titles apart (the ELARABY remote controls). **Needs decision** (D-14).

**L-23 — `price_history.currency` defaults to `USD`.** Every write sets the base currency explicitly; the default is only misleading. Deferred to phase 03 (schema hygiene), no user impact.

**L-24 — No search-relevance tests.** Fix: `test/e2e/search-ranking.e2e-spec.ts`, 20 real queries (7 Arabic) against a realistic fixture catalog in `pricelens_test`.

## Plan (more than 15 files, written before executing)

Each step is its own commit; the full api gate (and the web gate when the web changes) is green after each.

1. This audit.
2. Golden set, harness and report script (numbers measured on the phase-01 code: see Baseline).
3. Matching: extraction, Arabic, unknown variants, deterministic candidates and ties, new guards (L-01..03, L-07..09) with unit tests, golden spec in CI, characterization snapshot updated on purpose.
4. Reconciliation and LLM prompt aligned with D-6 (L-06).
5. Offer rules and price stats: live offers, dedupe, history, all-time stats, search SQL, intelligence (L-10, L-12..16).
6. Out-of-stock marking, FX, concurrency (L-11, L-18, L-19).
7. Alerts (L-17).
8. Web best-deal badge and offer color (L-09, L-20).
9. Search normalization and ranking tests (L-15, L-24).
10. Repair tool (L-04).
11. Docs (L-21), ARCHITECTURE, this audit completed.
