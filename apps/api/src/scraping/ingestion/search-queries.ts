import type { Category } from '@prisma/client';
import type { NormalizerService } from '../../matching/normalizer.service';

/** Pure query builders for the ingestion runs. */

const ARABIC = /[؀-ۿ]/;

/**
 * A phrase as comparable words: lower case, punctuation dropped, Arabic
 * letter variants folded (أ/إ/آ -> ا, ة -> ه, ى -> ي), and each English word
 * singularised ("refrigerators" -> "refrigerator"), so plurals and spelling
 * variants compare equal. Joined with single spaces.
 */
function phraseKey(phrase: string): string {
  return phrase
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((word) => (word.length > 3 && /[a-z]s$/.test(word) && !word.endsWith('ss') ? word.slice(0, -1) : word))
    .join(' ');
}

/**
 * The search terms a category sweep sends to a store: the category name, its
 * slug as words, and its search terms, at most three. Terms that only differ
 * in case or plural are one term, and Arabic terms are left out (the stores
 * are searched in English; Arabic terms serve the free-text resolver).
 */
export function buildQueriesForCategory(category: Category): string[] {
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const raw of [category.name, category.slug.replace(/-/g, ' '), ...category.searchTerms]) {
    const term = raw.trim();
    const key = phraseKey(term);
    if (term.length < 2 || ARABIC.test(term) || seen.has(key)) continue;
    seen.add(key);
    queries.push(term);
  }
  return queries.slice(0, 3);
}

/**
 * The category a free-text search belongs to, or null when none fits.
 *
 * Each category's name, slug words and search terms are matched as whole
 * words against the query (so "phone" is not found in "headphones"). The
 * category with the longest matching phrase wins -- "baby monitor" beats
 * "monitor" -- then the one with more matching phrases, then the first.
 * There is no fallback: a search that fits no category is not scraped into
 * an arbitrary one (owner decision, 2026-09-28).
 */
export function pickCategoryForQuery(query: string, categories: Category[]): Category | null {
  const padded = ` ${phraseKey(query)} `;
  if (padded.trim() === '') return null;

  let best: { category: Category; longest: number; hits: number } | null = null;
  for (const category of categories) {
    let longest = 0;
    let hits = 0;
    for (const phrase of [category.name, category.slug.replace(/-/g, ' '), ...category.searchTerms]) {
      const key = phraseKey(phrase);
      if (key && padded.includes(` ${key} `)) {
        hits += 1;
        longest = Math.max(longest, key.length);
      }
    }
    if (hits === 0) continue;
    if (!best || longest > best.longest || (longest === best.longest && hits > best.hits)) {
      best = { category, longest, hits };
    }
  }
  return best?.category ?? null;
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
