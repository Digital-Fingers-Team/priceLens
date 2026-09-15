import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../seller/organizations.service';

export interface DistributionSummary {
  /** Distinct stores carrying any of the brand's monitored products. */
  storesDetected: number;
  productsTracked: number;
  listingsTracked: number;
  outOfStock: number;
  /** Listings whose price moved in the last 7 days. */
  changedPrice: number;
  belowMap: number;
  currency: string;
}

export interface DistributionRow {
  sellerProductId: string | null;
  sku: string | null;
  productName: string;
  canonicalProductId: string;
  retailer: string;
  retailerSlug: string;
  price: number;
  mapPrice: number | null;
  belowMap: boolean;
  inStock: boolean | null;
  lastSeenAt: string;
  listingUrl: string;
}

export interface DistributionFilters {
  retailerSlug?: string;
  sellerProductId?: string;
  inStock?: boolean;
  belowMapOnly?: boolean;
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
}

/**
 * Where a brand's products are actually being sold, and on what terms.
 *
 * Every figure is derived from listings we have observed. A store that has
 * stopped carrying a product simply stops appearing -- nothing is inferred
 * about why, and no coverage percentage is invented against a denominator we
 * do not have (we cannot know the stores we do not crawl).
 */
@Injectable()
export class DistributionService {
  private readonly logger = new Logger(DistributionService.name);
  private readonly currency: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    config: ConfigService,
  ) {
    this.currency = config.get<string>('pricing.fxBaseCurrency', 'EGP');
  }

  async getSummary(userId: string, orgId: string): Promise<DistributionSummary> {
    await this.organizations.requireMembership(userId, orgId);

    const products = await this.prisma.sellerProduct.findMany({
      where: { orgId, isActive: true, canonicalProductId: { not: null } },
      select: { canonicalProductId: true, mapPrice: true },
    });

    if (products.length === 0) {
      return {
        storesDetected: 0,
        productsTracked: 0,
        listingsTracked: 0,
        outOfStock: 0,
        changedPrice: 0,
        belowMap: 0,
        currency: this.currency,
      };
    }

    const canonicalIds = products.map((product) => product.canonicalProductId as string);
    const mapByProduct = new Map(
      products
        .filter((product) => product.mapPrice != null)
        .map((product) => [product.canonicalProductId as string, Number(product.mapPrice)]),
    );

    const listings = await this.prisma.sourceListing.findMany({
      where: {
        canonicalProductId: { in: canonicalIds },
        priceUsd: { not: null },
        matchStatus: { in: [MatchStatus.ACCEPTED, MatchStatus.MANUAL_ACCEPT] },
      },
      select: { canonicalProductId: true, platformId: true, priceUsd: true, inStock: true },
    });

    const since = new Date(Date.now() - 7 * 86_400_000);
    const changed = await this.prisma.priceHistory.groupBy({
      by: ['sourceListingId'],
      where: { canonicalProductId: { in: canonicalIds }, recordedAt: { gte: since } },
      _count: { _all: true },
    });

    let belowMap = 0;
    let outOfStock = 0;
    for (const listing of listings) {
      if (listing.inStock === false) outOfStock += 1;
      const map = listing.canonicalProductId ? mapByProduct.get(listing.canonicalProductId) : undefined;
      if (map != null && Number(listing.priceUsd) < map) belowMap += 1;
    }

    return {
      storesDetected: new Set(listings.map((listing) => listing.platformId)).size,
      productsTracked: products.length,
      listingsTracked: listings.length,
      outOfStock,
      changedPrice: changed.length,
      belowMap,
      currency: this.currency,
    };
  }

  /** The filterable distribution table. */
  async listDistribution(
    userId: string,
    orgId: string,
    filters: DistributionFilters = {},
  ): Promise<DistributionRow[]> {
    await this.organizations.requireMembership(userId, orgId);

    const products = await this.prisma.sellerProduct.findMany({
      where: {
        orgId,
        isActive: true,
        canonicalProductId: { not: null },
        ...(filters.sellerProductId ? { id: filters.sellerProductId } : {}),
      },
      select: { id: true, sku: true, name: true, mapPrice: true, canonicalProductId: true },
    });

    if (products.length === 0) return [];

    const byCanonical = new Map(products.map((product) => [product.canonicalProductId as string, product]));

    const listings = await this.prisma.sourceListing.findMany({
      where: {
        canonicalProductId: { in: [...byCanonical.keys()] },
        priceUsd: { not: null },
        matchStatus: { in: [MatchStatus.ACCEPTED, MatchStatus.MANUAL_ACCEPT] },
        ...(filters.retailerSlug ? { platform: { slug: filters.retailerSlug } } : {}),
        ...(filters.inStock != null ? { inStock: filters.inStock } : {}),
        ...(filters.minPrice != null || filters.maxPrice != null
          ? {
              priceUsd: {
                not: null,
                ...(filters.minPrice != null ? { gte: new Prisma.Decimal(filters.minPrice) } : {}),
                ...(filters.maxPrice != null ? { lte: new Prisma.Decimal(filters.maxPrice) } : {}),
              },
            }
          : {}),
      },
      select: {
        canonicalProductId: true,
        priceUsd: true,
        inStock: true,
        externalUrl: true,
        lastSeenAt: true,
        platform: { select: { name: true, slug: true } },
      },
      orderBy: [{ canonicalProductId: 'asc' }, { priceUsd: 'asc' }],
      take: Math.min(Math.max(filters.limit ?? 200, 1), 1000),
    });

    const rows: DistributionRow[] = [];

    for (const listing of listings) {
      const product = listing.canonicalProductId ? byCanonical.get(listing.canonicalProductId) : undefined;
      if (!product) continue;

      const price = Number(listing.priceUsd);
      const mapPrice = product.mapPrice != null ? Number(product.mapPrice) : null;
      const belowMap = mapPrice != null && price < mapPrice;

      if (filters.belowMapOnly && !belowMap) continue;

      rows.push({
        sellerProductId: product.id,
        sku: product.sku,
        productName: product.name,
        canonicalProductId: listing.canonicalProductId as string,
        retailer: listing.platform.name,
        retailerSlug: listing.platform.slug,
        price,
        mapPrice,
        belowMap,
        inStock: listing.inStock,
        lastSeenAt: listing.lastSeenAt.toISOString(),
        listingUrl: listing.externalUrl,
      });
    }

    return rows;
  }

  /** Retailers carrying this brand, for the filter control and coverage view. */
  async listRetailers(userId: string, orgId: string) {
    await this.organizations.requireMembership(userId, orgId);

    const products = await this.prisma.sellerProduct.findMany({
      where: { orgId, isActive: true, canonicalProductId: { not: null } },
      select: { canonicalProductId: true },
    });
    if (products.length === 0) return [];

    const grouped = await this.prisma.sourceListing.groupBy({
      by: ['platformId'],
      where: {
        canonicalProductId: { in: products.map((product) => product.canonicalProductId as string) },
        priceUsd: { not: null },
        matchStatus: { in: [MatchStatus.ACCEPTED, MatchStatus.MANUAL_ACCEPT] },
      },
      _count: { _all: true },
      _min: { priceUsd: true },
    });

    const platforms = await this.prisma.platform.findMany({
      where: { id: { in: grouped.map((row) => row.platformId) } },
      select: { id: true, name: true, slug: true },
    });
    const byId = new Map(platforms.map((platform) => [platform.id, platform]));

    return grouped
      .map((row) => ({
        platformId: row.platformId,
        name: byId.get(row.platformId)?.name ?? 'Unknown',
        slug: byId.get(row.platformId)?.slug ?? '',
        listings: row._count._all,
        cheapest: row._min.priceUsd != null ? Number(row._min.priceUsd) : null,
      }))
      .sort((a, b) => b.listings - a.listings);
  }

  /**
   * Stores that used to carry a product and have stopped appearing.
   *
   * Reported as "not seen since", never as "delisted": a listing can vanish
   * from our view because a scrape failed, and telling a brand a retailer
   * dropped them when they did not would be worse than saying nothing.
   */
  async listLapsedListings(userId: string, orgId: string, staleDays = 14) {
    await this.organizations.requireMembership(userId, orgId);

    const products = await this.prisma.sellerProduct.findMany({
      where: { orgId, isActive: true, canonicalProductId: { not: null } },
      select: { id: true, sku: true, name: true, canonicalProductId: true },
    });
    if (products.length === 0) return [];

    const byCanonical = new Map(products.map((product) => [product.canonicalProductId as string, product]));
    const cutoff = new Date(Date.now() - staleDays * 86_400_000);

    const listings = await this.prisma.sourceListing.findMany({
      where: {
        canonicalProductId: { in: [...byCanonical.keys()] },
        lastSeenAt: { lt: cutoff },
      },
      select: {
        canonicalProductId: true,
        lastSeenAt: true,
        externalUrl: true,
        platform: { select: { name: true, slug: true } },
      },
      orderBy: { lastSeenAt: 'asc' },
      take: 200,
    });

    return listings.map((listing) => {
      const product = byCanonical.get(listing.canonicalProductId as string);
      return {
        sku: product?.sku ?? null,
        productName: product?.name ?? '—',
        retailer: listing.platform.name,
        retailerSlug: listing.platform.slug,
        lastSeenAt: listing.lastSeenAt.toISOString(),
        daysSinceSeen: Math.floor((Date.now() - listing.lastSeenAt.getTime()) / 86_400_000),
        listingUrl: listing.externalUrl,
      };
    });
  }
}
