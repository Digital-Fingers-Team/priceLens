import type { Category } from '@prisma/client';
import type { NormalizerService } from '../../matching/normalizer.service';

/** Pure query builders for the ingestion runs. */

/**
 * The search terms a category sweep sends to a store: the category name, its
 * slug as words, and its search terms, deduplicated, at most three.
 */
export function buildQueriesForCategory(category: Category): string[] {
  const terms = [category.name, category.slug.replace(/-/g, ' '), ...category.searchTerms]
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);

  return Array.from(new Set(terms)).slice(0, 3);
}

/**
 * The category a free-text search belongs to: the first whose name contains
 * or is contained in the query, or one of whose search terms appears in it.
 * Falls back to the first category given.
 */
export function pickCategoryForQuery(query: string, categories: Category[]): Category | null {
  const normalizedQuery = query.trim().toLowerCase();
  const queryTerms = normalizedQuery.split(/\s+/).filter(Boolean);

  const match = categories.find((category) => {
    const name = category.name.toLowerCase();
    if (name.includes(normalizedQuery) || normalizedQuery.includes(name)) {
      return true;
    }
    return category.searchTerms.some((term) => {
      const normalizedTerm = term.toLowerCase();
      return normalizedQuery.includes(normalizedTerm) || queryTerms.includes(normalizedTerm);
    });
  });

  return match ?? categories[0] ?? null;
}

/**
 * A specific search query that identifies one product across stores:
 * brand + model + storage, from the product's columns and (as a fallback for
 * older rows) a fresh extraction from its title. Null when the product isn't
 * specific enough to search precisely (no brand + model), so a vague query
 * isn't fanned out to every store.
 */
export function buildProductQuery(
  product: { title: string; brand: string | null; model: string | null },
  normalizer: Pick<NormalizerService, 'extractAttributes'>,
): string | null {
  const extracted = normalizer.extractAttributes(product.title);
  const brand = product.brand?.trim() || extracted.brand?.trim() || null;
  const model = product.model?.trim() || extracted.model?.trim() || null;

  if (!brand || !model) {
    return null;
  }

  const parts = [brand, model];
  if (extracted.storage) {
    parts.push(extracted.storage);
  }

  // A model that already begins with the brand shouldn't double up; dedupe
  // case-insensitively while preserving order.
  const seen = new Set<string>();
  const deduped = parts.filter((part) => {
    const key = part.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped.join(' ');
}
