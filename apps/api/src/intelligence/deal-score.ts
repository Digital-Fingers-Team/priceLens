import { DailyPricePoint, HistoryStats, percentileRankOf } from './price-statistics';

/**
 * The PriceLens Deal Score.
 *
 * Design rules, in priority order:
 *   1. A signal we cannot measure is *omitted*, never defaulted to a neutral
 *      50. Defaulting would let a product with no history score the same as
 *      one we genuinely know is a good deal.
 *   2. Weights of omitted signals are redistributed across the signals that
 *      did resolve, so the score stays on a 0-100 scale and stays comparable.
 *   3. The breakdown is returned with the score. A number the user cannot
 *      interrogate is not intelligence, it is decoration.
 *   4. Below MIN_SIGNAL_WEIGHT of resolvable weight, we return null instead of
 *      a score. "Insufficient data" is a valid output.
 */

export interface DealSignal {
  key: string;
  label: string;
  /** Nominal weight before redistribution. */
  weight: number;
  /** 0-100, higher is a better deal. Null when not measurable. */
  score: number | null;
  /** Human-readable measured value, e.g. "12% below the 90-day average". */
  detail: string;
  available: boolean;
}

export interface DealScoreResult {
  /** 0-100, or null when too little resolved to be meaningful. */
  score: number | null;
  grade: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | null;
  /** Share of the nominal weight that actually resolved, 0-1. */
  coverage: number;
  signals: DealSignal[];
  methodology: string;
}

/** Below this share of resolvable weight, no score is published. */
export const MIN_SIGNAL_COVERAGE = 0.5;

const WEIGHTS = {
  historicalPosition: 35,
  marketPosition: 25,
  discountDepth: 15,
  availability: 10,
  storeCoverage: 10,
  priceStability: 5,
} as const;

export interface DealScoreInput {
  currentPrice: number | null;
  /** Daily minimums over the analysis window. */
  points: DailyPricePoint[];
  stats: HistoryStats | null;
  /** Prices from every store carrying this product right now. */
  competitorPrices: number[];
  inStock: boolean | null;
  /** Number of distinct stores we have a live price from. */
  storeCount: number;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function computeDealScore(input: DealScoreInput): DealScoreResult {
  const signals: DealSignal[] = [];
  const { currentPrice, points, stats, competitorPrices, inStock, storeCount } = input;

  // ── 1. Position within its own price history ──────────────────────────
  // The strongest signal: this product's own past is the fairest yardstick.
  if (currentPrice != null && stats && points.length >= 5) {
    const rank = percentileRankOf(points.map((p) => p.min), currentPrice) ?? 50;
    signals.push({
      key: 'historicalPosition',
      label: 'Price vs its own history',
      weight: WEIGHTS.historicalPosition,
      // A low percentile rank (cheap relative to history) is a high score.
      score: clamp(100 - rank),
      detail: `Cheaper than ${Math.round(100 - rank)}% of the ${stats.dayCount} days recorded.`,
      available: true,
    });
  } else {
    signals.push({
      key: 'historicalPosition',
      label: 'Price vs its own history',
      weight: WEIGHTS.historicalPosition,
      score: null,
      detail: 'Not enough recorded price history yet.',
      available: false,
    });
  }

  // ── 2. Position against the other stores selling it today ─────────────
  if (currentPrice != null && competitorPrices.length >= 2) {
    const others = [...competitorPrices].sort((a, b) => a - b);
    const cheapest = others[0];
    const dearest = others[others.length - 1];
    const spread = dearest - cheapest;

    // With no spread every store charges the same; that is not a bargain, so
    // it scores neutral rather than perfect.
    const score = spread > 0 ? clamp(((dearest - currentPrice) / spread) * 100) : 50;
    const rank = percentileRankOf(others, currentPrice) ?? 50;

    signals.push({
      key: 'marketPosition',
      label: 'Price vs other stores',
      weight: WEIGHTS.marketPosition,
      score,
      detail:
        spread > 0
          ? `Cheaper than ${Math.round(100 - rank)}% of the ${others.length} stores carrying it.`
          : `All ${others.length} stores are at the same price.`,
      available: true,
    });
  } else {
    signals.push({
      key: 'marketPosition',
      label: 'Price vs other stores',
      weight: WEIGHTS.marketPosition,
      score: null,
      detail: 'Only one store currently carries this product.',
      available: false,
    });
  }

  // ── 3. Depth of the drop against its own typical price ────────────────
  if (currentPrice != null && stats && stats.median > 0 && points.length >= 5) {
    const dropPct = ((stats.median - currentPrice) / stats.median) * 100;
    // 0% off -> 0; 30% off -> 100. Beyond 30% is capped: a deeper cut is
    // usually a data error or a clearance of something faulty, and should not
    // dominate the score.
    signals.push({
      key: 'discountDepth',
      label: 'Discount vs typical price',
      weight: WEIGHTS.discountDepth,
      score: clamp((dropPct / 30) * 100),
      detail:
        dropPct >= 0
          ? `${dropPct.toFixed(1)}% below its typical ${stats.median.toFixed(0)}.`
          : `${Math.abs(dropPct).toFixed(1)}% above its typical ${stats.median.toFixed(0)}.`,
      available: true,
    });
  } else {
    signals.push({
      key: 'discountDepth',
      label: 'Discount vs typical price',
      weight: WEIGHTS.discountDepth,
      score: null,
      detail: 'Not enough history to know its typical price.',
      available: false,
    });
  }

  // ── 4. Can you actually buy it ────────────────────────────────────────
  // Unknown stock is genuinely unknown: most scraped listings do not state
  // it, and guessing "in stock" would inflate scores across the catalogue.
  if (inStock === null) {
    signals.push({
      key: 'availability',
      label: 'Availability',
      weight: WEIGHTS.availability,
      score: null,
      detail: 'Stock status is not published by this store.',
      available: false,
    });
  } else {
    signals.push({
      key: 'availability',
      label: 'Availability',
      weight: WEIGHTS.availability,
      score: inStock ? 100 : 0,
      detail: inStock ? 'In stock at the best-priced store.' : 'Out of stock at the best-priced store.',
      available: true,
    });
  }

  // ── 5. How much of the market we can actually see ─────────────────────
  // A "best price" drawn from one store is a weaker claim than one drawn
  // from six. This keeps the score honest about our own coverage.
  signals.push({
    key: 'storeCoverage',
    label: 'Market coverage',
    weight: WEIGHTS.storeCoverage,
    score: clamp((Math.min(storeCount, 6) / 6) * 100),
    detail: `${storeCount} store(s) tracked for this product.`,
    available: true,
  });

  // ── 6. Stability ──────────────────────────────────────────────────────
  if (stats && points.length >= 10) {
    // 0% volatility -> 100; 30%+ -> 0. A stable price you catch low is a
    // more dependable deal than a lucky reading on a thrashing one.
    signals.push({
      key: 'priceStability',
      label: 'Price stability',
      weight: WEIGHTS.priceStability,
      score: clamp(100 - (stats.volatility / 0.3) * 100),
      detail: `Price varies by about ${(stats.volatility * 100).toFixed(1)}% around its average.`,
      available: true,
    });
  } else {
    signals.push({
      key: 'priceStability',
      label: 'Price stability',
      weight: WEIGHTS.priceStability,
      score: null,
      detail: 'Not enough history to measure stability.',
      available: false,
    });
  }

  const totalWeight = signals.reduce((sum, signal) => sum + signal.weight, 0);
  const resolved = signals.filter((signal) => signal.available && signal.score != null);
  const resolvedWeight = resolved.reduce((sum, signal) => sum + signal.weight, 0);
  const coverage = totalWeight > 0 ? resolvedWeight / totalWeight : 0;

  const methodology =
    'Weighted from the price against its own recorded history (35), against other stores (25), ' +
    'the depth of the discount (15), availability (10), how many stores we track (10) and price ' +
    'stability (5). Signals we cannot measure are excluded and their weight is redistributed, ' +
    'never guessed.';

  if (coverage < MIN_SIGNAL_COVERAGE || resolvedWeight === 0) {
    return { score: null, grade: null, coverage, signals, methodology };
  }

  const weighted = resolved.reduce((sum, signal) => sum + (signal.score as number) * signal.weight, 0);
  const score = Math.round(weighted / resolvedWeight);

  const grade =
    score >= 80 ? 'EXCELLENT' : score >= 60 ? 'GOOD' : score >= 40 ? 'FAIR' : 'POOR';

  return { score, grade, coverage, signals, methodology };
}
