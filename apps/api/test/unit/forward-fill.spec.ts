import {
  FILL_GRACE_DAYS,
  PriceChangePoint,
  computeBuyVerdict,
  computeHistoryStats,
  forwardFillDailySeries,
} from '../../src/intelligence/price-statistics';

function change(listing: string, date: string, price: number, inStock = true): PriceChangePoint {
  return { sourceListingId: listing, date, price, inStock };
}

describe('forwardFillDailySeries', () => {
  it('returns nothing when there are no recorded changes', () => {
    expect(forwardFillDailySeries([], { from: '2026-01-01', to: '2026-01-10' })).toEqual([]);
  });

  it('carries a single unchanged price across every day', () => {
    // The central case: price history is change-only, so a price that held
    // steady for a month is ONE row. Counting rows would call that one day of
    // history and make every verdict threshold unreachable.
    const series = forwardFillDailySeries([change('a', '2026-01-01', 20_000)], {
      from: '2026-01-01',
      to: '2026-01-30',
    });

    expect(series).toHaveLength(30);
    expect(series[0].date).toBe('2026-01-01');
    expect(series[29].date).toBe('2026-01-30');
    expect(series.every((point) => point.min === 20_000)).toBe(true);
  });

  it('switches to the new price from the day it changed', () => {
    const series = forwardFillDailySeries(
      [change('a', '2026-01-01', 20_000), change('a', '2026-01-05', 18_000)],
      { from: '2026-01-01', to: '2026-01-07' },
    );

    expect(series.find((p) => p.date === '2026-01-04')!.min).toBe(20_000);
    expect(series.find((p) => p.date === '2026-01-05')!.min).toBe(18_000);
    expect(series.find((p) => p.date === '2026-01-07')!.min).toBe(18_000);
  });

  it('takes the cheapest across listings, which is what a shopper would pay', () => {
    const series = forwardFillDailySeries(
      [change('a', '2026-01-01', 20_000), change('b', '2026-01-01', 19_000)],
      { from: '2026-01-01', to: '2026-01-03' },
    );

    expect(series.every((point) => point.min === 19_000)).toBe(true);
    expect(series.every((point) => point.max === 20_000)).toBe(true);
    expect(series.every((point) => point.count === 2)).toBe(true);
  });

  it('does not invent a price for a listing before it was first seen', () => {
    // Listing b appears on the 3rd. Days 1-2 must reflect only listing a.
    const series = forwardFillDailySeries(
      [change('a', '2026-01-01', 20_000), change('b', '2026-01-03', 15_000)],
      { from: '2026-01-01', to: '2026-01-04' },
    );

    expect(series.find((p) => p.date === '2026-01-01')!.count).toBe(1);
    expect(series.find((p) => p.date === '2026-01-02')!.min).toBe(20_000);
    expect(series.find((p) => p.date === '2026-01-03')!.count).toBe(2);
    expect(series.find((p) => p.date === '2026-01-03')!.min).toBe(15_000);
  });

  it('carries stock state forward with the price', () => {
    const series = forwardFillDailySeries(
      [change('a', '2026-01-01', 20_000, true), change('a', '2026-01-03', 20_000, false)],
      { from: '2026-01-01', to: '2026-01-04' },
    );

    expect(series.find((p) => p.date === '2026-01-02')!.inStock).toBe(true);
    expect(series.find((p) => p.date === '2026-01-04')!.inStock).toBe(false);
  });

  it('reports available when any listing has it, even if another does not', () => {
    const series = forwardFillDailySeries(
      [change('a', '2026-01-01', 20_000, false), change('b', '2026-01-01', 21_000, true)],
      { from: '2026-01-01', to: '2026-01-02' },
    );
    expect(series.every((point) => point.inStock)).toBe(true);
  });

  describe('delisted listings', () => {
    it('stops carrying a listing forward once it is no longer observed', () => {
      // The failure this guards against: a listing delisted on the 5th would
      // otherwise keep contributing its price for the rest of the range,
      // inventing a cheaper market than the one that exists.
      const series = forwardFillDailySeries(
        [change('gone', '2026-01-01', 15_000), change('live', '2026-01-01', 20_000)],
        {
          from: '2026-01-01',
          to: '2026-01-20',
          lastSeenByListing: new Map([
            ['gone', '2026-01-05'],
            ['live', '2026-01-20'],
          ]),
        },
      );

      // While it was alive, the cheap listing sets the price.
      expect(series.find((p) => p.date === '2026-01-03')!.min).toBe(15_000);
      // After its last observation plus the grace period, it is gone and the
      // surviving listing sets the price.
      expect(series.find((p) => p.date === '2026-01-15')!.min).toBe(20_000);
      expect(series.find((p) => p.date === '2026-01-15')!.count).toBe(1);
    });

    it('allows a grace period so one failed scrape does not truncate the chart', () => {
      const series = forwardFillDailySeries([change('a', '2026-01-01', 20_000)], {
        from: '2026-01-01',
        to: '2026-01-20',
        lastSeenByListing: new Map([['a', '2026-01-10']]),
      });

      const lastDay = series[series.length - 1].date;
      const expected = new Date(Date.parse('2026-01-10T00:00:00Z') + FILL_GRACE_DAYS * 86_400_000)
        .toISOString()
        .slice(0, 10);
      expect(lastDay).toBe(expected);
    });

    it('fills to the end of the range when no last-seen data is supplied', () => {
      // Backwards compatible: a caller without last-seen data behaves as before
      // rather than silently producing an empty series.
      const series = forwardFillDailySeries([change('a', '2026-01-01', 20_000)], {
        from: '2026-01-01',
        to: '2026-01-10',
      });
      expect(series).toHaveLength(10);
    });

    it('produces no series at all when every listing is long gone', () => {
      const series = forwardFillDailySeries([change('a', '2026-01-01', 20_000)], {
        from: '2026-02-01',
        to: '2026-02-10',
        lastSeenByListing: new Map([['a', '2026-01-02']]),
      });
      expect(series).toEqual([]);
    });
  });

  it('refuses an inverted range instead of looping', () => {
    expect(
      forwardFillDailySeries([change('a', '2026-01-05', 1)], { from: '2026-01-10', to: '2026-01-01' }),
    ).toEqual([]);
  });

  it('makes a steady price produce a usable verdict', () => {
    // End-to-end of the fix: without forward-fill this is one data point and
    // the verdict is permanently INSUFFICIENT_DATA, which is exactly what the
    // production database was returning for every product.
    const changes = [change('a', '2026-01-01', 24_000), change('a', '2026-02-01', 18_000)];
    const series = forwardFillDailySeries(changes, { from: '2026-01-01', to: '2026-02-20' });
    const stats = computeHistoryStats(series);

    expect(stats!.dayCount).toBeGreaterThanOrEqual(45);
    expect(stats!.spanDays).toBeGreaterThanOrEqual(45);

    const verdict = computeBuyVerdict(18_000, series, stats);
    expect(verdict.verdict).toBe('GOOD_TIME_TO_BUY');
    expect(verdict.percentile).not.toBeNull();
  });

  it('weights a long-held price by its duration, not by being one row', () => {
    // 40 days at 24,000 then 5 days at 18,000: 18,000 is genuinely rare and
    // should rank near the bottom. Counting change events would score it 50.
    const series = forwardFillDailySeries(
      [change('a', '2026-01-01', 24_000), change('a', '2026-02-10', 18_000)],
      { from: '2026-01-01', to: '2026-02-14' },
    );
    const verdict = computeBuyVerdict(18_000, series, computeHistoryStats(series));
    expect(verdict.percentile!).toBeLessThan(20);
  });
});
