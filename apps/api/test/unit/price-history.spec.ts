import { HistoryRow, buildPriceHistory, dayKey, recordedPriceStats } from '../../src/prices/price-history';

const row = (listing: string, iso: string, price: number, lastSeen = '2026-09-26T08:00:00Z'): HistoryRow => ({
  sourceListingId: listing,
  platformId: `store-${listing}`,
  platformName: `Store ${listing}`,
  recordedAt: new Date(iso),
  price,
  inStock: true,
  lastSeenAt: new Date(lastSeen),
});

describe('price history (audit 02, L-13/L-14)', () => {
  it('buckets by the market day, not the UTC day', () => {
    // 23:30 UTC on the 20th is 02:30 on the 21st in Cairo (UTC+3 in September).
    expect(dayKey(new Date('2026-09-20T23:30:00Z'), 'Africa/Cairo')).toBe('2026-09-21');
    expect(dayKey(new Date('2026-09-20T23:30:00Z'), 'UTC')).toBe('2026-09-20');
  });

  it('carries each listing forward, so the daily best price includes stores whose price did not change', () => {
    const view = buildPriceHistory(
      [
        row('a', '2026-09-10T10:00:00Z', 20000),
        row('b', '2026-09-12T10:00:00Z', 19000),
        row('a', '2026-09-14T10:00:00Z', 21000),
      ],
      { from: new Date('2026-09-10T00:00:00Z'), to: new Date('2026-09-15T12:00:00Z'), timeZone: 'Africa/Cairo' },
    );
    const byDay = Object.fromEntries(view.chart.map((point) => [point.date, point.min]));
    expect(byDay).toEqual({
      '2026-09-10': 20000,
      '2026-09-11': 20000,
      '2026-09-12': 19000,
      '2026-09-13': 19000,
      // a rose to 21,000 but b still sells at 19,000: the best price is 19,000,
      // not the 21,000 that "changed that day".
      '2026-09-14': 19000,
      '2026-09-15': 19000,
    });
  });

  it('carries the price from before the window into its first day', () => {
    const view = buildPriceHistory([row('a', '2026-08-01T10:00:00Z', 18000)], {
      from: new Date('2026-09-20T00:00:00Z'),
      to: new Date('2026-09-21T12:00:00Z'),
      timeZone: 'UTC',
    });
    expect(view.chart.map((point) => [point.date, point.min])).toEqual([
      ['2026-09-20', 18000],
      ['2026-09-21', 18000],
    ]);
    expect(view.summary.dataPoints).toBe(0);
    expect(view.summary.allTimeMin).toBe(18000);
  });

  it('stops carrying a listing soon after its last scrape', () => {
    const view = buildPriceHistory([row('a', '2026-09-01T10:00:00Z', 18000, '2026-09-02T10:00:00Z')], {
      from: new Date('2026-09-01T00:00:00Z'),
      to: new Date('2026-09-20T12:00:00Z'),
      timeZone: 'UTC',
    });
    expect(view.chart[view.chart.length - 1].date).toBe('2026-09-04');
  });

  it('returns an empty chart, not invented points, when there is no history', () => {
    const view = buildPriceHistory([], { from: new Date('2026-09-01'), to: new Date('2026-09-02'), timeZone: 'UTC' });
    expect(view.chart).toEqual([]);
    expect(view.summary).toEqual({ allTimeMin: null, allTimeMax: null, periodMin: null, periodMax: null, avgPrice: null, dataPoints: 0 });
  });

  it('all-time and 52-week figures are recorded prices, not the current min/max', () => {
    const now = new Date('2026-09-26T00:00:00Z');
    const stats = recordedPriceStats(
      [
        { price: 25000, recordedAt: new Date('2025-06-01T00:00:00Z') },
        { price: 21000, recordedAt: new Date('2026-03-01T00:00:00Z') },
        { price: 18500, recordedAt: new Date('2026-09-20T00:00:00Z') },
      ],
      now,
    );
    expect(stats.allTime).toEqual({ min: 18500, max: 25000, avg: 21500, dataPoints: 3 });
    expect(stats.week52).toEqual({ low: 18500, high: 21000 });
  });
});
