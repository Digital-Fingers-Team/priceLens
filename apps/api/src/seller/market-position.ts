import { median, percentile, percentileRankOf } from '../intelligence/price-statistics';

/**
 * Where a seller's price sits in the market for one product.
 *
 * Pure and Prisma-free so the boundaries -- especially "not enough comparable
 * data to say anything" -- are directly testable. Every field is null rather
 * than zero when it cannot be computed: a seller acting on a fabricated
 * "market median" would be repricing against noise.
 */

export interface CompetitorPrice {
  platformId: string;
  platformName: string;
  price: number;
  inStock: boolean | null;
  url?: string;
}

export type PositionLabel =
  | 'CHEAPEST'
  | 'BELOW_MARKET'
  | 'AT_MARKET'
  | 'ABOVE_MARKET'
  | 'MOST_EXPENSIVE'
  | 'INSUFFICIENT_DATA';

export interface MarketPosition {
  ourPrice: number | null;
  lowest: number | null;
  highest: number | null;
  marketMedian: number | null;
  marketAverage: number | null;
  /** Share of competitors we are cheaper than, 0-100. */
  percentileRank: number | null;
  /** Our price relative to the median, as a percentage. +4.9 = 4.9% above. */
  vsMedianPct: number | null;
  /** Gap to the cheapest competitor. Negative = we are already cheapest. */
  gapToCheapest: number | null;
  competitorCount: number;
  label: PositionLabel;
  explanation: string;
}

/**
 * Minimum competitors before a "market" median means anything.
 *
 * Two is the floor: a median of one competitor is just that competitor's
 * price, and describing it as "the market" would be misleading.
 */
export const MIN_COMPETITORS_FOR_POSITION = 2;

/** Within this band of the median, a price is "at market" rather than off it. */
export const AT_MARKET_BAND_PCT = 2;

export function computeMarketPosition(
  ourPrice: number | null,
  competitors: CompetitorPrice[],
): MarketPosition {
  const prices = competitors
    .map((competitor) => competitor.price)
    .filter((price) => Number.isFinite(price) && price > 0)
    .sort((a, b) => a - b);

  const base: MarketPosition = {
    ourPrice,
    lowest: prices[0] ?? null,
    highest: prices[prices.length - 1] ?? null,
    marketMedian: median(prices),
    marketAverage: prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : null,
    percentileRank: null,
    vsMedianPct: null,
    gapToCheapest: null,
    competitorCount: prices.length,
    label: 'INSUFFICIENT_DATA',
    explanation: '',
  };

  if (prices.length < MIN_COMPETITORS_FOR_POSITION) {
    return {
      ...base,
      explanation:
        prices.length === 0
          ? 'No other tracked store currently carries this product, so there is no market to compare against.'
          : 'Only one other store carries this product. One competitor is not a market median.',
    };
  }

  if (ourPrice == null || ourPrice <= 0) {
    return {
      ...base,
      label: 'INSUFFICIENT_DATA',
      explanation:
        `We can see ${prices.length} competitor prices, but not yours. ` +
        'Set your price on this product to see where you sit.',
    };
  }

  const marketMedian = base.marketMedian as number;
  const vsMedianPct = ((ourPrice - marketMedian) / marketMedian) * 100;
  const gapToCheapest = ourPrice - (base.lowest as number);
  // Cheaper-than share, so higher is a more aggressive position.
  const rank = 100 - (percentileRankOf(prices, ourPrice) ?? 50);

  let label: PositionLabel;
  if (ourPrice <= (base.lowest as number)) label = 'CHEAPEST';
  else if (ourPrice >= (base.highest as number)) label = 'MOST_EXPENSIVE';
  else if (Math.abs(vsMedianPct) <= AT_MARKET_BAND_PCT) label = 'AT_MARKET';
  else if (vsMedianPct < 0) label = 'BELOW_MARKET';
  else label = 'ABOVE_MARKET';

  const sign = vsMedianPct >= 0 ? '+' : '';
  const explanation =
    label === 'CHEAPEST'
      ? `You are the cheapest of ${prices.length + 1} tracked sellers, ${Math.abs(vsMedianPct).toFixed(1)}% below the market median.`
      : label === 'MOST_EXPENSIVE'
        ? `You are the most expensive of ${prices.length + 1} tracked sellers, ${vsMedianPct.toFixed(1)}% above the market median.`
        : `Your price is ${sign}${vsMedianPct.toFixed(1)}% against a market median of ` +
          `${marketMedian.toFixed(0)} across ${prices.length} competitor(s). ` +
          `You are cheaper than ${Math.round(rank)}% of them.`;

  return {
    ...base,
    percentileRank: rank,
    vsMedianPct,
    gapToCheapest,
    label,
    explanation,
  };
}

// ─── Margin-aware pricing ───────────────────────────────────────────────────

export type RecommendationConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface PricingRecommendation {
  /** Null when we will not make one. */
  recommendedPrice: number | null;
  currentPrice: number | null;
  cost: number | null;
  /** Lowest price that still clears the seller's minimum margin. */
  floorPrice: number | null;
  /** Price that would hit the seller's target margin exactly. */
  targetPrice: number | null;
  /** Margin the recommendation achieves, as a percentage of price. */
  projectedMarginPct: number | null;
  currentMarginPct: number | null;
  confidence: RecommendationConfidence;
  /** Every input that moved the answer, in plain words. */
  rationale: string[];
  /** Said out loud, always. */
  caveat: string;
}

const CAVEAT =
  'This is a suggestion derived from the prices we have observed and the cost and margin you entered. ' +
  'It does not account for your volume, delivery cost, promotions, or what a price change will do to demand, ' +
  'and it is not a guarantee of higher profit.';

function marginPct(price: number, cost: number): number {
  return ((price - cost) / price) * 100;
}

/** Price that yields a given margin on cost. */
function priceForMargin(cost: number, targetMarginPct: number): number {
  // margin = (price - cost) / price  =>  price = cost / (1 - margin)
  const fraction = Math.min(Math.max(targetMarginPct, 0), 95) / 100;
  return cost / (1 - fraction);
}

/**
 * Recommends a price from cost, margin targets and the observed market.
 *
 * Refuses rather than guesses in two cases that matter: without a cost there
 * is no margin to be aware of, and without a real market there is nothing to
 * position against. A recommendation is never returned below the seller's
 * stated minimum margin, even when the market sits there -- that decision is
 * the seller's to make knowingly, not ours to make silently.
 */
export function recommendPrice(input: {
  cost: number | null;
  currentPrice: number | null;
  targetMarginPct: number | null;
  minMarginPct: number | null;
  position: MarketPosition;
}): PricingRecommendation {
  const { cost, currentPrice, position } = input;
  const rationale: string[] = [];

  const currentMarginPct =
    cost != null && currentPrice != null && currentPrice > 0 ? marginPct(currentPrice, cost) : null;

  const base: PricingRecommendation = {
    recommendedPrice: null,
    currentPrice,
    cost,
    floorPrice: null,
    targetPrice: null,
    projectedMarginPct: null,
    currentMarginPct,
    confidence: 'NONE',
    rationale,
    caveat: CAVEAT,
  };

  if (cost == null || cost <= 0) {
    rationale.push('Enter your unit cost for this product to get a margin-aware recommendation.');
    return base;
  }

  const minMargin = input.minMarginPct ?? 0;
  const targetMargin = input.targetMarginPct ?? Math.max(minMargin, 15);

  const floorPrice = priceForMargin(cost, minMargin);
  const targetPrice = priceForMargin(cost, targetMargin);

  base.floorPrice = floorPrice;
  base.targetPrice = targetPrice;

  if (position.competitorCount < MIN_COMPETITORS_FOR_POSITION || position.marketMedian == null) {
    rationale.push(
      `Not enough competitor prices to position against — ${position.competitorCount} tracked.`,
      `On your numbers alone, ${targetPrice.toFixed(0)} would hit your ${targetMargin.toFixed(0)}% target margin.`,
    );
    return {
      ...base,
      recommendedPrice: Math.round(targetPrice),
      projectedMarginPct: marginPct(targetPrice, cost),
      confidence: 'LOW',
    };
  }

  const cheapest = position.lowest as number;
  const marketMedian = position.marketMedian as number;

  // Sit just under the cheapest competitor when that is affordable, otherwise
  // as close to the market as the seller's floor permits. Undercutting by a
  // token amount is what actually wins the buy box without starting a race to
  // the bottom.
  const undercut = cheapest * 0.995;
  let recommended: number;

  if (undercut >= targetPrice) {
    recommended = undercut;
    rationale.push(
      `The cheapest competitor is ${cheapest.toFixed(0)}. Pricing just under it still clears your ` +
        `${targetMargin.toFixed(0)}% target margin.`,
    );
  } else if (undercut >= floorPrice) {
    recommended = undercut;
    rationale.push(
      `Undercutting the cheapest competitor (${cheapest.toFixed(0)}) drops you to ` +
        `${marginPct(undercut, cost).toFixed(1)}% margin — below your ${targetMargin.toFixed(0)}% target, ` +
        `but still above your ${minMargin.toFixed(0)}% floor.`,
    );
  } else {
    // The market is below what this seller can profitably match. Say so
    // plainly rather than recommending a loss.
    recommended = floorPrice;
    rationale.push(
      `The cheapest competitor is ${cheapest.toFixed(0)}, which is below your minimum profitable price of ` +
        `${floorPrice.toFixed(0)}. Matching it would breach your ${minMargin.toFixed(0)}% floor.`,
      'Holding at your floor keeps the sale profitable; competing on price here would not be.',
    );
  }

  rationale.push(`Market median is ${marketMedian.toFixed(0)} across ${position.competitorCount} competitor(s).`);

  if (currentPrice != null) {
    const delta = recommended - currentPrice;
    rationale.push(
      Math.abs(delta) < 1
        ? 'This is effectively your current price — no change indicated.'
        : delta < 0
          ? `That is ${Math.abs(delta).toFixed(0)} below your current ${currentPrice.toFixed(0)}.`
          : `That is ${delta.toFixed(0)} above your current ${currentPrice.toFixed(0)}.`,
    );
  }

  // Confidence reflects how much of the market we can actually see.
  const confidence: RecommendationConfidence =
    position.competitorCount >= 5 ? 'HIGH' : position.competitorCount >= 3 ? 'MEDIUM' : 'LOW';

  return {
    ...base,
    recommendedPrice: Math.round(recommended),
    projectedMarginPct: marginPct(recommended, cost),
    confidence,
    rationale,
  };
}

export { percentile };
