// Same-origin by default. Pointing this at 127.0.0.1 means the visitor's own
// machine once it is compiled into the browser bundle, which fails silently.
const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

/**
 * Browser requests go to the public URL, but server-side rendering runs inside
 * the container, where that public hostname is not routable — those fetches
 * used to time out and silently degrade (product pages rendered as "not found"
 * and were marked noindex). On the server, prefer an internal address.
 *
 * API_INTERNAL_URL is a server-only variable, so it is never exposed to or
 * inlined into the client bundle.
 */
export const API_BASE_URL =
  typeof window === 'undefined'
    ? process.env.API_INTERNAL_URL ?? PUBLIC_API_URL
    : PUBLIC_API_URL;

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

export const TIER_LABELS: Record<string, string> = {
  BUDGET: 'Budget',
  MID_RANGE: 'Mid-Range',
  PREMIUM: 'Premium',
  ULTRA_PREMIUM: 'Ultra Premium',
};

export const SORT_OPTIONS = [
  { label: 'Best Match', value: 'relevance', dir: 'desc' },
  { label: 'Lowest Price', value: 'minPriceUsd', dir: 'asc' },
  { label: 'Highest Price', value: 'maxPriceUsd', dir: 'desc' },
  { label: 'Most Listings', value: 'listingCount', dir: 'desc' },
  { label: 'Recently Updated', value: 'updatedAt', dir: 'desc' },
] as const;

export const PRICE_HISTORY_DAYS = [7, 30, 90, 180, 365] as const;
