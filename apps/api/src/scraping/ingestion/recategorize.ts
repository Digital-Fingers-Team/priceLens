import type { Category } from '@prisma/client';
import { pickCategoryForQuery } from './search-queries';

export interface RecategorizeMove {
  productId: string;
  title: string;
  fromCategoryId: string;
  toCategoryId: string;
  toSlug: string;
}

/**
 * Which products to move out of a broad category into the specific leaf their
 * title resolves to (category expansion: the old "home-appliances" catch-all
 * held refrigerators, washers, dishwashers... that now have leaves of their
 * own). Matching only compares products within one category, so without the
 * move every one of them would be created again in its new leaf.
 *
 * Titles that resolve to no target leaf stay where they are.
 */
export function planRecategorization(
  products: Array<{ id: string; title: string; categoryId: string }>,
  targets: Category[],
): RecategorizeMove[] {
  const moves: RecategorizeMove[] = [];
  for (const product of products) {
    const target = pickCategoryForQuery(product.title, targets, {});
    if (!target || target.id === product.categoryId) continue;
    moves.push({
      productId: product.id,
      title: product.title,
      fromCategoryId: product.categoryId,
      toCategoryId: target.id,
      toSlug: target.slug,
    });
  }
  return moves;
}
