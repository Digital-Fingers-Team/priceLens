import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PromoType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { FEATURES, FeatureKey } from '../billing/plan-limits';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { OPERATIONAL_FLAGS } from '../feature-flags/feature-flags.registry';
import { OfferPolicy, liveOfferWhere, liveOffers } from '../prices/offer-rules';
import {
  WarrantyKind,
  compareWarranty,
  couponRank,
  couponVisible,
  fitsAmount,
  median,
  offerCaution,
  promoSaving,
  quoteInstallment,
} from './buyer-math';

export interface LiveOffer {
  listingId: string;
  platformId: string;
  store: string;
  price: number;
  rating: number | null;
  reviewCount: number | null;
}

type Access = 'available' | 'locked' | 'hidden';

/**
 * Everything around the price that decides where to buy, for one product:
 * installment plans, card / cashback offers, coupons (Pro), warranty and a
 * caution signal per offer (everyone).
 *
 * A Pro section a free user cannot see comes back as { access: 'locked',
 * count } — the count is the honest teaser ("4 installment plans") without
 * the plans themselves. A switched-off section is 'hidden'.
 */
@Injectable()
export class BuyerExtrasService {
  private readonly offerPolicy: OfferPolicy;

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly flags: FeatureFlagsService,
    config: ConfigService,
  ) {
    this.offerPolicy = { maxAgeDays: config.get<number>('pricing.offerMaxAgeDays', 7) };
  }

  async liveOffers(productId: string): Promise<LiveOffer[]> {
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
        rating: true,
        reviewCount: true,
        platform: { select: { name: true } },
      },
      orderBy: [{ priceUsd: 'asc' }, { id: 'asc' }],
    });
    return liveOffers(candidates, this.offerPolicy)
      .map((offer) => ({
        listingId: offer.id,
        platformId: offer.platformId,
        store: offer.platform.name,
        price: Number(offer.priceUsd),
        rating: offer.rating ?? null,
        reviewCount: offer.reviewCount ?? null,
      }))
      .filter((offer) => offer.price > 0);
  }

  async forProduct(productId: string, userId: string | null, now = new Date()) {
    const product = await this.prisma.canonicalProduct.findUnique({ where: { id: productId }, select: { id: true, brand: true } });
    if (!product) throw new NotFoundException('Product not found');

    const offers = await this.liveOffers(productId);
    const access = await this.accessFor(userId, [FEATURES.INSTALLMENT_COMPARISON, FEATURES.CARD_OFFERS, FEATURES.VERIFIED_COUPONS]);
    const platformIds = [...new Set(offers.map((o) => o.platformId))];

    const [installments, promos, warranty, warrantyOn, cautionOn] = await Promise.all([
      this.installments(offers, now),
      this.promos(offers, platformIds, userId, now),
      this.warranty(offers, product.brand),
      this.flags.isEnabled(OPERATIONAL_FLAGS.WARRANTY_INFO),
      this.flags.isEnabled(OPERATIONAL_FLAGS.SELLER_CAUTION),
    ]);

    return {
      currency: 'EGP',
      installments: this.gate(access[FEATURES.INSTALLMENT_COMPARISON], installments),
      cardOffers: this.gate(access[FEATURES.CARD_OFFERS], promos.cards, { banksSet: promos.banksSet }),
      coupons: this.gate(access[FEATURES.VERIFIED_COUPONS], promos.coupons),
      warranty: warrantyOn ? warranty : null,
      caution: cautionOn ? this.caution(offers) : [],
    };
  }

  private gate<T>(access: Access, items: T[], extra: Record<string, unknown> = {}) {
    if (access === 'hidden') return { access, count: 0, items: [] as T[] };
    if (access === 'locked') return { access, count: items.length, items: [] as T[] };
    return { access, count: items.length, items, ...extra };
  }

  private async accessFor(userId: string | null, features: FeatureKey[]): Promise<Record<string, Access>> {
    const limits = userId ? (await this.entitlements.getEntitlements(userId)).limits : null;
    const result: Record<string, Access> = {};
    for (const feature of features) {
      if (!(await this.flags.isEnabled(feature))) result[feature] = 'hidden';
      else result[feature] = limits?.features.includes(feature) ? 'available' : 'locked';
    }
    return result;
  }

  /** Each plan against the cheapest offer at a store it works at. Cheapest total first. */
  private async installments(offers: LiveOffer[], now: Date) {
    if (offers.length === 0) return [];
    const plans = await this.prisma.installmentPlan.findMany({
      where: { isActive: true, OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
    });
    const quotes = [];
    for (const plan of plans) {
      const offer = offers.find((o) => plan.platformIds.length === 0 || plan.platformIds.includes(o.platformId));
      if (!offer) continue;
      const min = plan.minAmount === null ? null : Number(plan.minAmount);
      const max = plan.maxAmount === null ? null : Number(plan.maxAmount);
      if (!fitsAmount(offer.price, min, max)) continue;
      quotes.push({
        planId: plan.id,
        provider: plan.provider,
        kind: plan.kind,
        months: plan.months,
        store: offer.store,
        price: offer.price,
        ...quoteInstallment(offer.price, {
          months: plan.months,
          markupPct: plan.markupPct,
          adminFeePct: plan.adminFeePct,
          adminFeeFlat: Number(plan.adminFeeFlat),
          downPaymentPct: plan.downPaymentPct,
        }),
        validUntil: plan.validUntil?.toISOString() ?? null,
        sourceUrl: plan.sourceUrl,
      });
    }
    return quotes.sort((a, b) => a.totalPaid - b.totalPaid || a.monthly - b.monthly);
  }

  private async promos(offers: LiveOffer[], platformIds: string[], userId: string | null, now: Date) {
    const [promos, banks] = await Promise.all([
      this.prisma.promo.findMany({
        where: {
          isActive: true,
          AND: [
            { OR: [{ platformId: null }, { platformId: { in: platformIds } }] },
            { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
            { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
          ],
        },
        include: {
          platform: { select: { name: true } },
          reports: { where: { worked: true }, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
        },
      }),
      userId ? this.prisma.userBank.findMany({ where: { userId }, select: { bankName: true } }) : Promise.resolve([]),
    ]);
    const myBanks = new Set(banks.map((b) => b.bankName.toLowerCase()));

    const cheapestAt = (platformId: string | null) =>
      platformId === null ? offers[0] : offers.find((offer) => offer.platformId === platformId);

    const shape = (promo: (typeof promos)[number]) => {
      const offer = cheapestAt(promo.platformId);
      const saving = offer
        ? promoSaving(offer.price, {
            valueType: promo.valueType,
            value: promo.value,
            maxDiscount: promo.maxDiscount === null ? null : Number(promo.maxDiscount),
            minSpend: promo.minSpend === null ? null : Number(promo.minSpend),
          })
        : 0;
      return {
        id: promo.id,
        type: promo.type,
        title: promo.title,
        titleAr: promo.titleAr,
        store: promo.platform?.name ?? null,
        bankName: promo.bankName,
        code: promo.code,
        valueType: promo.valueType,
        value: promo.value,
        minSpend: promo.minSpend === null ? null : Number(promo.minSpend),
        validUntil: promo.validUntil?.toISOString() ?? null,
        verified: promo.verified,
        lastVerifiedAt: promo.lastVerifiedAt?.toISOString() ?? null,
        workedCount: promo.workedCount,
        failedCount: promo.failedCount,
        price: offer?.price ?? null,
        saving,
        priceAfter: offer ? Math.round((offer.price - saving) * 100) / 100 : null,
        mine: promo.bankName ? myBanks.has(promo.bankName.toLowerCase()) : false,
      };
    };

    const cards = promos
      .filter((p) => p.type !== PromoType.COUPON)
      .map(shape)
      .sort((a, b) => Number(b.mine) - Number(a.mine) || b.saving - a.saving);

    const coupons = promos
      .filter((p) => p.type === PromoType.COUPON && p.code)
      .filter((p) =>
        couponVisible(
          {
            verified: p.verified,
            lastVerifiedAt: p.lastVerifiedAt,
            workedCount: p.workedCount,
            failedCount: p.failedCount,
            lastWorkedReportAt: p.reports[0]?.createdAt ?? null,
          },
          now,
        ),
      )
      .sort(
        (a, b) =>
          couponRank({ ...b, lastWorkedReportAt: null }) - couponRank({ ...a, lastWorkedReportAt: null }),
      )
      .map(shape);

    return { cards, coupons, banksSet: myBanks.size > 0 };
  }

  /**
   * Warranty per offer from the admin's rules (store + brand, else the
   * store's default). When the cheapest offer's warranty is weaker than
   * another offer's, say so: a lower price can be paid back in a repair.
   */
  private async warranty(offers: LiveOffer[], brand: string | null) {
    if (offers.length === 0) return { offers: [], cheapestIsWeaker: null };
    const rules = await this.prisma.warrantyRule.findMany({ where: { platformId: { in: offers.map((o) => o.platformId) } } });
    const key = brand?.toLowerCase().trim() ?? null;
    const rows = offers.map((offer) => {
      const rule =
        (key && rules.find((r) => r.platformId === offer.platformId && r.brand === key)) ||
        rules.find((r) => r.platformId === offer.platformId && r.brand === null) ||
        null;
      return {
        listingId: offer.listingId,
        store: offer.store,
        price: offer.price,
        warranty: rule ? { type: rule.type as WarrantyKind, months: rule.months, agentName: rule.agentName } : null,
      };
    });

    const cheapest = rows[0];
    const stronger = cheapest.warranty
      ? rows.find((row) => row.warranty && compareWarranty(row.warranty, cheapest.warranty!) > 0)
      : null;
    return {
      offers: rows,
      cheapestIsWeaker: stronger
        ? { cheapest: cheapest.store, stronger: stronger.store, extraCost: Math.round((stronger.price - cheapest.price) * 100) / 100 }
        : null,
    };
  }

  private caution(offers: LiveOffer[]) {
    const market = median(offers.map((o) => o.price));
    const stores = new Set(offers.map((o) => o.platformId)).size;
    return offers
      .map((offer) => ({ listingId: offer.listingId, store: offer.store, ...offerCaution(offer, market, stores) }))
      .filter((row) => row.caution);
  }
}
