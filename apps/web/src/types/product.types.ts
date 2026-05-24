export type ProductTier = 'BUDGET' | 'MID_RANGE' | 'PREMIUM' | 'ULTRA_PREMIUM';
export type MatchStatus =
  | 'ACCEPTED'
  | 'PENDING'
  | 'REJECTED'
  | 'MANUAL_ACCEPT'
  | 'MANUAL_REJECT';

export interface Category {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  level: number;
}

export interface Platform {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  baseUrl: string;
}

export interface CanonicalProduct {
  id: string;
  slug: string;
  categoryId: string;
  category: Category;
  title: string;
  brand: string | null;
  model: string | null;
  gtin: string | null;
  upc: string | null;
  ean: string | null;
  mpn: string | null;
  attributes: Record<string, string | number | boolean>;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  tier: ProductTier;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
  // Aggregated price data (computed server-side)
  priceStats: PriceStats;
  // Listings (included on detail page)
  sourceListings?: SourceListing[];
  _count?: { sourceListings: number };
}

export interface PriceStats {
  min: number | null;
  max: number | null;
  avg: number | null;
  median: number | null;
  current: number | null;
  currency: string;
}

export interface SourceListing {
  id: string;
  platformId: string;
  platform: Platform;
  externalId: string;
  externalUrl: string;
  rawTitle: string;
  rawPrice: number | null;
  rawCurrency: string;
  rawImageUrl: string | null;
  priceUsd: number | null;
  inStock: boolean | null;
  rating: number | null;
  reviewCount: number | null;
  matchStatus: MatchStatus;
  matchConfidence: number | null;
  firstSeenAt: string;
  lastSeenAt: string;
  lastScrapedAt: string | null;
}

export interface PriceHistoryPoint {
  date: string;
  min: number | null;
  max: number | null;
  avg: number | null;
  count: number;
}

export interface PriceHistory {
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

export interface CurrentPrices {
  productId: string;
  listings: Array<{
    id: string;
    platform: Platform;
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

export interface WatchlistItem {
  id: string;
  userId: string;
  canonicalProductId: string;
  canonicalProduct: CanonicalProduct;
  note: string | null;
  bestPrice: number | null;
  createdAt: string;
}

export type AlertType =
  | 'PRICE_DROP_ABSOLUTE'
  | 'PRICE_DROP_PERCENT'
  | 'PRICE_TARGET';

export type AlertStatus = 'ACTIVE' | 'TRIGGERED' | 'DISABLED';

export interface PriceAlert {
  id: string;
  userId: string;
  canonicalProductId: string;
  canonicalProduct: Pick<CanonicalProduct, 'id' | 'title' | 'slug' | 'imageUrl'>;
  alertType: AlertType;
  thresholdValue: number;
  status: AlertStatus;
  lastCheckedAt: string | null;
  triggeredAt: string | null;
  triggeredPrice: number | null;
  createdAt: string;
}