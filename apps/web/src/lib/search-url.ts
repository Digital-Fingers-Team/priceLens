import type { SearchFilters } from '@/types/search.types';

/**
 * The search URL is the only copy of the search state (audit 05, FE-03), so
 * back/forward, reloads and shared links all reproduce the same results.
 * Values are validated here: anything a hand-edited URL gets wrong falls back
 * to the default instead of reaching the API.
 */

export const DEFAULT_LIMIT = 20;

const SORT_BY = ['relevance', 'minPriceUsd', 'maxPriceUsd', 'listingCount', 'updatedAt'] as const;
const SORT_DIR = ['asc', 'desc'] as const;
const TIERS = ['BUDGET', 'MID_RANGE', 'PREMIUM', 'ULTRA_PREMIUM'] as const;

type Readable = Pick<URLSearchParams, 'get'>;

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return allowed.find((a) => a === value);
}

function nonNegative(value: string | null): number | undefined {
  if (value == null || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function text(value: string | null): string | undefined {
  const t = value?.trim();
  return t ? t : undefined;
}

export function parseSearchParams(params: Readable): SearchFilters {
  const page = Math.floor(nonNegative(params.get('page')) ?? 1);
  return {
    q: params.get('q')?.trim() ?? '',
    brand: text(params.get('brand')),
    categoryId: text(params.get('categoryId')),
    tier: oneOf(params.get('tier'), TIERS),
    minPrice: nonNegative(params.get('minPrice')),
    maxPrice: nonNegative(params.get('maxPrice')),
    sortBy: oneOf(params.get('sortBy'), SORT_BY) ?? 'relevance',
    sortDir: oneOf(params.get('sortDir'), SORT_DIR) ?? 'desc',
    page: page >= 1 ? page : 1,
    limit: DEFAULT_LIMIT,
  };
}

/** Defaults are left out, so the plain `/search?q=tv` link stays canonical. */
export function searchHref(filters: SearchFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.brand) params.set('brand', filters.brand);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.tier) params.set('tier', filters.tier);
  if (filters.minPrice != null) params.set('minPrice', String(filters.minPrice));
  if (filters.maxPrice != null) params.set('maxPrice', String(filters.maxPrice));
  if (filters.sortBy && filters.sortBy !== 'relevance') params.set('sortBy', filters.sortBy);
  if (filters.sortDir && filters.sortDir !== 'desc') params.set('sortDir', filters.sortDir);
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  const qs = params.toString();
  return qs ? `/search?${qs}` : '/search';
}

/** Any change other than the page itself starts again from page 1. */
export function withChanges(current: SearchFilters, changes: Partial<SearchFilters>): SearchFilters {
  return { ...current, ...changes, page: changes.page ?? 1 };
}
