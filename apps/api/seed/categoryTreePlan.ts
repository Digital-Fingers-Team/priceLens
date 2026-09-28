import type { CategoryDefinition } from './types';

export interface CategoryUpsertRow {
  slug: string;
  parentSlug?: string;
  data: {
    name: string;
    nameAr: string | null;
    level: number;
    searchTerms: string[];
    rolloutWave: number;
    minPriceEgp: number | null;
  };
}

/**
 * The rows the category upsert writes, roots first so every leaf's parent
 * exists when the leaf is written. Pure, so a re-run writes the same rows.
 */
export function planCategoryUpserts(tree: CategoryDefinition[]): CategoryUpsertRow[] {
  const toRow = (category: CategoryDefinition): CategoryUpsertRow => ({
    slug: category.slug,
    parentSlug: category.parentSlug,
    data: {
      name: category.name,
      nameAr: category.nameAr ?? null,
      level: category.level,
      searchTerms: category.searchTerms,
      rolloutWave: category.rolloutWave ?? 0,
      minPriceEgp: category.minPriceEgp ?? null,
    },
  });
  return [...tree.filter((c) => !c.parentSlug), ...tree.filter((c) => c.parentSlug)].map(toRow);
}
