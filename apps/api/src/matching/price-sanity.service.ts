// apps/api/src/matching/price-sanity.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import Decimal from 'decimal.js';

// Expected price range multipliers by product tier
const TIER_RANGE: Record<string, { minMultiplier: number; maxMultiplier: number }> = {
  BUDGET:        { minMultiplier: 0.4, maxMultiplier: 2.5 },
  MID_RANGE:     { minMultiplier: 0.4, maxMultiplier: 2.0 },
  PREMIUM:       { minMultiplier: 0.5, maxMultiplier: 1.8 },
  ULTRA_PREMIUM: { minMultiplier: 0.6, maxMultiplier: 1.5 },
};

@Injectable()
export class PriceSanityService {
  private readonly logger = new Logger(PriceSanityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Step 8: Price sanity check.
   * 
   * Scores how reasonable the price is for this canonical product.
   * A GPU listed for $5 is almost certainly wrong; a laptop listed for $50,000 is also wrong.
   * 
   * Returns a score in [0, 1]:
   * - 1.0 = price is perfectly within expected range
   * - 0.5 = borderline (could be legitimate sale or markup)
   * - 0.0 = price is absurdly outside expected range
   * 
   * Also returns flags if the price is suspicious.
   */
  async checkPriceSanity(
    sourcePrice: number | null | undefined,
    canonicalProductId: string,
    productTier: string,
  ): Promise<{ score: number; flags: string[] }> {
    if (!sourcePrice || sourcePrice <= 0) {
      return { score: 0.3, flags: ['missing_price'] };
    }

    const flags: string[] = [];

    // Get median price from recent history
    const recentPrices = await this.prisma.priceHistory.findMany({
      where: {
        canonicalProductId,
        recordedAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }, // 90 days
      },
      select: { priceUsd: true },
      orderBy: { recordedAt: 'desc' },
      take: 50,
    });

    if (recentPrices.length < 3) {
      // Not enough history — can't sanity check effectively
      return { score: 0.7, flags: ['insufficient_price_history'] };
    }

    const prices = recentPrices
      .map((p) => Number(p.priceUsd))
      .sort((a, b) => a - b);

    const median = this.median(prices);
    const p10 = prices[Math.floor(prices.length * 0.1)];
    const p90 = prices[Math.floor(prices.length * 0.9)];

    const tierRange = TIER_RANGE[productTier] ?? TIER_RANGE.MID_RANGE;

    const minExpected = median * tierRange.minMultiplier;
    const maxExpected = median * tierRange.maxMultiplier;

    // Hard limits: a product cannot reasonably be >5x or <0.1x the median
    if (sourcePrice < median * 0.1) {
      flags.push('price_suspiciously_low');
      return { score: 0.0, flags };
    }

    if (sourcePrice > median * 5) {
      flags.push('price_suspiciously_high');
      return { score: 0.0, flags };
    }

    // Soft limits
    if (sourcePrice < minExpected) {
      flags.push('price_below_expected_range');
    }
    if (sourcePrice > maxExpected) {
      flags.push('price_above_expected_range');
    }

    // Score based on proximity to median
    const deviation = Math.abs(sourcePrice - median) / median;
    let score: number;

    if (deviation <= 0.1) {
      score = 1.0;  // Within 10% of median — perfect
    } else if (deviation <= 0.2) {
      score = 0.9;
    } else if (deviation <= 0.4) {
      score = 0.8;
    } else if (deviation <= 0.7) {
      score = 0.65;
    } else {
      score = 0.4;
    }

    return { score, flags };
  }

  /**
   * Get current price stats for a canonical product.
   */
  async getPriceStats(canonicalProductId: string): Promise<{
    min: number | null;
    max: number | null;
    avg: number | null;
    median: number | null;
    current: number | null;
    currency: string;
  }> {
    // Current prices from active listings
    const activeListings = await this.prisma.sourceListing.findMany({
      where: {
        canonicalProductId,
        matchStatus: { in: ['ACCEPTED', 'MANUAL_ACCEPT'] },
        priceUsd: { not: null },
      },
      select: { priceUsd: true },
    });

    if (activeListings.length === 0) {
      return { min: null, max: null, avg: null, median: null, current: null, currency: 'USD' };
    }

    const prices = activeListings
      .map((l) => Number(l.priceUsd))
      .sort((a, b) => a - b);

    return {
      min: prices[0],
      max: prices[prices.length - 1],
      avg: prices.reduce((a, b) => a + b, 0) / prices.length,
      median: this.median(prices),
      current: prices[0], // current best price
      currency: 'USD',
    };
  }

  private median(sorted: number[]): number {
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }
}