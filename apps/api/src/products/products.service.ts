import { Injectable, NotFoundException } from '@nestjs/common';
import { LiveIngestionService } from '../scraping/live-ingestion.service';
import type { CanonicalProduct, SourceListing } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

type SortBy = 'minPriceUsd' | 'maxPriceUsd' | 'listingCount' | 'updatedAt';
type SortDir = 'asc' | 'desc';

interface SearchProductsOptions {
  liveFetch?: boolean;
  q?: string;
  brand?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  tier?: string;
  page?: number;
  limit?: number;
  sortBy?: SortBy;
  sortDir?: SortDir;
}

interface ProductWithRelations extends CanonicalProduct {
  category: {
    id: string;
    slug: string;
    name: string;
    parentId: string | null;
    level: number;
    searchTerms: string[];
    createdAt: Date;
  };
  sourceListings: Array<SourceListing & {
    platform: {
      id: string;
      slug: string;
      name: string;
      logoUrl: string | null;
      baseUrl: string;
    };
  }>;
}

interface ProductStats {
  minPriceUsd: number | null;
  maxPriceUsd: number | null;
  listingCount: number;
}

interface ProductWithListings {
  sourceListings: Array<{
    priceUsd: unknown;
  }>;
}

export interface CurrentPricesResponse {
  productId: string;
  listings: Array<{
    id: string;
    platform: {
      id: string;
      slug: string;
      name: string;
      logoUrl: string | null;
      baseUrl: string;
    };
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

export interface PriceHistoryResponse {
  productId: string;
  productTitle: string;
  days: number;
  granularity: 'day' | 'week' | 'month';
  chart: Array<{
    date: string;
    min: number | null;
    max: number | null;
    avg: number | null;
    count: number;
  }>;
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

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly liveIngestionService: LiveIngestionService,
  ) {}

  async searchProducts(options: SearchProductsOptions) {
    const {
      q = '',
      brand,
      categoryId,
      minPrice,
      maxPrice,
      tier,
      page = 1,
      limit = 20,
      sortBy = 'minPriceUsd',
      sortDir = 'asc',
      liveFetch = true,
    } = options;

    const products = await this.prisma.canonicalProduct.findMany({
      where: {
        // Only return products backed by real observed listings/prices.
        sourceListings: {
          some: {
            priceUsd: { not: null },
          },
        },
      },
      include: {
        category: true,
        sourceListings: {
          include: { platform: true },
        },
      },
    });

    const normalizedQuery = q.trim().toLowerCase();
    let filtered = products.filter((product) => {
      const searchText = [
        product.title,
        product.brand ?? '',
        product.model ?? '',
        product.slug,
        product.category.name,
        ...(product.category.searchTerms ?? []),
      ]
        .join(' ')
        .toLowerCase();

      const hasQuery =
        !normalizedQuery ||
        searchText.includes(normalizedQuery) ||
        normalizedQuery.split(/\s+/).every((term) => searchText.includes(term));

      if (!hasQuery) return false;
      if (brand && product.brand?.toLowerCase() !== brand.toLowerCase()) return false;
      if (categoryId && product.categoryId !== categoryId) return false;
      if (tier && product.tier !== tier) return false;

      const stats = this.getProductStats(product as ProductWithRelations);
      if (minPrice != null && (stats.minPriceUsd == null || stats.minPriceUsd < minPrice)) {
        return false;
      }
      if (maxPrice != null && (stats.maxPriceUsd == null || stats.maxPriceUsd > maxPrice)) {
        return false;
      }

      return true;
    });


    if (liveFetch && normalizedQuery && filtered.length === 0) {
      await this.liveIngestionService.runLiveIngestion({
        platformSlugs: ['bestbuy', 'amazon'],
        limitPerQuery: 12,
      });

      const refreshed = await this.prisma.canonicalProduct.findMany({
        where: {
          sourceListings: {
            some: {
              priceUsd: { not: null },
            },
          },
        },
        include: {
          category: true,
          sourceListings: {
            include: { platform: true },
          },
        },
      });

      filtered = refreshed.filter((product) => {
        const searchText = [
          product.title,
          product.brand ?? '',
          product.model ?? '',
          product.slug,
          product.category.name,
          ...(product.category.searchTerms ?? []),
        ]
          .join(' ')
          .toLowerCase();

        const hasQuery =
          !normalizedQuery ||
          searchText.includes(normalizedQuery) ||
          normalizedQuery.split(/\s+/).every((term) => searchText.includes(term));

        if (!hasQuery) return false;
        if (brand && product.brand?.toLowerCase() !== brand.toLowerCase()) return false;
        if (categoryId && product.categoryId !== categoryId) return false;
        if (tier && product.tier !== tier) return false;

        const stats = this.getProductStats(product as ProductWithRelations);
        if (minPrice != null && (stats.minPriceUsd == null || stats.minPriceUsd < minPrice)) {
          return false;
        }
        if (maxPrice != null && (stats.maxPriceUsd == null || stats.maxPriceUsd > maxPrice)) {
          return false;
        }

        return true;
      });
    }

    const sorted = filtered.sort((a, b) => {
      const aStats = this.getProductStats(a as ProductWithRelations);
      const bStats = this.getProductStats(b as ProductWithRelations);

      const compareValues = () => {
        switch (sortBy) {
          case 'listingCount':
            return aStats.listingCount - bStats.listingCount;
          case 'maxPriceUsd':
            return (aStats.maxPriceUsd ?? -Infinity) - (bStats.maxPriceUsd ?? -Infinity);
          case 'updatedAt':
            return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          case 'minPriceUsd':
          default:
            return (aStats.minPriceUsd ?? Infinity) - (bStats.minPriceUsd ?? Infinity);
        }
      };

      const direction = sortDir === 'desc' ? -1 : 1;
      const primary = compareValues();
      if (primary !== 0) return primary * direction;

      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const currentPage = Math.min(Math.max(page, 1), totalPages);
    const start = (currentPage - 1) * limit;
    const hits = sorted.slice(start, start + limit).map((product) => this.mapSearchHit(product as ProductWithRelations));

    return {
      hits,
      total,
      query: q.trim(),
      processingTimeMs: 0,
      page: currentPage,
      limit,
    };
  }

  async suggest(q: string, limit = 6) {
    const query = q.trim().toLowerCase();
    if (query.length < 2) return [];

    const products = await this.prisma.canonicalProduct.findMany({
      where: {
        sourceListings: {
          some: {
            priceUsd: { not: null },
          },
        },
      },
      include: { category: true },
    });

    return products
      .filter((product) => {
        const haystack = [
          product.title,
          product.brand ?? '',
          product.model ?? '',
          product.slug,
          product.category.name,
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(query) || query.split(/\s+/).every((term) => haystack.includes(term));
      })
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, limit)
      .map((product) => ({
        id: product.id,
        slug: product.slug,
        title: product.title,
        brand: product.brand,
      }));
  }

  async getBySlug(slug: string) {
    const product = await this.prisma.canonicalProduct.findUnique({
      where: { slug },
      include: {
        category: true,
        sourceListings: {
          include: { platform: true },
          orderBy: [{ priceUsd: 'asc' }, { lastSeenAt: 'desc' }],
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with slug "${slug}" not found`);
    }

    return this.mapProduct(product as ProductWithRelations, true);
  }

  async getListings(productId: string, page = 1, limit = 50) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.sourceListing.findMany({
        where: { canonicalProductId: productId },
        include: { platform: true },
        orderBy: [{ priceUsd: 'asc' }, { lastSeenAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.sourceListing.count({
        where: { canonicalProductId: productId },
      }),
    ]);

    return {
      items: items.map((item) => this.mapListing(item)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getCurrentPrices(productId: string): Promise<CurrentPricesResponse> {
    const product = await this.prisma.canonicalProduct.findUnique({
      where: { id: productId },
      include: {
        sourceListings: {
          include: { platform: true },
          orderBy: [{ priceUsd: 'asc' }, { lastSeenAt: 'desc' }],
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with id "${productId}" not found`);
    }

    const listings = product.sourceListings
      .filter((listing) => listing.priceUsd != null)
      .map((listing) => this.mapCurrentPriceListing(listing));

    const prices = listings.map((listing) => listing.price);

    return {
      productId,
      listings,
      bestPrice: prices.length ? Math.min(...prices) : null,
      worstPrice: prices.length ? Math.max(...prices) : null,
      avgPrice: prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : null,
      currency: listings[0]?.currency ?? 'USD',
    };
  }

  async getPriceStats(productId: string) {
    const product = await this.prisma.canonicalProduct.findUnique({
      where: { id: productId },
      include: {
        sourceListings: {
          include: { platform: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with id "${productId}" not found`);
    }

    const stats = this.getProductStats(product);
    const prices = (product.sourceListings ?? [])
      .map((listing) => this.toNumber(listing.priceUsd))
      .filter((value): value is number => value != null);

    const avg = prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : null;

    return {
      allTime: {
        min: stats.minPriceUsd,
        max: stats.maxPriceUsd,
        avg,
        dataPoints: prices.length,
      },
      week52: {
        low: stats.minPriceUsd,
        high: stats.maxPriceUsd,
      },
    };
  }

  async getPriceHistory(productId: string, days = 90): Promise<PriceHistoryResponse> {
    const product = await this.prisma.canonicalProduct.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with id "${productId}" not found`);
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Math.max(days, 1));

    const history = await this.prisma.priceHistory.findMany({
      where: {
        canonicalProductId: productId,
        recordedAt: { gte: startDate },
      },
      include: {
        sourceListing: {
          include: { platform: true },
        },
      },
      orderBy: { recordedAt: 'asc' },
    });

    const chartMap = new Map<string, number[]>();
    for (const entry of history) {
      const key = entry.recordedAt.toISOString().slice(0, 10);
      const value = this.toNumber(entry.priceUsd);
      if (value == null) continue;
      const existing = chartMap.get(key) ?? [];
      existing.push(value);
      chartMap.set(key, existing);
    }

    const chart = Array.from(chartMap.entries()).map(([date, values]) => {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = values.reduce((sum, price) => sum + price, 0) / values.length;
      return {
        date,
        min,
        max,
        avg,
        count: values.length,
      };
    });

    const prices = history
      .map((entry) => this.toNumber(entry.priceUsd))
      .filter((value): value is number => value != null);
    const avgPrice = prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : null;

    const platformMap = new Map<string, { name: string; min: number; max: number; total: number; count: number }>();
    for (const entry of history) {
      const value = this.toNumber(entry.priceUsd);
      if (value == null) continue;
      const platformId = entry.sourceListing.platformId;
      const current = platformMap.get(platformId);
      if (!current) {
        platformMap.set(platformId, {
          name: entry.sourceListing.platform.name,
          min: value,
          max: value,
          total: value,
          count: 1,
        });
      } else {
        current.min = Math.min(current.min, value);
        current.max = Math.max(current.max, value);
        current.total += value;
        current.count += 1;
      }
    }

    return {
      productId,
      productTitle: product.title,
      days,
      granularity: 'day',
      chart,
      summary: {
        allTimeMin: prices.length ? Math.min(...prices) : null,
        allTimeMax: prices.length ? Math.max(...prices) : null,
        periodMin: prices.length ? Math.min(...prices) : null,
        periodMax: prices.length ? Math.max(...prices) : null,
        avgPrice,
        dataPoints: prices.length,
      },
      platformBreakdown: Array.from(platformMap.entries()).map(([platformId, value]) => ({
        platformId,
        name: value.name,
        minPrice: value.min,
        maxPrice: value.max,
        avgPrice: value.total / value.count,
      })),
    };
  }

  private mapSearchHit(product: ProductWithRelations) {
    const stats = this.getProductStats(product);
    return {
      ...this.mapProduct(product, false),
      minPriceUsd: stats.minPriceUsd,
      maxPriceUsd: stats.maxPriceUsd,
      listingCount: stats.listingCount,
      _formatted: {
        title: product.title,
        brand: product.brand ?? undefined,
        model: product.model ?? undefined,
      },
    };
  }

  private mapProduct(product: ProductWithRelations, includeListings: boolean) {
    const stats = this.getProductStats(product);

    return {
      id: product.id,
      slug: product.slug,
      categoryId: product.categoryId,
      category: {
        id: product.category.id,
        slug: product.category.slug,
        name: product.category.name,
        parentId: product.category.parentId,
        level: product.category.level,
      },
      title: product.title,
      brand: product.brand,
      model: product.model,
      gtin: product.gtin,
      upc: product.upc,
      ean: product.ean,
      mpn: product.mpn,
      attributes: product.attributes as Record<string, string | number | boolean>,
      imageUrl: product.imageUrl,
      thumbnailUrl: product.thumbnailUrl,
      tier: product.tier,
      isVerified: product.isVerified,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
      priceStats: {
        min: stats.minPriceUsd,
        max: stats.maxPriceUsd,
        avg: stats.avgPrice,
        median: stats.medianPrice,
        current: stats.minPriceUsd,
        currency: 'USD',
      },
      ...(includeListings
        ? {
            sourceListings: product.sourceListings.map((listing) => this.mapListing(listing)),
            _count: { sourceListings: product.sourceListings.length },
          }
        : {}),
    };
  }

  private mapListing(
    listing: ProductWithRelations['sourceListings'][number],
  ) {
    const price = this.toNumber(listing.priceUsd);
    return {
      id: listing.id,
      platformId: listing.platformId,
      platform: {
        id: listing.platform.id,
        slug: listing.platform.slug,
        name: listing.platform.name,
        logoUrl: listing.platform.logoUrl,
        baseUrl: listing.platform.baseUrl,
      },
      externalId: listing.externalId,
      externalUrl: listing.externalUrl,
      url: listing.externalUrl,
      rawTitle: listing.rawTitle,
      rawPrice: this.toNumber(listing.rawPrice),
      rawCurrency: listing.rawCurrency,
      rawImageUrl: listing.rawImageUrl,
      priceUsd: this.toNumber(listing.priceUsd),
      price,
      currency: listing.rawCurrency,
      inStock: listing.inStock,
      rating: listing.rating,
      reviewCount: listing.reviewCount,
      matchStatus: listing.matchStatus,
      matchConfidence: listing.matchConfidence,
      firstSeenAt: listing.firstSeenAt.toISOString(),
      lastSeenAt: listing.lastSeenAt.toISOString(),
      lastScrapedAt: listing.lastScrapedAt?.toISOString() ?? null,
    };
  }

  private mapCurrentPriceListing(
    listing: ProductWithRelations['sourceListings'][number],
  ) {
    const price = this.toNumber(listing.priceUsd);
    if (price == null) {
      throw new Error('Current price listing requires a numeric price');
    }

    return {
      id: listing.id,
      platform: {
        id: listing.platform.id,
        slug: listing.platform.slug,
        name: listing.platform.name,
        logoUrl: listing.platform.logoUrl,
        baseUrl: listing.platform.baseUrl,
      },
      price,
      currency: listing.rawCurrency,
      url: listing.externalUrl,
      inStock: listing.inStock,
      rating: listing.rating,
      reviewCount: listing.reviewCount,
      lastSeenAt: listing.lastSeenAt.toISOString(),
    };
  }

  private getProductStats(product: ProductWithListings): ProductStats & { avgPrice: number | null; medianPrice: number | null } {
    const prices = product.sourceListings
      .map((listing) => this.toNumber(listing.priceUsd))
      .filter((value): value is number => value != null);

    if (prices.length === 0) {
      return {
        minPriceUsd: null,
        maxPriceUsd: null,
        listingCount: product.sourceListings.length,
        avgPrice: null,
        medianPrice: null,
      };
    }

    const sorted = [...prices].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianPrice =
      sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];

    return {
      minPriceUsd: sorted[0],
      maxPriceUsd: sorted[sorted.length - 1],
      listingCount: product.sourceListings.length,
      avgPrice: prices.reduce((sum, price) => sum + price, 0) / prices.length,
      medianPrice,
    };
  }

  private toNumber(value: unknown): number | null {
    if (value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
