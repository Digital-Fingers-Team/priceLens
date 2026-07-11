import { CanonicalProduct } from './product.types';

export interface SearchHit extends CanonicalProduct {
  minPriceUsd: number | null;
  maxPriceUsd: number | null;
  listingCount: number;
  storeCount: number;
  _formatted?: {
    title?: string;
    brand?: string;
    model?: string;
  };
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
  brand: string | null;
}