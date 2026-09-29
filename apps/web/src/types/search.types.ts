import { CanonicalProduct } from './product.types';

export interface SearchHit extends CanonicalProduct {
  minPriceUsd: number | null;
  maxPriceUsd: number | null;
  listingCount: number;
  storeCount: number;
}

export interface SearchResponse {
  hits: SearchHit[];
  total: number;
  query: string;
  processingTimeMs: number;
  page: number;
  limit: number;
  liveFetchTriggered?: boolean;
}

export interface SearchFilters {
  q: string;
  categoryId?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  tier?: string;
  sortBy?: 'relevance' | 'minPriceUsd' | 'maxPriceUsd' | 'listingCount' | 'updatedAt';
  sortDir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface SuggestionItem {
  id: string;
  slug: string;
  title: string;
  titleAr?: string | null;
  brand: string | null;
}
/** GET /categories: a category that holds products. */
export interface CategoryOption {
  id: string;
  slug: string;
  name: string;
  /** Arabic name, when the category tree has one. */
  nameAr: string | null;
  parentId: string | null;
  level: number;
  productCount: number;
  /** The department (level-0 group) the category belongs to. */
  groupSlug: string | null;
  groupName: string | null;
  groupNameAr: string | null;
}
