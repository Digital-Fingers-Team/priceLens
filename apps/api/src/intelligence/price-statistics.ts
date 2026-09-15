/**
 * Pure statistics helpers for price intelligence.
 *
 * Kept free of Nest and Prisma so the numeric behaviour — especially the
 * "not enough data" boundaries — can be unit-tested directly. Every function
 * here returns null rather than a guessed value when the input cannot support
 * an answer; fabricating a number is the one failure mode this product cannot
 * afford.
 */

export interface DailyPricePoint {
  /** YYYY-MM-DD */
  date: string;
  /** Cheapest observed price that day. */
  min: number;
  max: number;
  avg: number;
  /** Observations that day. */
  count: number;
  /** Whether any listing was in stock that day. */
  inStock: boolean;
}

export interface HistoryStats {
  low: number;
  high: number;
  average: number;
  median: number;
  /** Sample standard deviation of the daily minimums. */
  stdDev: number;
  /** stdDev / average — comparable across products of different prices. */
  volatility: number;
  /** Distinct days with at least one observation. */
  dayCount: number;
  /** Calendar days between the first and last observation. */
  spanDays: number;
  firstDate: string;
  lastDate: string;
}

/** One recorded price change, as stored. */
export interface PriceChangePoint {
  sourceListingId: string;
  /** Start of the day the price was recorded, as YYYY-MM-DD. */
  date: string;
  price: number;
  inStock: boolean;
}

/**
 * Expands change-only price history into a real daily series.
 *
 * PriceHistory only gets a row when a listing's price actually *changes*
 * (see LiveIngestionService.appendPriceHistory) — a sensible storage choice,
 * but it makes the raw rows useless as a statistical sample: a product that
 * sat at 20,000 for sixty days has a single row, so counting rows would call
 * that "one day of history" and weight it the same as a price that bounced
 * daily. Percentiles computed over change events answer "how do the changes
 * rank", when the question is "how did the price rank over time".
 *
 * So each listing's last known price is carried forward day by day, and the
 * daily figure is the cheapest across listings — the price a shopper would
 * actually have paid that day. Nothing is invented: the fill never starts
 * before the first price we recorded for a listing, and a listing that did
 * not exist yet simply does not contribute to that day.
 */
export function forwardFillDailySeries(
  changes: PriceChangePoint[],
  options: { from: string; to: string },
): DailyPricePoint[] {
  if (changes.length === 0) return [];

  const byListing = new Map<string, PriceChangePoint[]>();
  for (const change of changes) {
    const bucket = byListing.get(change.sourceListingId);
    if (bucket) bucket.push(change);
    else byListing.set(change.sourceListingId, [change]);
  }
  for (const bucket of byListing.values()) {
    bucket.sort((a, b) => a.date.localeCompare(b.date));
  }

  const startMs = Date.parse(`${options.from}T00:00:00Z`);
  const endMs = Date.parse(`${options.to}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return [];

  // A guard against an absurd range producing an unbounded loop.
  const MAX_DAYS = 2000;
  const series: DailyPricePoint[] = [];

  // Cursor per listing, so the whole expansion is a single linear pass rather
  // than a scan of every change on every day.
  const cursors = new Map<string, { index: number; price: number | null; inStock: boolean }>();
  for (const listingId of byListing.keys()) {
    cursors.set(listingId, { index: 0, price: null, inStock: true });
  }

  for (let dayMs = startMs, guard = 0; dayMs <= endMs && guard < MAX_DAYS; dayMs += 86_400_000, guard += 1) {
    const date = new Date(dayMs).toISOString().slice(0, 10);
    const prices: number[] = [];
    let anyInStock = false;
    let sawStockSignal = false;

    for (const [listingId, bucket] of byListing) {
      const cursor = cursors.get(listingId)!;

      // Advance through every change recorded on or before this day.
      while (cursor.index < bucket.length && bucket[cursor.index].date <= date) {
        cursor.price = bucket[cursor.index].price;
        cursor.inStock = bucket[cursor.index].inStock;
        cursor.index += 1;
      }

      // Null means this listing had not been seen yet on this day; it must
      // not contribute, rather than contributing a guessed price.
      if (cursor.price == null) continue;

      prices.push(cursor.price);
      sawStockSignal = true;
      if (cursor.inStock) anyInStock = true;
    }

    if (prices.length === 0) continue;

    const min = Math.min(...prices);
    const max = Math.max(...prices);
    series.push({
      date,
      min,
      max,
      avg: prices.reduce((sum, value) => sum + value, 0) / prices.length,
      count: prices.length,
      inStock: sawStockSignal ? anyInStock : true,
    });
  }

  return series;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Linear-interpolated percentile (the "inclusive" definition, matching
 * PERCENTILE_CONT). `p` is 0..100.
 */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];

  const sorted = [...values].sort((a, b) => a - b);
  const rank = (Math.min(Math.max(p, 0), 100) / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (rank - lower) * (sorted[upper] - sorted[lower]);
}

/**
 * Where `value` sits within `values`, as a percentage.
 *
 * 0 means nothing observed was cheaper; 100 means everything was. Ties count
 * as half, so a price equal to every observation scores 50 rather than 0 or
 * 100 — a flat-priced product is neither a bargain nor a rip-off.
 */
export function percentileRankOf(values: number[], value: number): number | null {
  if (values.length === 0) return null;
  let below = 0;
  let equal = 0;
  for (const entry of values) {
    if (entry < value) below += 1;
    else if (entry === value) equal += 1;
  }
  return ((below + equal / 2) / values.length) * 100;
}

export function computeHistoryStats(points: DailyPricePoint[]): HistoryStats | null {
  if (points.length === 0) return null;

  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const mins = sorted.map((point) => point.min);

  const average = mins.reduce((sum, value) => sum + value, 0) / mins.length;
  const variance =
    mins.length > 1
      ? mins.reduce((sum, value) => sum + (value - average) ** 2, 0) / (mins.length - 1)
      : 0;
  const stdDev = Math.sqrt(variance);

  const firstDate = sorted[0].date;
  const lastDate = sorted[sorted.length - 1].date;
  const spanDays = Math.round(
    (Date.parse(`${lastDate}T00:00:00Z`) - Date.parse(`${firstDate}T00:00:00Z`)) / 86_400_000,
  );

  return {
    low: Math.min(...mins),
    high: Math.max(...mins),
    average,
    median: median(mins) ?? average,
    stdDev,
    // A zero average would be a data bug, but dividing by it would produce
    // Infinity and poison every downstream score.
    volatility: average > 0 ? stdDev / average : 0,
    dayCount: sorted.length,
    spanDays,
    firstDate,
    lastDate,
  };
}

/**
 * Minimum evidence before PriceLens is willing to say "buy" or "wait".
 *
 * These thresholds are the product's honesty boundary. A verdict from three
 * days of data would be noise dressed as advice, so below this the answer is
 * "we don't know yet" — which is a legitimate, and more trustworthy, answer.
 */
export const MIN_DAYS_FOR_VERDICT = 10;
export const MIN_SPAN_DAYS_FOR_VERDICT = 14;

export type VerdictCode = 'GOOD_TIME_TO_BUY' | 'FAIR_PRICE' | 'WAIT' | 'INSUFFICIENT_DATA';
export type ConfidenceCode = 'HIGH' | 'MEDIUM' | 'LOW';

export interface BuyVerdict {
  verdict: VerdictCode;
  confidence: ConfidenceCode | null;
  /** Percentage of observed history at or above the current price. */
  percentile: number | null;
  /** Saving vs the period average, as a percentage. Negative = above average. */
  vsAverage: number | null;
  /** How far above the period low, as a percentage. 0 = at the low. */
  aboveLow: number | null;
  /** Machine-readable reasons; the UI renders these as bullet points. */
  reasons: string[];
  /** Populated only for INSUFFICIENT_DATA. */
  missing?: { dayCount: number; spanDays: number; needDays: number; needSpanDays: number };
}

/**
 * The Buy/Wait call.
 *
 * Deliberately conservative: "WAIT" is only said when the current price is
 * genuinely high within its own observed range, and the default in the murky
 * middle is FAIR_PRICE rather than a coin-flip.
 */
export function computeBuyVerdict(
  currentPrice: number | null,
  points: DailyPricePoint[],
  stats: HistoryStats | null,
): BuyVerdict {
  if (currentPrice == null || !stats || points.length === 0) {
    return {
      verdict: 'INSUFFICIENT_DATA',
      confidence: null,
      percentile: null,
      vsAverage: null,
      aboveLow: null,
      reasons: ['We have not recorded enough price history for this product yet.'],
      missing: {
        dayCount: stats?.dayCount ?? 0,
        spanDays: stats?.spanDays ?? 0,
        needDays: MIN_DAYS_FOR_VERDICT,
        needSpanDays: MIN_SPAN_DAYS_FOR_VERDICT,
      },
    };
  }

  if (stats.dayCount < MIN_DAYS_FOR_VERDICT || stats.spanDays < MIN_SPAN_DAYS_FOR_VERDICT) {
    return {
      verdict: 'INSUFFICIENT_DATA',
      confidence: null,
      percentile: null,
      vsAverage: null,
      aboveLow: null,
      reasons: [
        `Only ${stats.dayCount} day(s) of price history over ${stats.spanDays} day(s). ` +
          `A verdict needs at least ${MIN_DAYS_FOR_VERDICT} days spanning ${MIN_SPAN_DAYS_FOR_VERDICT} days.`,
      ],
      missing: {
        dayCount: stats.dayCount,
        spanDays: stats.spanDays,
        needDays: MIN_DAYS_FOR_VERDICT,
        needSpanDays: MIN_SPAN_DAYS_FOR_VERDICT,
      },
    };
  }

  const mins = points.map((point) => point.min);
  const rank = percentileRankOf(mins, currentPrice) ?? 50;
  const vsAverage = stats.average > 0 ? ((stats.average - currentPrice) / stats.average) * 100 : 0;
  const aboveLow = stats.low > 0 ? ((currentPrice - stats.low) / stats.low) * 100 : 0;

  const reasons: string[] = [];
  let verdict: VerdictCode;

  if (rank <= 25) {
    verdict = 'GOOD_TIME_TO_BUY';
    reasons.push(`Cheaper than ${Math.round(100 - rank)}% of the last ${stats.dayCount} days we recorded.`);
    if (aboveLow <= 2) reasons.push('Effectively at its lowest recorded price.');
    else reasons.push(`Within ${aboveLow.toFixed(1)}% of its lowest recorded price.`);
  } else if (rank >= 70) {
    verdict = 'WAIT';
    reasons.push(`More expensive than ${Math.round(rank)}% of the last ${stats.dayCount} days we recorded.`);
    reasons.push(`It has been as low as ${stats.low.toFixed(0)} in this period.`);
  } else {
    verdict = 'FAIR_PRICE';
    reasons.push(`Around its typical price for the last ${stats.dayCount} days we recorded.`);
    if (aboveLow > 5) reasons.push(`${aboveLow.toFixed(1)}% above its recorded low of ${stats.low.toFixed(0)}.`);
  }

  if (vsAverage > 0) reasons.push(`${vsAverage.toFixed(1)}% below the period average.`);
  else if (vsAverage < 0) reasons.push(`${Math.abs(vsAverage).toFixed(1)}% above the period average.`);

  // A wildly volatile price makes any single reading less meaningful; say so
  // rather than quietly presenting a confident-looking verdict.
  let confidence: ConfidenceCode;
  if (stats.dayCount >= 45 && stats.volatility < 0.12) confidence = 'HIGH';
  else if (stats.dayCount >= 21 && stats.volatility < 0.25) confidence = 'MEDIUM';
  else confidence = 'LOW';

  if (confidence === 'LOW' && stats.volatility >= 0.25) {
    reasons.push('This price moves a lot, so treat the verdict as a weak signal.');
  }

  return { verdict, confidence, percentile: rank, vsAverage, aboveLow, reasons };
}

// ─── Fake / misleading discount detection ──────────────────────────────────

export type DiscountVerdict = 'GENUINE' | 'SUSPICIOUS' | 'UNVERIFIABLE' | 'NO_DISCOUNT_CLAIMED';

export interface DiscountCheck {
  verdict: DiscountVerdict;
  /** The struck-through "was" price the store advertises. */
  advertisedWas: number | null;
  currentPrice: number | null;
  /** Discount the store claims, as a percentage. */
  claimedDiscountPct: number | null;
  /** Discount against what we actually observed it selling for. */
  realDiscountPct: number | null;
  /** The price we actually observed most of the time before this. */
  observedTypicalPrice: number | null;
  explanation: string;
}

/** How far above observed reality a "was" price may sit before we call it out. */
export const FAKE_DISCOUNT_TOLERANCE_PCT = 8;

/**
 * Checks an advertised discount against what the product actually cost.
 *
 * The test is against the *high end* of observed history (the 90th percentile
 * of daily minimums), not the median — a genuine sale really does follow a
 * period at the higher price, and comparing to the median would flag honest
 * promotions. UNVERIFIABLE is returned freely: accusing a retailer of a fake
 * discount on thin data would be both wrong and legally unwise.
 */
export function detectMisleadingDiscount(
  currentPrice: number | null,
  advertisedWas: number | null,
  points: DailyPricePoint[],
  stats: HistoryStats | null,
): DiscountCheck {
  if (advertisedWas == null || currentPrice == null || advertisedWas <= currentPrice) {
    return {
      verdict: 'NO_DISCOUNT_CLAIMED',
      advertisedWas,
      currentPrice,
      claimedDiscountPct: null,
      realDiscountPct: null,
      observedTypicalPrice: null,
      explanation: 'No discount is being advertised against a higher previous price.',
    };
  }

  const claimedDiscountPct = ((advertisedWas - currentPrice) / advertisedWas) * 100;

  if (!stats || stats.dayCount < MIN_DAYS_FOR_VERDICT) {
    return {
      verdict: 'UNVERIFIABLE',
      advertisedWas,
      currentPrice,
      claimedDiscountPct,
      realDiscountPct: null,
      observedTypicalPrice: null,
      explanation:
        `We have only ${stats?.dayCount ?? 0} day(s) of recorded history for this product, ` +
        'which is not enough to check whether this discount is real.',
    };
  }

  const mins = points.map((point) => point.min);
  const upperTypical = percentile(mins, 90) ?? stats.high;
  const typical = stats.median;
  const realDiscountPct = typical > 0 ? ((typical - currentPrice) / typical) * 100 : 0;

  // Was the product ever actually sold near the advertised "was" price?
  const advertisedExceedsObserved = ((advertisedWas - upperTypical) / upperTypical) * 100;

  if (advertisedExceedsObserved > FAKE_DISCOUNT_TOLERANCE_PCT) {
    return {
      verdict: 'SUSPICIOUS',
      advertisedWas,
      currentPrice,
      claimedDiscountPct,
      realDiscountPct,
      observedTypicalPrice: typical,
      explanation:
        `The advertised previous price of ${advertisedWas.toFixed(0)} is ` +
        `${advertisedExceedsObserved.toFixed(0)}% above the highest price we actually recorded ` +
        `over the last ${stats.dayCount} days (${upperTypical.toFixed(0)}). ` +
        `It typically sold for about ${typical.toFixed(0)}, making the real saving closer to ` +
        `${realDiscountPct.toFixed(0)}% than the advertised ${claimedDiscountPct.toFixed(0)}%.`,
    };
  }

  return {
    verdict: 'GENUINE',
    advertisedWas,
    currentPrice,
    claimedDiscountPct,
    realDiscountPct,
    observedTypicalPrice: typical,
    explanation:
      `We recorded this product at up to ${upperTypical.toFixed(0)} in the last ${stats.dayCount} days, ` +
      'which is consistent with the advertised previous price.',
  };
}
