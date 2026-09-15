import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus, OrgRole, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { PlanLimitExceededException } from '../billing/billing.errors';
import { isWithinLimit } from '../billing/plan-limits';
import { PriceIntelligenceService } from '../intelligence/price-intelligence.service';
import { computeHistoryStats } from '../intelligence/price-statistics';
import { OrganizationsService } from './organizations.service';
import {
  CompetitorPrice,
  MarketPosition,
  PricingRecommendation,
  computeMarketPosition,
  recommendPrice,
} from './market-position';

const ACCEPTED_MATCHES: MatchStatus[] = [MatchStatus.ACCEPTED, MatchStatus.MANUAL_ACCEPT];

export interface SellerProductView {
  id: string;
  sku: string;
  name: string;
  canonicalProductId: string | null;
  canonicalTitle: string | null;
  cost: number | null;
  currentPrice: number | null;
  targetMarginPct: number | null;
  minMarginPct: number | null;
  mapPrice: number | null;
  isActive: boolean;
  currency: string;
  position: MarketPosition;
  competitors: CompetitorPrice[];
  recommendation: PricingRecommendation;
}

@Injectable()
export class SellerProductsService {
  private readonly logger = new Logger(SellerProductsService.name);
  private readonly currency: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly entitlements: EntitlementsService,
    private readonly intelligence: PriceIntelligenceService,
    config: ConfigService,
  ) {
    this.currency = config.get<string>('pricing.fxBaseCurrency', 'EGP');
  }

  async list(userId: string, orgId: string, options: { search?: string; limit?: number } = {}) {
    const { organization } = await this.organizations.requireMembership(userId, orgId);

    const products = await this.prisma.sellerProduct.findMany({
      where: {
        orgId,
        ...(options.search
          ? {
              OR: [
                { sku: { contains: options.search, mode: 'insensitive' } },
                { name: { contains: options.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { canonicalProduct: { select: { id: true, title: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(options.limit ?? 100, 1), 500),
    });

    // Positions for the whole list in one pass, rather than a query per row.
    const canonicalIds = products
      .map((product) => product.canonicalProductId)
      .filter((id): id is string => id != null);

    const competitorsByProduct = await this.getCompetitorPrices(canonicalIds);

    return products.map((product) => {
      const competitors = this.excludeOurOwnListing(
        competitorsByProduct.get(product.canonicalProductId ?? '') ?? [],
        organization.platformId,
      );
      const ourPrice = product.currentPrice != null ? Number(product.currentPrice) : null;
      const position = computeMarketPosition(ourPrice, competitors);

      return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        canonicalProductId: product.canonicalProductId,
        canonicalTitle: product.canonicalProduct?.title ?? null,
        cost: product.cost != null ? Number(product.cost) : null,
        currentPrice: ourPrice,
        targetMarginPct: product.targetMarginPct,
        minMarginPct: product.minMarginPct,
        mapPrice: product.mapPrice != null ? Number(product.mapPrice) : null,
        isActive: product.isActive,
        currency: this.currency,
        position,
        competitorCount: competitors.length,
      };
    });
  }

  /** Full detail for one product, including the pricing recommendation. */
  async getOne(userId: string, orgId: string, productId: string): Promise<SellerProductView> {
    const { organization } = await this.organizations.requireMembership(userId, orgId);

    const product = await this.prisma.sellerProduct.findFirst({
      where: { id: productId, orgId },
      include: { canonicalProduct: { select: { id: true, title: true } } },
    });
    if (!product) throw new NotFoundException('Product not found in this workspace');

    const competitors = product.canonicalProductId
      ? this.excludeOurOwnListing(
          (await this.getCompetitorPrices([product.canonicalProductId])).get(product.canonicalProductId) ?? [],
          organization.platformId,
        )
      : [];

    const ourPrice = product.currentPrice != null ? Number(product.currentPrice) : null;
    const position = computeMarketPosition(ourPrice, competitors);

    const recommendation = recommendPrice({
      cost: product.cost != null ? Number(product.cost) : null,
      currentPrice: ourPrice,
      targetMarginPct: product.targetMarginPct,
      minMarginPct: product.minMarginPct,
      position,
    });

    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      canonicalProductId: product.canonicalProductId,
      canonicalTitle: product.canonicalProduct?.title ?? null,
      cost: product.cost != null ? Number(product.cost) : null,
      currentPrice: ourPrice,
      targetMarginPct: product.targetMarginPct,
      minMarginPct: product.minMarginPct,
      mapPrice: product.mapPrice != null ? Number(product.mapPrice) : null,
      isActive: product.isActive,
      currency: this.currency,
      position,
      competitors,
      recommendation,
    };
  }

  async upsert(
    userId: string,
    orgId: string,
    input: {
      id?: string;
      sku: string;
      name: string;
      canonicalProductId?: string | null;
      cost?: number | null;
      currentPrice?: number | null;
      targetMarginPct?: number | null;
      minMarginPct?: number | null;
      mapPrice?: number | null;
      isActive?: boolean;
    },
  ) {
    const { organization } = await this.organizations.requireMembership(userId, orgId, OrgRole.ADMIN);

    if (input.minMarginPct != null && input.targetMarginPct != null && input.minMarginPct > input.targetMarginPct) {
      throw new BadRequestException('The minimum margin cannot be above the target margin');
    }

    const owner = await this.prisma.organizationMember.findFirst({
      where: { orgId, role: OrgRole.OWNER },
      select: { userId: true },
    });
    const { limits } = await this.entitlements.getEntitlements(owner?.userId ?? userId);

    const existing = input.id
      ? await this.prisma.sellerProduct.findFirst({ where: { id: input.id, orgId } })
      : await this.prisma.sellerProduct.findUnique({
          where: { orgId_sku: { orgId, sku: input.sku } },
        });

    if (!existing) {
      const count = await this.prisma.sellerProduct.count({ where: { orgId } });
      if (!isWithinLimit(count, limits.monitoredSkus)) {
        throw new PlanLimitExceededException('monitored products', count, limits.monitoredSkus as number);
      }
    }

    if (input.canonicalProductId) {
      const canonical = await this.prisma.canonicalProduct.findUnique({
        where: { id: input.canonicalProductId },
        select: { id: true },
      });
      if (!canonical) throw new BadRequestException('That catalogue product does not exist');
    }

    const data = {
      name: input.name.trim(),
      canonicalProductId: input.canonicalProductId ?? null,
      cost: this.toDecimal(input.cost),
      currentPrice: this.toDecimal(input.currentPrice),
      targetMarginPct: input.targetMarginPct ?? null,
      minMarginPct: input.minMarginPct ?? null,
      mapPrice: this.toDecimal(input.mapPrice),
      isActive: input.isActive ?? true,
    };

    const product = existing
      ? await this.prisma.sellerProduct.update({ where: { id: existing.id }, data })
      : await this.prisma.sellerProduct.create({
          data: { ...data, orgId: organization.id, sku: input.sku.trim() },
        });

    return { id: product.id, sku: product.sku };
  }

  async remove(userId: string, orgId: string, productId: string) {
    await this.organizations.requireMembership(userId, orgId, OrgRole.ADMIN);
    const result = await this.prisma.sellerProduct.deleteMany({ where: { id: productId, orgId } });
    if (result.count === 0) throw new NotFoundException('Product not found in this workspace');
  }

  /**
   * Suggests catalogue products a SKU might map to.
   *
   * Mapping is the step that makes everything else work, so it is offered as
   * a ranked suggestion rather than requiring the seller to find a UUID.
   */
  async suggestMatches(userId: string, orgId: string, productId: string) {
    await this.organizations.requireMembership(userId, orgId);

    const product = await this.prisma.sellerProduct.findFirst({ where: { id: productId, orgId } });
    if (!product) throw new NotFoundException('Product not found in this workspace');

    // Trigram similarity against the catalogue, which the existing
    // pg_trgm index on canonical_products.title already supports.
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; title: string; slug: string; similarity: number }>
    >`
      SELECT cp.id, cp.title, cp.slug, similarity(cp.title, ${product.name}::text) AS similarity
      FROM canonical_products cp
      WHERE similarity(cp.title, ${product.name}::text) > 0.25
      ORDER BY similarity DESC
      LIMIT 10
    `;

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      confidence: Math.round(row.similarity * 100),
    }));
  }

  /** Competitor prices per canonical product, one row per store. */
  private async getCompetitorPrices(canonicalIds: string[]): Promise<Map<string, CompetitorPrice[]>> {
    const map = new Map<string, CompetitorPrice[]>();
    if (canonicalIds.length === 0) return map;

    const listings = await this.prisma.sourceListing.findMany({
      where: {
        canonicalProductId: { in: canonicalIds },
        priceUsd: { not: null },
        matchStatus: { in: ACCEPTED_MATCHES },
      },
      select: {
        canonicalProductId: true,
        platformId: true,
        priceUsd: true,
        inStock: true,
        externalUrl: true,
        platform: { select: { name: true } },
      },
      orderBy: { priceUsd: 'asc' },
    });

    for (const listing of listings) {
      if (!listing.canonicalProductId) continue;
      const bucket = map.get(listing.canonicalProductId) ?? [];

      // One entry per store -- the store's own cheapest -- so a store listing
      // several variants cannot skew the median.
      if (bucket.some((entry) => entry.platformId === listing.platformId)) continue;

      bucket.push({
        platformId: listing.platformId,
        platformName: listing.platform.name,
        price: Number(listing.priceUsd),
        inStock: listing.inStock,
        url: listing.externalUrl,
      });
      map.set(listing.canonicalProductId, bucket);
    }

    return map;
  }

  /**
   * A seller's own storefront must not count as its own competitor, or the
   * market median silently includes them and every position is wrong.
   *
   * Takes the platform id as an argument rather than reading cached instance
   * state: a cache that callers had to remember to prime would silently
   * include the seller's own listing the first time anyone forgot.
   */
  private excludeOurOwnListing(
    competitors: CompetitorPrice[],
    ownPlatformId: string | null,
  ): CompetitorPrice[] {
    if (!ownPlatformId) return competitors;
    return competitors.filter((competitor) => competitor.platformId !== ownPlatformId);
  }

  private toDecimal(value: number | null | undefined): Prisma.Decimal | null {
    if (value == null || !Number.isFinite(value) || value < 0) return null;
    return new Prisma.Decimal(value.toFixed(2));
  }
}
