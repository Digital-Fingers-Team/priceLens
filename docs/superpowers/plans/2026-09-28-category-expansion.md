# Category Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow PriceLens from 11 electronics categories to a curated tree of about 150+ leaves across every product area. New categories keep only listings priced at EGP 5,000 or more, and they are rolled out in waves.

**Architecture:** Each group is a level-0 root and its leaves are level 1, the same shape the existing "electronics" root has, so everything that reads "leaf = level > 0" keeps working. The tree is data in `seed/datasets/categoryTree.ts`, loaded by an idempotent upsert. Four additive columns on `categories` drive the floor, the waves, sweep rotation and Arabic names. Pure functions do the floor, the sweep selection and the category picker, and they are unit-tested. The services only call them.

**Tech Stack:** NestJS 11, Prisma 5.22 (Postgres 16), Jest, Next.js 14, Vitest. Podman on the server (`docker` is an alias).

**Spec:** `docs/superpowers/specs/2026-09-28-category-expansion-design.md`

## Global Constraints

- The floor is EGP 5,000 (`MIN_LISTING_PRICE_EGP=5000`). EGP is already the base currency (`FX_BASE_CURRENCY`).
- The floor applies to the new categories only. The existing 11 leaves are seeded with `min_price_egp = 0`, which means no floor.
- Wave 0 is the baseline and is always swept (the existing 11 leaves). New leaves get wave 1 or higher. `CATEGORY_SWEEP_MAX_WAVE` (default 0) is the highest wave swept. This changes the spec's "0 = off": the existing categories must keep their sweeps.
- `MAX_CATEGORY_SWEEPS_PER_RUN` (default 15) caps the new-wave leaves in one sweep run. They rotate oldest `last_swept_at` first, never-swept leaves first.
- The migration is additive only. Existing category IDs never change, because the upsert is keyed by slug.
- A free-text search that matches no category no longer scrapes (owner decision, 2026-09-28).
- Every new env var goes in `src/config/env.validation.ts` NUMERIC and in `.env.example` (the `env-example.spec.ts` test enforces this).

## Review Focus

- A listing in USD or another foreign currency near the floor must be compared after conversion to EGP, never on the raw amount. The floor is checked on `price` after `toBasePrices`.
- A search like "samsung" matches the terms of several leaves. It must go to the leaf with the strongest match, not to whichever leaf the database returns first. The picker test covers this.
- An Arabic query (for example "ثلاجة") must resolve to its leaf. The picker test covers this.
- If the upsert runs twice, it must not duplicate rows or move existing products. The test re-runs the pure planner and asserts that the output is the same.
- A new leaf that no store ever returns must not starve the others. Rotation by `last_swept_at` is marked even when the result is empty. The sweep-selection test covers this.

---

### Task 1: Schema: four category columns

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model Category)
- Create: `apps/api/prisma/migrations/20260928000000_category_expansion/migration.sql`

- [ ] Add these to `model Category`:
```prisma
  nameAr       String?   @map("name_ar") @db.VarChar(128)
  rolloutWave  Int       @default(0) @map("rollout_wave")
  minPriceEgp  Decimal?  @map("min_price_egp") @db.Decimal(12, 2)
  lastSweptAt  DateTime? @map("last_swept_at")
```
- [ ] Migration SQL:
```sql
ALTER TABLE "categories" ADD COLUMN "name_ar" VARCHAR(128);
ALTER TABLE "categories" ADD COLUMN "rollout_wave" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "categories" ADD COLUMN "min_price_egp" DECIMAL(12,2);
ALTER TABLE "categories" ADD COLUMN "last_swept_at" TIMESTAMP(3);
CREATE INDEX "categories_rollout_wave_idx" ON "categories"("rollout_wave");
```
- [ ] Add `@@index([rolloutWave])` to the model. Run `pnpm prisma:generate` and then `pnpm exec prisma validate`.
- [ ] Commit: `feat(categories): wave, floor, rotation and Arabic-name columns`.

### Task 2: Price floor in the pipeline

**Files:**
- Create: `apps/api/src/matching/pipeline/steps/04b-price-floor.ts`
- Modify: `apps/api/src/matching/pipeline/index.ts`, `apps/api/src/scraping/ingestion/listing-processor.service.ts`, `apps/api/src/config/retailers.config.ts`, `apps/api/src/config/env.validation.ts`, `.env.example`
- Test: `apps/api/test/unit/price-floor.spec.ts`

**Interfaces:**
- Produces: `priceFloorFor(category: { minPriceEgp: { toNumber(): number } | number | null }, globalFloor: number): number` and `isBelowPriceFloor(price: number | null, floor: number): boolean`.
- Config: `retailers.minListingPriceEgp` (number, default 5000).

- [ ] Test:
```ts
import { isBelowPriceFloor, priceFloorFor } from '../../src/matching/pipeline';

describe('price floor', () => {
  it('uses the global floor when the category has none', () => {
    expect(priceFloorFor({ minPriceEgp: null }, 5000)).toBe(5000);
  });
  it('lets a category override it, 0 meaning no floor', () => {
    expect(priceFloorFor({ minPriceEgp: 0 }, 5000)).toBe(0);
    expect(priceFloorFor({ minPriceEgp: { toNumber: () => 12000 } }, 5000)).toBe(12000);
  });
  it('keeps a price exactly at the floor and drops one just under', () => {
    expect(isBelowPriceFloor(5000, 5000)).toBe(false);
    expect(isBelowPriceFloor(4999.99, 5000)).toBe(true);
  });
  it('never drops on a missing price (the price gate owns that)', () => {
    expect(isBelowPriceFloor(null, 5000)).toBe(false);
  });
  it('drops nothing when the floor is 0', () => {
    expect(isBelowPriceFloor(1, 0)).toBe(false);
  });
});
```
- [ ] Run `pnpm exec dotenv -e ../../.env.test -- jest test/unit/price-floor.spec.ts`. It should fail because the module doesn't exist yet.
- [ ] Implement:
```ts
/**
 * Step 4b -- price floor. The catalogue keeps only products worth comparing:
 * a category's own `minPriceEgp` wins (0 = no floor, how the original
 * electronics categories are seeded), otherwise the global floor applies.
 * Runs on the base-currency (EGP) price, after step 4.
 */
type FloorSource = { minPriceEgp: { toNumber(): number } | number | null };

export function priceFloorFor(category: FloorSource, globalFloor: number): number {
  const own = category.minPriceEgp;
  if (own == null) return globalFloor;
  return typeof own === 'number' ? own : own.toNumber();
}

export function isBelowPriceFloor(price: number | null, floor: number): boolean {
  return price != null && floor > 0 && price < floor;
}
```
- [ ] Export both from `pipeline/index.ts`. Add `minListingPriceEgp: parseInt(process.env.MIN_LISTING_PRICE_EGP ?? '5000', 10)` to retailers config. Add `'MIN_LISTING_PRICE_EGP'` to NUMERIC, and add `MIN_LISTING_PRICE_EGP=5000` with a comment to `.env.example`.
- [ ] In `ListingProcessor.process`, after step 4 and before step 5:
```ts
    // Step 4b: price floor. No row is written: below-floor listings are the
    // bulk of every broad sweep, and a REJECTED row per one is pure noise.
    const floor = priceFloorFor(category, this.globalFloor);
    if (isBelowPriceFloor(price, floor)) {
      this.belowFloor.set(platform.slug, (this.belowFloor.get(platform.slug) ?? 0) + 1);
      return null;
    }
```
with `private readonly globalFloor: number` read from `ConfigService` (`retailers.minListingPriceEgp`, default 5000), and `readonly belowFloor = new Map<string, number>()`. Add `takeBelowFloorCount(slug): number`, which returns the count and resets it. `LiveIngestionService` adds it to `IngestionSummary.listingsBelowFloor`.
- [ ] Run the new spec and the existing listing-processor specs. They should pass.
- [ ] Commit: `feat(ingestion): EGP price floor for new categories (step 4b)`.

### Task 3: Category tree dataset and idempotent upsert

**Files:**
- Create: `apps/api/seed/datasets/categoryTree.ts` (groups plus leaves, with Arabic names, waves and terms)
- Create: `apps/api/seed/categoryTreePlan.ts` (pure planner) and `apps/api/seed/upsertCategoryTree.ts` (script)
- Modify: `apps/api/seed/types.ts` (`CategoryDefinition` gets `nameAr?`, `rolloutWave?`, `minPriceEgp?`), `apps/api/package.json` (script `seed:categories`)
- Test: `apps/api/test/unit/category-tree.spec.ts`

**Interfaces:**
- Produces: `categoryTree: CategoryDefinition[]`, which contains the existing 12 rows unchanged (with `nameAr`, `rolloutWave: 0`, `minPriceEgp: 0` added to the 11 leaves) plus the new groups (level 0) and leaves (level 1).
- Produces: `planCategoryUpserts(tree): Array<{ slug; data; parentSlug? }>`, ordered roots first.

- [ ] Test (tree invariants and planner):
```ts
import { categoryTree } from '../../seed/datasets/categoryTree';
import { planCategoryUpserts } from '../../seed/categoryTreePlan';

const leaves = categoryTree.filter((c) => c.level === 1);

describe('category tree', () => {
  it('has unique slugs', () => {
    const slugs = categoryTree.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it('gives every leaf an existing level-0 parent', () => {
    const roots = new Set(categoryTree.filter((c) => c.level === 0).map((c) => c.slug));
    for (const leaf of leaves) expect(roots.has(leaf.parentSlug!)).toBe(true);
  });
  it('gives every leaf 3+ terms, an Arabic name and a term no other leaf uses', () => {
    const owner = new Map<string, string>();
    for (const leaf of leaves) {
      expect(leaf.searchTerms.length).toBeGreaterThanOrEqual(3);
      expect(leaf.nameAr).toBeTruthy();
      for (const term of leaf.searchTerms) {
        const key = term.toLowerCase();
        expect(owner.get(key) ?? leaf.slug).toBe(leaf.slug);
        owner.set(key, leaf.slug);
      }
    }
  });
  it('keeps the original 11 leaves at wave 0 with no floor', () => {
    const original = ['smartphones','laptops','graphics-cards','processors','monitors','televisions',
      'headphones','tablets','smart-watches','gaming-consoles','home-appliances'];
    for (const slug of original) {
      const c = categoryTree.find((x) => x.slug === slug)!;
      expect(c.rolloutWave).toBe(0);
      expect(c.minPriceEgp).toBe(0);
    }
  });
  it('puts every new leaf in wave 1 or later', () => {
    expect(leaves.filter((l) => l.parentSlug !== 'electronics').every((l) => (l.rolloutWave ?? 0) >= 1)).toBe(true);
  });
  it('has well over 100 leaves', () => {
    expect(leaves.length).toBeGreaterThanOrEqual(120);
  });
  it('plans roots before leaves and is deterministic', () => {
    const plan = planCategoryUpserts(categoryTree);
    const firstLeaf = plan.findIndex((p) => p.parentSlug);
    expect(plan.slice(firstLeaf).every((p) => p.parentSlug)).toBe(true);
    expect(planCategoryUpserts(categoryTree)).toEqual(plan);
  });
});
```
- [ ] Run it. It should fail because the modules don't exist yet.
- [ ] Write `categoryTree.ts`. Start from the existing 12 rows of `categories.ts`, which move here, and re-export `categories = categoryTree` from `categories.ts` so the demo seed keeps working. The existing `home-appliances` leaf keeps only its broad terms (`appliance`, `home appliance`). The specific terms (`refrigerator`, `washer`, `air fryer`) move to their new leaves. Groups: large-appliances, small-appliances (kitchen), climate (AC and heating), furniture, home-and-garden, cameras, audio-video, gaming, computing-and-office, networking-smart-home, fitness, sports-outdoor, tools-diy, automotive, mobility (bikes, scooters, e-bikes), baby, personal-care, watches-jewelry, fragrances-beauty, musical-instruments, luggage, health-devices. Each leaf gets: English terms that stores index, then 1–2 Arabic terms, `nameAr`, and a wave. Wave 1 is the 12–15 leaves most likely to be over EGP 5,000 at every store: refrigerators, washing machines, air conditioners, dishwashers, cookers, freezers, cameras, soundbars, sofas, beds and mattresses, treadmills, electric scooters, e-bikes, espresso machines, water heaters. Waves 2–4 split the rest in rough order of value.
- [ ] Write the planner and the script:
```ts
// categoryTreePlan.ts
import type { CategoryDefinition } from './types';

export function planCategoryUpserts(tree: CategoryDefinition[]) {
  const toRow = (c: CategoryDefinition) => ({
    slug: c.slug,
    parentSlug: c.parentSlug,
    data: {
      name: c.name,
      nameAr: c.nameAr ?? null,
      level: c.level,
      searchTerms: c.searchTerms,
      rolloutWave: c.rolloutWave ?? 0,
      minPriceEgp: c.minPriceEgp ?? null,
    },
  });
  return [...tree.filter((c) => !c.parentSlug), ...tree.filter((c) => c.parentSlug)].map(toRow);
}
```
```ts
// upsertCategoryTree.ts -- run: pnpm seed:categories [--dry-run]
import { PrismaClient } from '@prisma/client';
import { categoryTree } from './datasets/categoryTree';
import { planCategoryUpserts } from './categoryTreePlan';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const prisma = new PrismaClient();
  const ids = new Map<string, string>();
  for (const row of planCategoryUpserts(categoryTree)) {
    const parentId = row.parentSlug ? ids.get(row.parentSlug) ?? null : null;
    if (row.parentSlug && !parentId) throw new Error(`parent ${row.parentSlug} missing for ${row.slug}`);
    if (dryRun) { console.log(row.slug, row.data.rolloutWave); ids.set(row.slug, row.slug); continue; }
    const saved = await prisma.category.upsert({
      where: { slug: row.slug },
      update: { ...row.data, parentId },
      create: { slug: row.slug, ...row.data, parentId },
    });
    ids.set(row.slug, saved.id);
  }
  console.log(`${ids.size} categories upserted${dryRun ? ' (dry run)' : ''}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
```
Add the package script `"seed:categories": "dotenv -e ../../.env -- ts-node seed/upsertCategoryTree.ts"`.
- [ ] Run the spec. It should pass.
- [ ] Commit: `feat(categories): curated category tree (~150 leaves, EN+AR) and idempotent upsert`.

### Task 4: Category picker and query builder

**Files:**
- Modify: `apps/api/src/scraping/ingestion/search-queries.ts`, `apps/api/src/scraping/live-ingestion.service.ts` (comment only; null is already handled)
- Test: `apps/api/test/unit/search-queries-categories.spec.ts`

**Interfaces:**
- `pickCategoryForQuery(query, categories): Category | null`. The signature is unchanged, but it now returns null when nothing matches.
- `buildQueriesForCategory(category): string[]`. It now dedupes case-insensitively and skips Arabic terms (stores are searched in English).

- [ ] Test:
```ts
import type { Category } from '@prisma/client';
import { buildQueriesForCategory, pickCategoryForQuery } from '../../src/scraping/ingestion/search-queries';

const cat = (slug: string, name: string, searchTerms: string[]) => ({ id: slug, slug, name, searchTerms } as unknown as Category);
const cats = [
  cat('home-appliances', 'Home Appliances', ['appliance', 'home appliance']),
  cat('refrigerators', 'Refrigerators', ['refrigerator', 'fridge', 'side by side refrigerator', 'ثلاجة']),
  cat('smartphones', 'Smartphones', ['phone', 'smartphone', 'mobile']),
  cat('tvs', 'TVs', ['tv', 'television', 'smart tv']),
];

describe('pickCategoryForQuery', () => {
  it('prefers the leaf with the longest matching term', () => {
    expect(pickCategoryForQuery('samsung side by side refrigerator', cats)?.slug).toBe('refrigerators');
  });
  it('resolves an Arabic query', () => {
    expect(pickCategoryForQuery('ثلاجة شارب', cats)?.slug).toBe('refrigerators');
  });
  it('matches whole words, not substrings ("tv" is not in "tvs-stand"; "phone" not in "headphones")', () => {
    expect(pickCategoryForQuery('headphones sony', cats)).toBeNull();
  });
  it('returns null when nothing matches', () => {
    expect(pickCategoryForQuery('xyzzy', cats)).toBeNull();
  });
});

describe('buildQueriesForCategory', () => {
  it('dedupes case-insensitively and leaves out Arabic terms', () => {
    expect(buildQueriesForCategory(cats[1])).toEqual(['Refrigerators', 'refrigerator', 'fridge']);
  });
});
```
- [ ] Run it. The tests should fail against the current implementation.
- [ ] Implement it. Each category is scored by the longest term (or name, or singular slug words) that appears as a whole phrase in the query; a term matches as a word sequence on Unicode word boundaries. A tie goes to more matching terms, then to the higher level. Return null when the score is 0. In `buildQueriesForCategory`, filter out terms containing Arabic script (`/[؀-ۿ]/`) and dedupe on `toLowerCase()`.
- [ ] Run the new spec and the existing search-queries specs. They should pass. If an existing spec asserts the old first-category fallback, update it to expect null and explain why in the commit message.
- [ ] Commit: `fix(ingestion): pick the most specific category; no scrape when none matches`.

### Task 5: Wave-aware sweep selection with rotation

**Files:**
- Create: `apps/api/src/scraping/ingestion/sweep-selection.ts`
- Modify: `apps/api/src/scraping/ingestion/ingestion.repository.ts`, `apps/api/src/scraping/live-ingestion.service.ts`, `apps/api/src/config/retailers.config.ts`, `apps/api/src/config/env.validation.ts`, `.env.example`
- Create: `apps/api/scripts/ops/category-sweep-plan.ts` (dry run)
- Test: `apps/api/test/unit/sweep-selection.spec.ts`

**Interfaces:**
- `selectSweepCategories<T extends { rolloutWave: number; lastSweptAt: Date | null; slug: string }>(leaves: T[], opts: { maxWave: number; maxNewPerRun: number }): T[]`
- Repository: `findLeafCategories()` returns rows with `level > 0` (unchanged); `markCategoriesSwept(ids: string[], at: Date): Promise<void>`.
- Config: `retailers.categorySweepMaxWave` (default 0) and `retailers.maxCategorySweepsPerRun` (default 15).

- [ ] Test:
```ts
import { selectSweepCategories } from '../../src/scraping/ingestion/sweep-selection';

const leaf = (slug: string, rolloutWave: number, lastSweptAt: Date | null = null) => ({ slug, rolloutWave, lastSweptAt });

describe('selectSweepCategories', () => {
  const leaves = [
    leaf('phones', 0), leaf('laptops', 0),
    leaf('fridges', 1, new Date('2026-09-28T03:00Z')), leaf('washers', 1, null), leaf('acs', 1, new Date('2026-09-28T00:00Z')),
    leaf('sofas', 2),
  ];
  it('always sweeps wave 0', () => {
    expect(selectSweepCategories(leaves, { maxWave: 0, maxNewPerRun: 15 }).map((l) => l.slug)).toEqual(['phones', 'laptops']);
  });
  it('adds enabled waves, never-swept first, then oldest', () => {
    expect(selectSweepCategories(leaves, { maxWave: 1, maxNewPerRun: 2 }).map((l) => l.slug))
      .toEqual(['phones', 'laptops', 'washers', 'acs']);
  });
  it('leaves out waves above maxWave', () => {
    expect(selectSweepCategories(leaves, { maxWave: 1, maxNewPerRun: 15 }).some((l) => l.slug === 'sofas')).toBe(false);
  });
  it('orders ties by slug for a stable run', () => {
    const tied = [leaf('b', 1), leaf('a', 1)];
    expect(selectSweepCategories(tied, { maxWave: 1, maxNewPerRun: 5 }).map((l) => l.slug)).toEqual(['a', 'b']);
  });
});
```
- [ ] Run it. It should fail because the module doesn't exist yet.
- [ ] Implement `selectSweepCategories`: take the baseline in its given order, then filter the leaves with `1 <= wave <= maxWave`, sort them by (`lastSweptAt` null first, then ascending, then slug), and slice to `maxNewPerRun`.
- [ ] In `LiveIngestionService.runLiveIngestion`, load the categories once before the platform loop: `selectSweepCategories(await repository.findLeafCategories(), {...config})`. Build `categoryQueries` once. After the loop, call `repository.markCategoriesSwept(selected.filter(c => c.rolloutWave > 0).map(c => c.id), new Date())`. This marks them even when the result was empty, so an empty leaf can't hog the rotation. Remove `findSweepCategories` if nothing else uses it. Add `listingsBelowFloor: processor.takeBelowFloorCount(platform.slug)` to each summary.
- [ ] Add the config keys and env vars (`CATEGORY_SWEEP_MAX_WAVE=0`, `MAX_CATEGORY_SWEEPS_PER_RUN=15`) to NUMERIC and `.env.example`.
- [ ] Write the dry-run script `scripts/ops/category-sweep-plan.ts`. It prints the selected leaves and their queries using the same two functions and scrapes nothing.
- [ ] Run the new spec and `pnpm typecheck`. Both should pass. The ioredis errors on the host predate this work.
- [ ] Commit: `feat(ingestion): wave-gated category sweep with oldest-first rotation`.

### Task 6: Categories API with Arabic name and group

**Files:**
- Modify: `apps/api/src/categories/categories.service.ts`
- Test: `apps/api/test/unit/categories.service.spec.ts`

**Interfaces:**
- `CategorySummary` adds `nameAr: string | null`, `groupSlug: string | null`, `groupName: string | null` and `groupNameAr: string | null`. Existing fields are unchanged, and the response is still leaves with products only.

- [ ] Test with a stub Prisma returning a leaf with `parent`: assert the group fields are mapped and zero-product rows are dropped.
- [ ] Implement it: add `nameAr` and `parent: { select: { slug, name, nameAr } }` to the select, then map.
- [ ] Commit: `feat(categories): expose Arabic name and group in /categories`.

### Task 7: Web: grouped, localized category links

**Files:**
- Modify: `apps/web/src/types/search.types.ts`, `apps/web/src/lib/categories.ts`, `apps/web/src/components/seo/category-links.tsx`, `apps/web/src/app/[locale]/page.tsx`, `apps/web/src/app/[locale]/categories/[slug]/page.tsx` (name fallback)
- Test: `apps/web/src/lib/categories.test.ts`

**Interfaces:**
- `localizedCategories(t, categories, locale?)`: the name is the dictionary entry, then `nameAr` when the locale is `ar`, then the API name.
- `groupCategories(list): Array<{ slug: string; name: string; categories: CategoryLink[] }>`: groups by `groupSlug`, orders groups by product count, and puts the electronics group first.

- [ ] Vitest: an Arabic name is used for `ar`; a leaf with no group lands in an "other" group; groups are sorted.
- [ ] `CategoryLinks` renders one `<h3>` and a chip list per group when there is more than one group, and a single list otherwise. The existing markup and classes are kept.
- [ ] Run `pnpm --filter web test` and `pnpm --filter web typecheck`. Both should pass.
- [ ] Commit: `feat(web): category links grouped by department, Arabic names from the API`.

### Task 8: Deploy, seed, wave 1

- [ ] Back up the database: `podman exec pricelens-postgres pg_dump -Fc` to `~/pricelens/backups/pre-categories-<ts>.dump`.
- [ ] Run `./scripts/deploy-api.sh`. It builds, runs the unit tests in the image, applies `migrate deploy` in the entrypoint and swaps the containers. Then run `./scripts/deploy-web.sh`.
- [ ] Run `pnpm seed:categories --dry-run`, then run it for real (in the api container or on the host against prod `.env`). Verify with `select level, rollout_wave, count(*) from categories group by 1,2` and check that the existing 11 IDs are unchanged.
- [ ] Set `CATEGORY_SWEEP_MAX_WAVE=1` in `.env`, then redeploy with `./scripts/deploy-api.sh --no-build`. Run the dry-run plan and trigger one live ingestion run.
- [ ] Monitor for about 1 hour: load average, worker memory, the failure counters and `listingsBelowFloor` in `scraping_jobs.result`, and new products per wave-1 leaf. **Roll back** (`CATEGORY_SWEEP_MAX_WAVE=0` and `--no-build`) if load stays above 14, the worker restarts repeatedly, or there are more than 30% `queriesFailed`.
- [ ] Record the outcome in the morning list and in memory.
