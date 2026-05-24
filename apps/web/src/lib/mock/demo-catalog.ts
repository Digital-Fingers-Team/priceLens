import type { ApiResponse, PaginatedData } from '@/types/api.types';
import type {
  CanonicalProduct,
  CurrentPrices,
  PriceHistory,
  ProductTier,
  SourceListing,
} from '@/types/product.types';
import type { SearchFilters, SearchHit, SearchResponse, SuggestionItem } from '@/types/search.types';

type PriceHistoryParams = {
  days?: number;
  granularity?: 'day' | 'week' | 'month';
  platformId?: string;
};

type DemoListingSeed = Omit<SourceListing, 'platform'> & {
  platform: SourceListing['platform'];
};

type DemoProductSeed = {
  id: string;
  slug: string;
  categoryId: string;
  category: CanonicalProduct['category'];
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
  listings: DemoListingSeed[];
};

const AMAZON = {
  id: 'platform-amazon',
  slug: 'amazon',
  name: 'Amazon',
  logoUrl: null,
  baseUrl: 'https://www.amazon.com',
};

const NEWEGG = {
  id: 'platform-newegg',
  slug: 'newegg',
  name: 'Newegg',
  logoUrl: null,
  baseUrl: 'https://www.newegg.com',
};

const BESTBUY = {
  id: 'platform-bestbuy',
  slug: 'bestbuy',
  name: 'Best Buy',
  logoUrl: null,
  baseUrl: 'https://www.bestbuy.com',
};

const BNH = {
  id: 'platform-bh',
  slug: 'bnh',
  name: 'B&H Photo',
  logoUrl: null,
  baseUrl: 'https://www.bhphotovideo.com',
};

const WALMART = {
  id: 'platform-walmart',
  slug: 'walmart',
  name: 'Walmart',
  logoUrl: null,
  baseUrl: 'https://www.walmart.com',
};

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function makeListing(
  productId: string,
  platform: DemoListingSeed['platform'],
  externalId: string,
  title: string,
  rawPrice: number,
  options: Partial<DemoListingSeed> = {},
): DemoListingSeed {
  const delta = options.matchConfidence == null ? 0.94 : options.matchConfidence;
  return {
    id: `${productId}-${platform.slug}`,
    platformId: platform.id,
    platform,
    externalId,
    externalUrl: options.externalUrl ?? `${platform.baseUrl}/dp/${externalId}`,
    rawTitle: title,
    rawPrice,
    rawCurrency: 'USD',
    rawImageUrl: null,
    priceUsd: options.priceUsd ?? rawPrice,
    inStock: options.inStock ?? true,
    rating: options.rating ?? 4.7,
    reviewCount: options.reviewCount ?? 120,
    matchStatus: options.matchStatus ?? 'ACCEPTED',
    matchConfidence: delta,
    firstSeenAt: options.firstSeenAt ?? daysAgo(28),
    lastSeenAt: options.lastSeenAt ?? daysAgo(2),
    lastScrapedAt: options.lastScrapedAt ?? daysAgo(1),
  };
}

function priceStats(listings: DemoListingSeed[]) {
  const prices = listings.map((listing) => listing.priceUsd).filter((value): value is number => value != null);
  if (prices.length === 0) {
    return { min: null, max: null, avg: null, median: null, current: null, currency: 'USD' };
  }

  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: prices.reduce((sum, value) => sum + value, 0) / prices.length,
    median,
    current: sorted[0],
    currency: 'USD',
  };
}

function buildProduct(seed: DemoProductSeed): CanonicalProduct {
  return {
    id: seed.id,
    slug: seed.slug,
    categoryId: seed.categoryId,
    category: seed.category,
    title: seed.title,
    brand: seed.brand,
    model: seed.model,
    gtin: seed.gtin,
    upc: seed.upc,
    ean: seed.ean,
    mpn: seed.mpn,
    attributes: seed.attributes,
    imageUrl: seed.imageUrl,
    thumbnailUrl: seed.thumbnailUrl,
    tier: seed.tier,
    isVerified: seed.isVerified,
    createdAt: seed.createdAt,
    updatedAt: seed.updatedAt,
    priceStats: priceStats(seed.listings),
    sourceListings: seed.listings,
    _count: { sourceListings: seed.listings.length },
  };
}

const demoProducts = [
  buildProduct({
    id: 'demo-rtx-4090',
    slug: 'nvidia-geforce-rtx-4090-founders-edition',
    categoryId: 'cat-gpu',
    category: {
      id: 'cat-gpu',
      slug: 'graphics-cards',
      name: 'Graphics Cards',
      parentId: null,
      level: 1,
    },
    title: 'NVIDIA GeForce RTX 4090 Founders Edition',
    brand: 'NVIDIA',
    model: 'RTX 4090 FE',
    gtin: '1234567890409',
    upc: '000123456789',
    ean: '01234567890409',
    mpn: 'RTX-4090-FE',
    attributes: {
      memory: '24GB GDDR6X',
      interface: 'PCIe 4.0',
      cooling: 'Dual Slot',
    },
    imageUrl: null,
    thumbnailUrl: null,
    tier: 'ULTRA_PREMIUM',
    isVerified: true,
    createdAt: daysAgo(60),
    updatedAt: daysAgo(1),
    listings: [
      makeListing('demo-rtx-4090', AMAZON, 'RTX4090-AMZ', 'NVIDIA GeForce RTX 4090 Founders Edition', 1599.99, {
        rating: 4.8,
        reviewCount: 842,
        matchConfidence: 0.99,
        lastSeenAt: daysAgo(1),
      }),
      makeListing('demo-rtx-4090', NEWEGG, 'RTX4090-NE', 'NVIDIA GeForce RTX 4090 Founders Edition', 1649.99, {
        rating: 4.7,
        reviewCount: 320,
        matchConfidence: 0.97,
        lastSeenAt: daysAgo(2),
      }),
      makeListing('demo-rtx-4090', BESTBUY, 'RTX4090-BB', 'NVIDIA GeForce RTX 4090 Founders Edition', 1679.99, {
        rating: 4.7,
        reviewCount: 215,
        matchConfidence: 0.95,
        lastSeenAt: daysAgo(3),
      }),
      makeListing('demo-rtx-4090', BNH, 'RTX4090-BH', 'NVIDIA GeForce RTX 4090 Founders Edition', 1629.0, {
        rating: 4.9,
        reviewCount: 98,
        matchConfidence: 0.96,
        lastSeenAt: daysAgo(2),
      }),
    ],
  }),
  buildProduct({
    id: 'demo-macbook-pro-14',
    slug: 'apple-macbook-pro-14-m3-pro',
    categoryId: 'cat-laptop',
    category: {
      id: 'cat-laptop',
      slug: 'laptops',
      name: 'Laptops',
      parentId: null,
      level: 1,
    },
    title: 'Apple MacBook Pro 14" M3 Pro',
    brand: 'Apple',
    model: 'MacBook Pro 14 M3 Pro',
    gtin: '9876543210014',
    upc: '000987654321',
    ean: '09876543210014',
    mpn: 'MQ2Q3LL/A',
    attributes: {
      memory: '18GB Unified',
      storage: '512GB SSD',
      display: '14.2-inch Liquid Retina XDR',
    },
    imageUrl: null,
    thumbnailUrl: null,
    tier: 'PREMIUM',
    isVerified: true,
    createdAt: daysAgo(45),
    updatedAt: daysAgo(2),
    listings: [
      makeListing('demo-macbook-pro-14', AMAZON, 'MBP14-AMZ', 'Apple MacBook Pro 14-inch M3 Pro 512GB', 1899.0, {
        rating: 4.9,
        reviewCount: 1142,
        matchConfidence: 0.98,
        lastSeenAt: daysAgo(1),
      }),
      makeListing('demo-macbook-pro-14', BESTBUY, 'MBP14-BB', 'Apple MacBook Pro 14-inch M3 Pro 512GB', 1949.0, {
        rating: 4.8,
        reviewCount: 454,
        matchConfidence: 0.96,
        lastSeenAt: daysAgo(2),
      }),
      makeListing('demo-macbook-pro-14', BNH, 'MBP14-BH', 'Apple MacBook Pro 14-inch M3 Pro 512GB', 1879.0, {
        rating: 4.8,
        reviewCount: 189,
        matchConfidence: 0.95,
        lastSeenAt: daysAgo(3),
      }),
    ],
  }),
  buildProduct({
    id: 'demo-galaxy-s24',
    slug: 'samsung-galaxy-s24-ultra',
    categoryId: 'cat-phone',
    category: {
      id: 'cat-phone',
      slug: 'smartphones',
      name: 'Smartphones',
      parentId: null,
      level: 1,
    },
    title: 'Samsung Galaxy S24 Ultra 256GB',
    brand: 'Samsung',
    model: 'Galaxy S24 Ultra',
    gtin: '8806091234567',
    upc: '00880609123456',
    ean: '08806091234567',
    mpn: 'SM-S928B',
    attributes: {
      memory: '12GB RAM',
      storage: '256GB',
      display: '6.8-inch AMOLED',
    },
    imageUrl: null,
    thumbnailUrl: null,
    tier: 'MID_RANGE',
    isVerified: true,
    createdAt: daysAgo(32),
    updatedAt: daysAgo(1),
    listings: [
      makeListing('demo-galaxy-s24', AMAZON, 'S24-AMZ', 'Samsung Galaxy S24 Ultra 256GB', 1199.99, {
        rating: 4.8,
        reviewCount: 763,
        matchConfidence: 0.98,
        lastSeenAt: daysAgo(1),
      }),
      makeListing('demo-galaxy-s24', NEWEGG, 'S24-NE', 'Samsung Galaxy S24 Ultra 256GB', 1149.99, {
        rating: 4.7,
        reviewCount: 241,
        matchConfidence: 0.96,
        lastSeenAt: daysAgo(2),
      }),
      makeListing('demo-galaxy-s24', WALMART, 'S24-WM', 'Samsung Galaxy S24 Ultra 256GB', 1169.0, {
        rating: 4.6,
        reviewCount: 388,
        matchConfidence: 0.94,
        lastSeenAt: daysAgo(2),
      }),
    ],
  }),
] as const;

function getProducts() {
  return [...demoProducts];
}

function getProductByIdOrSlug(value: string) {
  const query = value.trim().toLowerCase();
  return getProducts().find(
    (product) => product.id.toLowerCase() === query || product.slug.toLowerCase() === query,
  );
}

function getComparableValue(product: CanonicalProduct, sortBy: NonNullable<SearchFilters['sortBy']>) {
  switch (sortBy) {
    case 'listingCount':
      return product._count?.sourceListings ?? product.sourceListings?.length ?? 0;
    case 'maxPriceUsd':
      return product.priceStats.max ?? -Infinity;
    case 'updatedAt':
      return new Date(product.updatedAt).getTime();
    case 'minPriceUsd':
    default:
      return product.priceStats.min ?? Infinity;
  }
}

function normalizeSearchText(product: CanonicalProduct) {
  return [
    product.title,
    product.brand ?? '',
    product.model ?? '',
    product.slug,
    product.category.name,
    ...Object.values(product.attributes).map((value) => String(value)),
  ]
    .join(' ')
    .toLowerCase();
}

function toSearchHit(product: CanonicalProduct): SearchHit {
  return {
    ...product,
    minPriceUsd: product.priceStats.min,
    maxPriceUsd: product.priceStats.max,
    listingCount: product._count?.sourceListings ?? product.sourceListings?.length ?? 0,
    _formatted: {
      title: product.title,
      brand: product.brand ?? undefined,
      model: product.model ?? undefined,
    },
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildHistory(product: CanonicalProduct, days: number): PriceHistory {
  const clampedDays = Math.max(1, Math.min(days, 365));
  const base = product.priceStats.min ?? 100;
  const max = product.priceStats.max ?? base;
  const amplitude = Math.max((max - base) * 0.45, base * 0.03);
  const start = new Date();
  start.setDate(start.getDate() - clampedDays + 1);

  const chart = Array.from({ length: clampedDays }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const wave = Math.sin(index / 7) * amplitude;
    const trend = Math.cos(index / 19) * amplitude * 0.35;
    const center = base + wave + trend;
    const min = Math.max(1, center - amplitude * 0.28);
    const maxValue = center + amplitude * 0.24;
    const avg = (min + maxValue) / 2;

    return {
      date: date.toISOString().slice(0, 10),
      min: Number(min.toFixed(2)),
      max: Number(maxValue.toFixed(2)),
      avg: Number(avg.toFixed(2)),
      count: 3,
    };
  });

  const priceValues = chart.flatMap((point) => [point.min, point.max, point.avg]).filter((value): value is number => value != null);
  const avgPrice = priceValues.reduce((sum, value) => sum + value, 0) / priceValues.length;

  return {
    productId: product.id,
    productTitle: product.title,
    days: clampedDays,
    granularity: clampedDays <= 45 ? 'day' : clampedDays <= 180 ? 'week' : 'month',
    chart,
    summary: {
      allTimeMin: product.priceStats.min,
      allTimeMax: product.priceStats.max,
      periodMin: product.priceStats.min,
      periodMax: product.priceStats.max,
      avgPrice: Number(avgPrice.toFixed(2)),
      dataPoints: chart.length,
    },
    platformBreakdown: product.sourceListings!.map((listing) => {
      const price = listing.priceUsd ?? 0;
      return {
        platformId: listing.platformId,
        name: listing.platform.name,
        minPrice: price,
        maxPrice: price,
        avgPrice: price,
      };
    }),
  };
}

export function searchDemoCatalog(filters: SearchFilters): SearchResponse {
  const products = getProducts();
  const query = (filters.q ?? '').trim().toLowerCase();
  const filtered = products.filter((product) => {
    const haystack = normalizeSearchText(product);
    const matchesQuery =
      !query ||
      haystack.includes(query) ||
      query.split(/\s+/).every((term) => haystack.includes(term));

    if (!matchesQuery) return false;
    if (filters.brand && product.brand?.toLowerCase() !== filters.brand.toLowerCase()) return false;
    if (filters.categoryId && product.categoryId !== filters.categoryId) return false;
    if (filters.tier && product.tier !== filters.tier) return false;

    if (filters.minPrice != null && (product.priceStats.min == null || product.priceStats.min < filters.minPrice)) {
      return false;
    }

    if (filters.maxPrice != null && (product.priceStats.max == null || product.priceStats.max > filters.maxPrice)) {
      return false;
    }

    return true;
  });

  const sortBy = filters.sortBy ?? 'minPriceUsd';
  const sortDir = filters.sortDir ?? 'asc';
  const sorted = filtered.sort((a, b) => {
    const compare = getComparableValue(a, sortBy) - getComparableValue(b, sortBy);
    if (compare !== 0) return sortDir === 'desc' ? -compare : compare;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const page = Math.max(filters.page ?? 1, 1);
  const limit = Math.max(filters.limit ?? 20, 1);
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * limit;

  return {
    hits: sorted.slice(start, start + limit).map(toSearchHit),
    total,
    query: filters.q?.trim() ?? '',
    processingTimeMs: 1,
    page: currentPage,
    limit,
  };
}

export function suggestDemoProducts(q: string, limit = 6): SuggestionItem[] {
  const query = q.trim().toLowerCase();
  if (query.length < 2) return [];

  return getProducts()
    .filter((product) => normalizeSearchText(product).includes(query))
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, Math.max(limit, 1))
    .map((product) => ({
      id: product.id,
      slug: product.slug,
      title: product.title,
      brand: product.brand,
    }));
}

export function getDemoProductBySlug(slug: string) {
  const product = getProductByIdOrSlug(slug);
  return product ? clone(product) : null;
}

export function getDemoListings(productId: string, page = 1, limit = 50): PaginatedData<SourceListing> {
  const product = getProductByIdOrSlug(productId);
  const listings = product?.sourceListings ?? [];
  const safePage = Math.max(page, 1);
  const safeLimit = Math.max(limit, 1);
  const total = listings.length;
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  const currentPage = Math.min(safePage, totalPages);
  const start = (currentPage - 1) * safeLimit;

  return {
    items: clone(listings.slice(start, start + safeLimit)),
    total,
    page: currentPage,
    limit: safeLimit,
    totalPages,
  };
}

export function getDemoPriceStats(productId: string) {
  const product = getProductByIdOrSlug(productId);
  if (!product) return null;

  return {
    allTime: {
      min: product.priceStats.min,
      max: product.priceStats.max,
      avg: product.priceStats.avg,
      dataPoints: product.sourceListings?.length ?? 0,
    },
    week52: {
      low: product.priceStats.min,
      high: product.priceStats.max,
    },
  };
}

export function getDemoCurrentPrices(productId: string): CurrentPrices | null {
  const product = getProductByIdOrSlug(productId);
  if (!product) return null;

  const listings = (product.sourceListings ?? [])
    .filter((listing) => listing.priceUsd != null)
    .map((listing) => ({
      id: listing.id,
      platform: listing.platform,
      price: listing.priceUsd!,
      currency: listing.rawCurrency,
      url: listing.externalUrl,
      inStock: listing.inStock,
      rating: listing.rating,
      reviewCount: listing.reviewCount,
      lastSeenAt: listing.lastSeenAt,
    }));

  const prices = listings.map((listing) => listing.price);

  return {
    productId: product.id,
    listings,
    bestPrice: prices.length ? Math.min(...prices) : null,
    worstPrice: prices.length ? Math.max(...prices) : null,
    avgPrice: prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : null,
    currency: listings[0]?.currency ?? 'USD',
  };
}

export function getDemoPriceHistory(productId: string, params: PriceHistoryParams = {}): PriceHistory | null {
  const product = getProductByIdOrSlug(productId);
  if (!product) return null;
  return buildHistory(product, params.days ?? 90);
}
