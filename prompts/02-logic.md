# Phase 02 — Business logic correctness

Goal: the product tells the truth. A wrong match or wrong "lowest price" destroys trust faster than any UI bug.

## Matching pipeline (the 10 steps)
1. Document each step: input, output, assumptions, failure modes.
2. Build a golden test set of hard cases (fixtures), including:
   - same product, very different titles; Arabic vs English titles; transliterations
   - variants that must NOT match: storage (128GB vs 256GB), color, size, model year, bundle vs single, refurbished/used vs new, pack of 1 vs pack of 6, 500ml vs 1L
   - accessories that mention the main product ("case for iPhone 15") must not match the phone
   - typos, extra marketing words, missing brand
3. Measure precision and recall. Precision matters more: a false match is worse than a missed match. Tune thresholds with evidence, record before/after numbers.
4. Each step unit-tested; full pipeline tested on the golden set in CI.

## Price & offer logic
- Money stored as integer minor units or Decimal, never float. Currency explicit everywhere.
- Lowest price excludes out-of-stock and stale offers (define "stale", log as decision if unclear).
- Shipping/fees, discounts, "was/now" prices computed consistently.
- Price history: no duplicate points, correct timezone handling, change detection correct.
- Offer counts, min/max, "best deal" labels mathematically true.

## Everything else
- Search ranking: relevant results first for real queries (write 20 real query tests incl. Arabic).
- Alerts/watchlists (if present): trigger exactly once, correct threshold logic.
- Edge cases: null, zero, negative, huge numbers, empty strings, duplicates, unicode/Arabic normalization (alef/hamza variants, taa marbuta, diacritics, Arabic vs Hindi digits).
- Concurrency: two jobs updating the same product/offer at once → no lost updates or duplicates.

## Definition of done
Golden set in CI with recorded precision/recall. Money logic fully tested. `audit/02-logic.md` written.
