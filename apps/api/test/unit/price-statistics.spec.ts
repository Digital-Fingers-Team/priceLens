import {
  DailyPricePoint,
  FAKE_DISCOUNT_TOLERANCE_PCT,
  MIN_DAYS_FOR_VERDICT,
  computeBuyVerdict,
  computeHistoryStats,
  detectMisleadingDiscount,
  median,
  percentile,
  percentileRankOf,
} from '../../src/intelligence/price-statistics';

/** Builds a daily series ending today, one point per day. */
function series(prices: number[], opts: { inStock?: boolean } = {}): DailyPricePoint[] {
  const start = Date.UTC(2026, 0, 1);
  return prices.map((price, index) => ({
    date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
    min: price,
    max: price,
    avg: price,
    count: 1,
    inStock: opts.inStock ?? true,
  }));
}

describe('price statistics primitives', () => {
  it('returns null rather than a guess for an empty sample', () => {
    expect(median([])).toBeNull();
    expect(percentile([], 50)).toBeNull();
    expect(percentileRankOf([], 100)).toBeNull();
  });

  it('computes the median for odd and even samples', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('interpolates percentiles', () => {
    const values = [10, 20, 30, 40];
    expect(percentile(values, 0)).toBe(10);
    expect(percentile(values, 100)).toBe(40);
    expect(percentile(values, 50)).toBe(25);
  });

  it('scores a flat series at the midpoint rather than an extreme', () => {
    // Every observation equal: the price is neither cheap nor expensive.
    expect(percentileRankOf([100, 100, 100], 100)).toBe(50);
  });

  it('ranks a price below everything observed as 0', () => {
    expect(percentileRankOf([100, 110, 120], 90)).toBe(0);
  });

  it('measures volatility relative to the average so products are comparable', () => {
    const stable = computeHistoryStats(series([100, 100, 100, 100]));
    const jumpy = computeHistoryStats(series([50, 150, 50, 150]));
    expect(stable!.volatility).toBe(0);
    expect(jumpy!.volatility).toBeGreaterThan(stable!.volatility);
  });

  it('reports the observed span, not the number of points', () => {
    const stats = computeHistoryStats(series([10, 11, 12]));
    expect(stats!.dayCount).toBe(3);
    expect(stats!.spanDays).toBe(2);
  });
});

describe('buy/wait verdict', () => {
  const longFlat = series(Array.from({ length: 40 }, () => 20_000));

  it('refuses to give a verdict without enough history', () => {
    const points = series([100, 101, 102]);
    const result = computeBuyVerdict(100, points, computeHistoryStats(points));
    expect(result.verdict).toBe('INSUFFICIENT_DATA');
    expect(result.missing?.needDays).toBe(MIN_DAYS_FOR_VERDICT);
    // Critically: no fabricated percentile or confidence.
    expect(result.percentile).toBeNull();
    expect(result.confidence).toBeNull();
  });

  it('refuses a verdict when there is no current price at all', () => {
    const result = computeBuyVerdict(null, longFlat, computeHistoryStats(longFlat));
    expect(result.verdict).toBe('INSUFFICIENT_DATA');
  });

  it('says buy when the price is near the bottom of its observed range', () => {
    const prices = Array.from({ length: 40 }, (_, i) => 20_000 + i * 50);
    const points = series(prices);
    const result = computeBuyVerdict(20_000, points, computeHistoryStats(points));
    expect(result.verdict).toBe('GOOD_TIME_TO_BUY');
    expect(result.percentile).toBeLessThanOrEqual(25);
    expect(result.reasons.join(' ')).toMatch(/lowest recorded price/i);
  });

  it('says wait when the price sits high in its observed range', () => {
    const prices = Array.from({ length: 40 }, (_, i) => 20_000 + i * 50);
    const points = series(prices);
    const result = computeBuyVerdict(21_950, points, computeHistoryStats(points));
    expect(result.verdict).toBe('WAIT');
    expect(result.percentile).toBeGreaterThanOrEqual(70);
  });

  it('matches the brief’s worked example', () => {
    // 90-day average 20,300; low 17,999; current 18,499 -> should be a buy.
    const prices = [
      ...Array.from({ length: 30 }, () => 22_000),
      ...Array.from({ length: 30 }, () => 20_300),
      ...Array.from({ length: 30 }, () => 18_600),
    ];
    prices[89] = 17_999;
    const points = series(prices);
    const result = computeBuyVerdict(18_499, points, computeHistoryStats(points));
    expect(result.verdict).toBe('GOOD_TIME_TO_BUY');
    expect(result.vsAverage).toBeGreaterThan(0);
  });

  it('downgrades confidence when the price thrashes', () => {
    const jumpy = series(Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 10_000 : 20_000)));
    const result = computeBuyVerdict(10_000, jumpy, computeHistoryStats(jumpy));
    expect(result.confidence).toBe('LOW');
    expect(result.reasons.join(' ')).toMatch(/moves a lot/i);
  });

  it('gives high confidence only with a long, stable history', () => {
    const result = computeBuyVerdict(20_000, longFlat, computeHistoryStats(longFlat));
    expect(result.confidence).toBe('MEDIUM');
  });
});

describe('misleading discount detection', () => {
  const realSale = series([
    ...Array.from({ length: 20 }, () => 24_000),
    ...Array.from({ length: 10 }, () => 18_000),
  ]);
  const neverThatPrice = series(Array.from({ length: 30 }, () => 18_200));

  it('says nothing when no discount is claimed', () => {
    const result = detectMisleadingDiscount(18_000, null, realSale, computeHistoryStats(realSale));
    expect(result.verdict).toBe('NO_DISCOUNT_CLAIMED');
  });

  it('will not accuse a retailer without enough history', () => {
    const thin = series([18_000, 18_000]);
    const result = detectMisleadingDiscount(17_999, 24_999, thin, computeHistoryStats(thin));
    expect(result.verdict).toBe('UNVERIFIABLE');
    expect(result.realDiscountPct).toBeNull();
  });

  it('accepts a discount that follows a genuinely higher price', () => {
    const result = detectMisleadingDiscount(18_000, 24_000, realSale, computeHistoryStats(realSale));
    expect(result.verdict).toBe('GENUINE');
  });

  it('flags the brief’s fake-discount example', () => {
    // Advertised 24,999 -> 17,999, but it was only ever around 18,000.
    const result = detectMisleadingDiscount(
      17_999,
      24_999,
      neverThatPrice,
      computeHistoryStats(neverThatPrice),
    );
    expect(result.verdict).toBe('SUSPICIOUS');
    expect(result.claimedDiscountPct).toBeGreaterThan(25);
    expect(result.realDiscountPct).toBeLessThan(5);
    expect(result.explanation).toMatch(/above the highest price we actually recorded/i);
  });

  it('tolerates a small gap rather than flagging honest rounding', () => {
    const justInside = 18_200 * (1 + (FAKE_DISCOUNT_TOLERANCE_PCT - 1) / 100);
    const result = detectMisleadingDiscount(
      17_000,
      justInside,
      neverThatPrice,
      computeHistoryStats(neverThatPrice),
    );
    expect(result.verdict).toBe('GENUINE');
  });
});
