# Category expansion — design

Date: 2026-09-28. Status: draft for owner review.

## Goal

PriceLens covers only about 11 electronics categories today. Expand it to cover every product category, keeping only items priced at **EGP 5,000 or more**. The stores are Egyptian (Amazon.eg, Noon, Jumia, Carrefour, 2B, Elaraby), so the cutoff is in Egyptian pounds.

Success: products from the new categories appear with the correct category, are matched across stores, and are searchable and browsable. Items below the floor are not ingested for the new categories.

## Decisions taken with the owner

- The cutoff is EGP 5,000, not GBP.
- The category tree is curated by hand and rolled out in phases. It is not discovered from the stores' own category pages.
- The floor applies to the new categories only. The existing electronics categories keep their current behavior unless the owner asks otherwise.

## Current state

- `Category` (apps/api/prisma/schema.prisma) has `slug`, `name`, `parentId`, `level`, `searchTerms`.
- `apps/api/seed/datasets/categories.ts` defines one root ("electronics") and about 11 device leaves.
- `buildQueriesForCategory` sends at most 3 queries per category to each store.
- `pickCategoryForQuery` returns the first category whose name or terms match, and falls back to the first category. In a large tree this would misfile products.
- `05-category-sanity.ts` checks accessories and a price floor relative to the category median. It returns null while a category has too few listings.
- The server is busy (load average about 9), so scraping volume must be paced.

## Design

### 1. Category tree

- About 15-20 top-level groups and 150-250 leaves under one root. Starting groups: large and small home appliances, kitchen, furniture and home, cameras and drones, audio, gaming, fitness and sports, tools and DIY, auto accessories, baby gear, personal care devices, office and printers, networking and smart home, bikes and scooters, watches, fragrances and other high-value items, plus the existing electronics unchanged.
- Each leaf has a slug, a name, and 3-6 search terms in English and Arabic.
- The tree lives in `categories.ts`. An idempotent upsert script loads it and finds each parent by slug, so existing category IDs stay stable.

### 2. Schema

Additive migration on `categories`:

- `rollout_wave` int, default 0 (0 = not swept).
- `min_price_egp` numeric, nullable per-leaf override.

Global config: `MIN_LISTING_PRICE_EGP` (default 5000).

### 3. Price floor

`ListingProcessor` drops a listing when its price converted to EGP is below the leaf's `min_price_egp`, or the global floor when the leaf has none. The floor is skipped for the existing electronics categories. Listings with a missing price or an unknown currency are skipped and counted, never treated as 0. Drops are counted per store and category.

### 4. Phased ingestion

- The scheduler sweeps only leaves whose wave is enabled.
- `MAX_CATEGORY_SWEEPS_PER_RUN` caps the work per run. Leaves rotate oldest-swept first.
- New-category sweeps run at the lowest queue priority, behind the existing scheduled jobs.
- Wave 1 is 10-15 leaves chosen for how many products stores carry above EGP 5,000. Later waves are enabled by hand.
- A store that returns nothing for a leaf is recorded as empty and retried on a slow back-off. It does not fail the run.
- A dry-run mode logs the leaves and queries that would be swept, without scraping.

### 5. Matching and search

- `pickCategoryForQuery` prefers the most specific leaf. On a tie, the leaf with more matching terms wins. The fallback to the first category is removed for free-text queries that match nothing.
- Category-sanity works unchanged for new categories: it stays inactive until a category has enough listings for a trusted median.
- The web app gets a category browser that handles many groups. It ships behind a flag and shows only leaves that have products.

## Testing

- Category picker: ambiguous titles resolve to the most specific leaf; Arabic queries resolve to the right leaf.
- Price floor: exactly 5,000, just under, per-leaf override, missing price, non-EGP currency converted through the FX rates.
- Seed tree: no duplicate slugs, every parent exists, every leaf has at least 3 search terms, no search term shared by two leaves.
- Upsert is idempotent and keeps existing category IDs.
- Scheduler dry run lists the expected leaves and queries.

## Rollout

1. Deploy the migration and seed with every wave at 0. Nothing changes for users.
2. Enable wave 1. Watch server load, sweep duration and filtered-listing counts for one to two days.
3. Enable further waves one at a time, reviewing category medians and mismatches between waves.
4. Turn on the web category browser flag when enough leaves have products.

## Rollback

- Setting a wave back to 0 stops its sweeps at once. Ingested products stay and stay searchable.
- The migration only adds columns and can stay in place.
- Take a database backup before the first deploy.

## Out of scope

- Discovering categories from the stores' own pages.
- Applying the EGP 5,000 floor to existing electronics categories.
- Adding new stores.
