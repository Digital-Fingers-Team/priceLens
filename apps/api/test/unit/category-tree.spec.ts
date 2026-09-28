import { categoryTree } from '../../seed/datasets/categoryTree';
import { planCategoryUpserts } from '../../seed/categoryTreePlan';
import { RESOLVER_ALIASES } from '../../src/scraping/ingestion/category-aliases';

const leaves = categoryTree.filter((c) => c.level === 1);
const ORIGINAL_LEAVES = [
  'smartphones',
  'laptops',
  'graphics-cards',
  'processors',
  'monitors',
  'televisions',
  'headphones',
  'tablets',
  'smart-watches',
  'gaming-consoles',
  'home-appliances',
];

describe('category tree', () => {
  it('has unique slugs', () => {
    const slugs = categoryTree.map((c) => c.slug);
    expect(slugs.filter((slug, i) => slugs.indexOf(slug) !== i)).toEqual([]);
  });

  it('gives every leaf an existing level-0 parent', () => {
    const roots = new Set(categoryTree.filter((c) => c.level === 0).map((c) => c.slug));
    expect(leaves.filter((leaf) => !roots.has(leaf.parentSlug ?? '')).map((l) => l.slug)).toEqual([]);
  });

  it('gives every category an Arabic name', () => {
    expect(categoryTree.filter((c) => !c.nameAr).map((c) => c.slug)).toEqual([]);
  });

  it('gives every leaf 3+ search terms, none shared with another leaf', () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const leaf of leaves) {
      expect([leaf.slug, leaf.searchTerms.length >= 3]).toEqual([leaf.slug, true]);
      for (const term of leaf.searchTerms) {
        const key = term.trim().toLowerCase();
        const other = owner.get(key);
        if (other && other !== leaf.slug) clashes.push(`${term}: ${other} / ${leaf.slug}`);
        owner.set(key, leaf.slug);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('stores no resolver-only aliases or bare spec words as search terms', () => {
    // Stored terms widen site search (search.service categorySearchTermsMatch): "iphone" as a
    // smartphones term made every phone match "iphone" (review finding C2). "ram"/"ssd"/"camera"
    // hijacked phone and laptop titles (I5).
    const stored = new Set(categoryTree.flatMap((c) => c.searchTerms.map((term) => term.toLowerCase())));
    for (const aliases of Object.values(RESOLVER_ALIASES)) {
      expect(aliases.filter((alias) => stored.has(alias.toLowerCase()))).toEqual([]);
    }
    expect(['ram', 'ssd'].filter((word) => stored.has(word))).toEqual([]);
  });

  it('gives aliases only to categories that exist', () => {
    const slugs = new Set(leaves.map((l) => l.slug));
    expect(Object.keys(RESOLVER_ALIASES).filter((slug) => !slugs.has(slug))).toEqual([]);
  });

  it('keeps the original leaves at wave 0 with no floor', () => {
    for (const slug of ORIGINAL_LEAVES.filter((s) => s !== 'home-appliances')) {
      const category = categoryTree.find((c) => c.slug === slug);
      expect([slug, category?.parentSlug, category?.rolloutWave, category?.minPriceEgp]).toEqual([slug, 'electronics', 0, 0]);
    }
  });

  it('retires the home-appliances catch-all (wave -1), whose products move to the specific leaves', () => {
    // Review finding C1: sweeping it would keep creating fridges and washers
    // that the new leaves also hold, and matching never compares across categories.
    const category = categoryTree.find((c) => c.slug === 'home-appliances');
    expect([category?.rolloutWave, category?.minPriceEgp]).toEqual([-1, 0]);
  });

  it('puts every new leaf in wave 1 or later, with no floor override', () => {
    const fresh = leaves.filter((l) => !ORIGINAL_LEAVES.includes(l.slug));
    expect(fresh.filter((l) => (l.rolloutWave ?? 0) < 1).map((l) => l.slug)).toEqual([]);
    expect(fresh.filter((l) => l.minPriceEgp != null).map((l) => l.slug)).toEqual([]);
  });

  it('has well over 100 leaves and a wave 1 of 10-15', () => {
    expect(leaves.length).toBeGreaterThanOrEqual(120);
    const wave1 = leaves.filter((l) => l.rolloutWave === 1).length;
    expect(wave1).toBeGreaterThanOrEqual(10);
    expect(wave1).toBeLessThanOrEqual(15);
  });
});

describe('planCategoryUpserts', () => {
  const plan = planCategoryUpserts(categoryTree);

  it('upserts every category once, roots before leaves', () => {
    expect(plan).toHaveLength(categoryTree.length);
    const firstLeaf = plan.findIndex((row) => row.parentSlug);
    expect(plan.slice(0, firstLeaf).every((row) => !row.parentSlug)).toBe(true);
    expect(plan.slice(firstLeaf).every((row) => row.parentSlug)).toBe(true);
  });

  it('is deterministic, so a re-run writes the same rows', () => {
    expect(planCategoryUpserts(categoryTree)).toEqual(plan);
  });

  it('writes the rollout fields with explicit defaults', () => {
    const phones = plan.find((row) => row.slug === 'smartphones');
    expect(phones?.data).toMatchObject({ rolloutWave: 0, minPriceEgp: 0, level: 1 });
    expect(plan.find((row) => row.slug === 'home-appliances')?.data).toMatchObject({ rolloutWave: -1, minPriceEgp: 0 });
    const root = plan.find((row) => row.slug === 'electronics');
    expect(root?.data).toMatchObject({ rolloutWave: 0, minPriceEgp: null, level: 0 });
  });
});
