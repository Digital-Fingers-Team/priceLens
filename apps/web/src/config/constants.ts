export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api/v1';

export const QUERY_KEYS = {
  search: (filters: unknown) => ['search', filters] as const,
  suggest: (q: string) => ['suggest', q] as const,
  product: (slug: string) => ['product', slug] as const,
  productListings: (id: string) => ['product-listings', id] as const,
  priceHistory: (id: string, params: unknown) =>
    ['price-history', id, params] as const,
  currentPrices: (id: string) => ['current-prices', id] as const,
  priceStats: (id: string) => ['price-stats', id] as const,
  watchlist: () => ['watchlist'] as const,
  alerts: () => ['alerts'] as const,
  reviewQueue: (page: number) => ['review-queue', page] as const,
  dashboardStats: () => ['dashboard-stats'] as const,
} as const;

export const CONFIDENCE_LABELS: Record<string, { label: string; color: string }> = {
  high: { label: 'High Confidence', color: 'text-signal' },
  medium: { label: 'Medium Confidence', color: 'text-amber' },
  low: { label: 'Low Confidence', color: 'text-danger' },
};

export const TIER_LABELS: Record<string, string> = {
  BUDGET: 'Budget',
  MID_RANGE: 'Mid-Range',
  PREMIUM: 'Premium',
  ULTRA_PREMIUM: 'Ultra Premium',
};

export const MATCH_STATUS_LABELS: Record<string, string> = {
  ACCEPTED: 'Accepted',
  PENDING: 'Pending Review',
  REJECTED: 'Rejected',
  MANUAL_ACCEPT: 'Manually Accepted',
  MANUAL_REJECT: 'Manually Rejected',
};

export const SORT_OPTIONS = [
  { label: 'Best Match', value: 'relevance', dir: 'desc' },
  { label: 'Lowest Price', value: 'minPriceUsd', dir: 'asc' },
  { label: 'Highest Price', value: 'maxPriceUsd', dir: 'desc' },
  { label: 'Most Listings', value: 'listingCount', dir: 'desc' },
  { label: 'Recently Updated', value: 'updatedAt', dir: 'desc' },
] as const;

export const PRICE_HISTORY_DAYS = [7, 30, 90, 180, 365] as const;
