import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LandedCostRule, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { FEATURES } from '../billing/plan-limits';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { OfferPolicy, liveOfferWhere, liveOffers } from '../prices/offer-rules';
import { LandedCostBreakdown, computeLandedCost } from './landed-cost';

export interface LandedOffer {
  listingId: string;
  store: string;
  storeSlug: string;
  price: number;
  total: number;
  deliveryDays: string | null;
  /** The rates used, always shown: the total is an estimate built on them. */
  assumptions: { customsPct: number; vatPct: number; shipping: 'included' | 'estimated' };
  /** Line by line, for plans with landed_cost_detail. */
  breakdown: LandedCostBreakdown | null;
}

export interface AdminRuleInput {
  platformId: string;
  categoryId?: string | null;
  shippingFlat?: number;
  shippingPct?: number;
  customsPct?: number;
  vatPct?: number;
  handlingFee?: number;
  deliveryDays?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

@Injectable()
export class LandedCostService {
  private readonly offerPolicy: OfferPolicy;

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly flags: FeatureFlagsService,
    config: ConfigService,
  ) {
    this.offerPolicy = { maxAgeDays: config.get<number>('pricing.offerMaxAgeDays', 7) };
  }

  /**
   * Cross-border offers on a product, each with its estimated price at the
   * door, next to the cheapest local offer so the buyer can compare like
   * with like. Every store without a rule is local and is not listed.
   */
  async forProduct(productId: string, userId: string | null) {
    const product = await this.prisma.canonicalProduct.findUnique({
      where: { id: productId },
      select: { id: true, categoryId: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const rules = await this.prisma.landedCostRule.findMany({ where: { isActive: true } });
    const crossBorder = new Set(rules.map((rule) => rule.platformId));

    const candidates = await this.prisma.sourceListing.findMany({
      where: { canonicalProductId: productId, ...liveOfferWhere(this.offerPolicy) },
      select: {
        id: true,
        priceUsd: true,
        inStock: true,
        externalUrl: true,
        platformId: true,
        rawTitle: true,
        lastSeenAt: true,
        matchStatus: true,
        platform: { select: { name: true, slug: true } },
      },
      orderBy: [{ priceUsd: 'asc' }, { id: 'asc' }],
    });
    const offers = liveOffers(candidates, this.offerPolicy);

    const detail = await this.canSeeDetail(userId);
    const landed: LandedOffer[] = [];
    let cheapestLocal: { store: string; price: number } | null = null;

    for (const offer of offers) {
      const price = Number(offer.priceUsd);
      if (!(price > 0)) continue;
      if (!crossBorder.has(offer.platformId)) {
        if (!cheapestLocal || price < cheapestLocal.price) cheapestLocal = { store: offer.platform.name, price };
        continue;
      }
      const rule = pickRule(rules, offer.platformId, product.categoryId);
      if (!rule) continue;
      const breakdown = computeLandedCost(price, ruleValues(rule));
      landed.push({
        listingId: offer.id,
        store: offer.platform.name,
        storeSlug: offer.platform.slug,
        price: breakdown.price,
        total: breakdown.total,
        deliveryDays: rule.deliveryDays,
        assumptions: {
          customsPct: rule.customsPct,
          vatPct: rule.vatPct,
          shipping: Number(rule.shippingFlat) > 0 || rule.shippingPct > 0 ? 'estimated' : 'included',
        },
        breakdown: detail ? breakdown : null,
      });
    }

    landed.sort((a, b) => a.total - b.total);
    return { currency: 'EGP', offers: landed, cheapestLocal, detail };
  }

  private async canSeeDetail(userId: string | null): Promise<boolean> {
    if (!userId || !(await this.flags.isEnabled(FEATURES.LANDED_COST_DETAIL))) return false;
    const { limits } = await this.entitlements.getEntitlements(userId);
    return limits.features.includes(FEATURES.LANDED_COST_DETAIL);
  }

  // ─── Admin ────────────────────────────────────────────────────────────

  async adminList() {
    const rules = await this.prisma.landedCostRule.findMany({
      include: { platform: { select: { slug: true, name: true } }, category: { select: { slug: true, name: true } } },
      orderBy: [{ platform: { slug: 'asc' } }, { categoryId: { sort: 'asc', nulls: 'first' } }],
    });
    return rules.map((rule) => ({
      ...ruleValues(rule),
      id: rule.id,
      platformId: rule.platformId,
      platform: rule.platform,
      categoryId: rule.categoryId,
      category: rule.category,
      deliveryDays: rule.deliveryDays,
      notes: rule.notes,
      isActive: rule.isActive,
      updatedAt: rule.updatedAt.toISOString(),
    }));
  }

  /** Creates or updates the rule for (store, category); a null category is the store's default. */
  async adminSave(input: AdminRuleInput, actorId: string) {
    const data = {
      ...(input.shippingFlat !== undefined ? { shippingFlat: new Prisma.Decimal(input.shippingFlat) } : {}),
      ...(input.shippingPct !== undefined ? { shippingPct: input.shippingPct } : {}),
      ...(input.customsPct !== undefined ? { customsPct: input.customsPct } : {}),
      ...(input.vatPct !== undefined ? { vatPct: input.vatPct } : {}),
      ...(input.handlingFee !== undefined ? { handlingFee: new Prisma.Decimal(input.handlingFee) } : {}),
      ...(input.deliveryDays !== undefined ? { deliveryDays: input.deliveryDays } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      updatedById: actorId,
    };
    const categoryId = input.categoryId ?? null;
    // (platform, NULL) is not covered by the unique index, so look it up.
    const existing = await this.prisma.landedCostRule.findFirst({ where: { platformId: input.platformId, categoryId } });
    if (existing) return this.prisma.landedCostRule.update({ where: { id: existing.id }, data });
    return this.prisma.landedCostRule.create({ data: { platformId: input.platformId, categoryId, ...data } });
  }

  async adminDelete(id: string) {
    const result = await this.prisma.landedCostRule.deleteMany({ where: { id } });
    if (result.count === 0) throw new NotFoundException('Rule not found');
  }
}

export function pickRule(rules: LandedCostRule[], platformId: string, categoryId: string | null): LandedCostRule | null {
  return (
    (categoryId && rules.find((rule) => rule.platformId === platformId && rule.categoryId === categoryId)) ||
    rules.find((rule) => rule.platformId === platformId && rule.categoryId === null) ||
    null
  );
}

function ruleValues(rule: LandedCostRule) {
  return {
    shippingFlat: Number(rule.shippingFlat),
    shippingPct: rule.shippingPct,
    customsPct: rule.customsPct,
    vatPct: rule.vatPct,
    handlingFee: Number(rule.handlingFee),
  };
}
