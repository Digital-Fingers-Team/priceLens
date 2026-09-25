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
 * Grace, in days, between a listing's last successful scrape and the point we
 * stop carrying its price forward.
 *
 * A live listing has lastSeenAt updated on every scrape, so in normal
 * operation this is never reached. It exists to absorb a transient scrape
 * failure -- one failed run should not punch a hole in the chart -- while
 * still ensuring a genuinely delisted product stops contributing within days
 * rather than indefinitely.
 */
export const FILL_GRACE_DAYS = 2;

export interface ForwardFillOptions {
  from: string;
  to: string;
  /**
   * Last date each listing was actually observed (YYYY-MM-DD).
   *
   * Without this, forward fill cannot tell "the price did not change" from
   * "this listing no longer exists" -- both look like an absence of rows -- and
   * a delisted listing's final price would be carried forward forever,
   * understating the real market price and poisoning every verdict built on
   * it. A listing missing from the map is filled to the end of the range,
   * which is the correct behaviour when the caller has no last-seen data.
   */
  lastSeenByListing?: Map<string, string>;
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
  options: ForwardFillOptions,
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
  // The last day each listing may contribute to, after the grace period.
  const fillUntil = new Map<string, string>();
  for (const listingId of byListing.keys()) {
    cursors.set(listingId, { index: 0, price: null, inStock: true });

    const lastSeen = options.lastSeenByListing?.get(listingId);
    if (lastSeen) {
      const cutoffMs = Date.parse(`${lastSeen}T00:00:00Z`) + FILL_GRACE_DAYS * 86_400_000;
      if (Number.isFinite(cutoffMs)) {
        fillUntil.set(listingId, new Date(cutoffMs).toISOString().slice(0, 10));
      }
    }
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

      // Past its last observation (plus grace) the listing is treated as gone.
      // Carrying a delisted price forward would invent a cheaper market than
      // the one that actually exists.
      const cutoff = fillUntil.get(listingId);
      if (cutoff && date > cutoff) continue;

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

// ─── Outlier filtering ──────────────────────────────────────────────────────

/**
 * How far from the median a price may sit before it is treated as a mismatch
 * rather than a bargain.
 *
 * Matching is imperfect, and its characteristic failure is pulling an
 * accessory (a case, a cable, a replacement part) onto a product's page. The
 * result is a "competitor" at a fraction of the real price, which poisons the
 * cheapest-price claim, the deal score, and — worst — a seller's pricing
 * recommendation. 2.5x is wide enough to keep genuine clearance pricing and
 * genuine premium bundles.
 */
export const OUTLIER_RATIO = 2.5;

/** Below this many prices there is no reliable median to judge against. */
export const MIN_PRICES_FOR_OUTLIER_CHECK = 3;

export interface OutlierFilterResult<T> {
  kept: T[];
  /** Excluded entries, so the UI can say what was dropped and why. */
  excluded: T[];
  /** The median the decision was made against. */
  median: number | null;
}

/**
 * Drops prices far enough from the median to be almost certainly the wrong
 * product.
 *
 * Uses the median rather than the mean precisely because the mean is what an
 * outlier destroys. Returns what it removed rather than silently discarding
 * it: a seller who is told "the cheapest competitor is 4,123" when that is an
 * accessory loses trust in everything else on the page, and one who is shown
 * nothing at all cannot tell that we filtered.
 *
 * With fewer than MIN_PRICES_FOR_OUTLIER_CHECK entries nothing is excluded --
 * with two prices there is no way to tell which one is wrong.
 */
export function filterPriceOutliers<T>(
  items: T[],
  getPrice: (item: T) => number,
  ratio = OUTLIER_RATIO,
): OutlierFilterResult<T> {
  const prices = items.map(getPrice).filter((price) => Number.isFinite(price) && price > 0);

  if (items.length < MIN_PRICES_FOR_OUTLIER_CHECK || prices.length < MIN_PRICES_FOR_OUTLIER_CHECK) {
    return { kept: items, excluded: [], median: median(prices) };
  }

  const mid = median(prices);
  if (mid == null || mid <= 0) return { kept: items, excluded: [], median: null };

  const lower = mid / ratio;
  const upper = mid * ratio;

  const kept: T[] = [];
  const excluded: T[] = [];

  for (const item of items) {
    const price = getPrice(item);
    if (!Number.isFinite(price) || price <= 0 || price < lower || price > upper) excluded.push(item);
    else kept.push(item);
  }

  // Never filter away everything: if the rule would empty the set, the median
  // itself was untrustworthy and the honest answer is to keep the data as-is.
  if (kept.length === 0) return { kept: items, excluded: [], median: mid };

  return { kept, excluded, median: mid };
}

/**
 * Lower bound for a shopper-facing price: under half the market price, a new
 * product is not on sale, it is a different product (a fake, a spare part, a
 * lower wholesale tier). Tighter than OUTLIER_RATIO's 1/2.5 below, which let
 * an Alibaba "Honor X9d" at 8,400 EGP stand as the best deal on a phone that
 * costs 24,300 at Noon and Amazon.
 */
export const MARKET_LOWER_RATIO = 0.5;

/**
 * filterPriceOutliers, judged against the *market* rather than the pile of
 * listings: each store contributes one price (its own median), and the market
 * price is the median of those. Otherwise the store with the most listings
 * decides what "normal" is -- eight near-identical Alibaba offers outvoted
 * Noon and Amazon and dragged the median to Alibaba's own level.
 *
 * With a single store it falls back to that store's listings, and like
 * filterPriceOutliers it never filters on too little data or empties the set.
 */
export function filterMarketOutliers<T>(
  items: T[],
  getPrice: (item: T) => number,
  getStore: (item: T) => string,
  lowerRatio = MARKET_LOWER_RATIO,
  upperRatio = OUTLIER_RATIO,
): OutlierFilterResult<T> {
  const priced = items.filter((item) => Number.isFinite(getPrice(item)) && getPrice(item) > 0);

  const byStore = new Map<string, number[]>();
  for (const item of priced) {
    const bucket = byStore.get(getStore(item)) ?? [];
    bucket.push(getPrice(item));
    byStore.set(getStore(item), bucket);
  }

  let market: number | null;
  if (byStore.size >= 2) {
    market = median([...byStore.values()].map((prices) => median(prices) as number));
  } else if (priced.length >= MIN_PRICES_FOR_OUTLIER_CHECK) {
    market = median(priced.map(getPrice));
  } else {
    return { kept: items, excluded: [], median: median(priced.map(getPrice)) };
  }
  if (market == null || market <= 0) return { kept: items, excluded: [], median: null };

  const lower = market * lowerRatio;
  const upper = market * upperRatio;
  const kept: T[] = [];
  const excluded: T[] = [];
  for (const item of items) {
    const price = getPrice(item);
    if (!Number.isFinite(price) || price <= 0 || price < lower || price > upper) excluded.push(item);
    else kept.push(item);
  }
  if (kept.length === 0) return { kept: items, excluded: [], median: market };
  return { kept, excluded, median: market };
}
