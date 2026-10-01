/** A store, as embedded in product and price responses. */
export interface PlatformRef {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  baseUrl: string;
  /** ONLINE, OFFLINE_CHAIN (has branches), USED_MARKET, GROCERY, PHARMACY. Optional for older responses. */
  kind?: 'ONLINE' | 'OFFLINE_CHAIN' | 'USED_MARKET' | 'GROCERY' | 'PHARMACY';
}

/**
 * GET /prices/:productId/current -- the live offers for a product.
 * Prices are in `currency` (the base currency, EGP).
 */
export interface CurrentPricesResponse {
  productId: string;
  listings: Array<{
    id: string;
    platform: PlatformRef;
    price: number;
    currency: string;
    url: string;
    inStock: boolean | null;
    rating: number | null;
    reviewCount: number | null;
    lastSeenAt: string;
  }>;
  bestPrice: number | null;
  worstPrice: number | null;
  avgPrice: number | null;
  currency: string;
}

export interface PriceHistoryPoint {
  date: string;
  min: number | null;
  max: number | null;
  avg: number | null;
  count: number;
}

/** GET /prices/:productId/history */
export interface PriceHistoryResponse {
  productId: string;
  productTitle: string;
  days: number;
  granularity: 'day' | 'week' | 'month';
  chart: PriceHistoryPoint[];
  summary: {
    allTimeMin: number | null;
    allTimeMax: number | null;
    periodMin: number | null;
    periodMax: number | null;
    avgPrice: number | null;
    dataPoints: number;
  };
  platformBreakdown: Array<{
    platformId: string;
    name: string;
    minPrice: number;
    maxPrice: number;
    avgPrice: number;
  }>;
}
