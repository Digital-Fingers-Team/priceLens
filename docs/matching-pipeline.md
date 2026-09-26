# The matching pipeline

How a scraped listing becomes an offer on a product. Code: `apps/api/src/matching/pipeline/` (one file per step under `steps/`, every number in `thresholds.ts`). Orchestration and I/O: `scraping/ingestion/listing-processor.service.ts`.

**Rule of thumb: precision over recall.** Two different products shown as one (wrong "Best Deal", wrong price history) is worse than one product shown twice.

## Steps

| # | Step | Input → output | Assumptions | Failure modes it guards against |
|---|---|---|---|---|
| 1 | Price gate (`01-price-gate`) | listing → keep / drop | A real offer has a positive, finite price | Scrape errors and priceless sold-out cards. A sold-out card still marks the stored listing `inStock=false` (L-11). |
| 2 | Junk filter (`02-junk-filter`) | title → reason / null | Some titles are never a single-unit offer | Sponsored cards (ad title + another item's price), wholesale/MOQ lots |
| 3 | Normalize & extract (`03-normalize`) | listing → normalized title, tokens, attributes | Titles are EN or AR; `matching/text/arabic.ts` normalizes Arabic letters and digits and spells fixed-meaning Arabic words in English; `matching/text/specs.ts` reads RAM/storage in every store format (`8GB RAM`, `RAM 8GB`, `256GB/8GB`, `8GB - 256GB`, `8+256`, `12GB 256GB`, Arabic) | Unread RAM was the root of F-17. Colors use whole words only ("Redmi" is not red). |
| 4 | Currency (`04-currency`) | amount, currency → base amount / null | FX table or fallback knows the currency | An unknown currency returns null and the listing is rejected with a reason. It used to be converted 1:1 into EGP (L-18). |
| 5 | Category sanity (`05-category-sanity`) | listing, category median → ok / reason | Category median is trusted above 50 priced listings | Parts and fakes priced far below the category (floor 2.5% of median); accessories in device categories |
| 6 | Identifier match (`06-identifier-match`) | GTIN/UPC/EAN/MPN → lookup clauses | Identifiers are exact | Two different identifiers are two products (guard in step 8). Stores that publish a GTIN per color keep colors apart (D-14). |
| 7 | Exact-title match (`07-exact-title-match`) | listing, candidates → candidate / null | Equal normalized titles are usually the same product | Runs **every** step 8 guard, because normalization drops "bundle", "kit" and "new". Lowest id wins a tie. |
| 8 | Conflict guards (`08-conflict-guards`) | listing, candidate → first failing guard / null | A guard fires only when both sides state the value | brand · accessory · accessory-kind · product-type · chip · variant (tier) · model-code-suffix · disjoint-model · identifier · condition · bundle · model-year · storage · ram · display-size · quantity (volume, weight, pack; unstated pack = 1). **Never color (D-6).** |
| 9a | Rank (`09-rank-and-decide`) | survivors → ranked | Fuzzy text beats embeddings here (measured) | Model agreement raises the score to 0.95, except for accessories. **Unknown variants:** a listing stating RAM/storage never joins a product that does not. An unstated listing joins a stated product only when the model family has exactly one known value. Ties: variants stated on both sides, then id. |
| 9b | Decide | ranked → match / new product | The LLM judge is optional | ≥0.95 accept; else the judge on the top 8; judge unavailable → fuzzy ≥0.85; else found a new product |
| 10 | Market outlier (`10-market-outlier`) | a product's offers → offers shown | Most offers of one product cluster | A mismatched spare part or fake that slipped through never becomes the headline price |

Candidates for steps 7–9 are the 200 most similar titles in the category (`pg_trgm`, ties by id), plus every product of the listing's model. The pool used to be the first 200 rows in whatever order Postgres returned them (L-03).

## Offers after matching

`prices/offer-rules.ts` defines one **live offer**: accepted by matching, priced above 0, not reported out of stock, and seen within `OFFER_MAX_AGE_DAYS` (7). The product page, search (price filter, sort, card), the intelligence panel and alerts all use it. One offer per store and normalized title (cheapest kept). "Best Deal" goes to the lowest live price, ties included.

## Reconciliation

The hourly duplicate pass (`matching/reconciliation.service.ts`) uses the same step 8 guards (never color), plus the strict variant rule: stated and unstated never merge. The LLM judge prompt says color does not matter and lists what does.

## Measuring changes

- Golden set: `test/golden/` (109 listings + a 24-listing holdout). `npx ts-node test/golden/report.ts` prints precision/recall; `test/unit/matching-golden.spec.ts` holds CI to precision 1.0 and the recall floors.
- Characterization: `test/e2e/matching-characterization.e2e-spec.ts` snapshots where about 60 listings land. Any tuning shows up as a snapshot diff, which is reviewed like code.
- Repairing old data: `apps/api/scripts/ops/repair-variant-mixes.ts`.
