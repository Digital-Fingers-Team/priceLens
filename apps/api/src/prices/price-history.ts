import { forwardFillDailySeries, PriceChangePoint } from '../intelligence/price-statistics';

/**
 * Pure price-history math for the product page (audit 02, L-13/L-14).
 *
 * Price history stores one row per listing per price *change*. The chart
 * wants the best price a shopper could have paid each day, so each listing's
 * last known price is carried forward day by day (forwardFillDailySeries) and
 * the daily figure is the cheapest across listings. Days are calendar days in
 * the market's time zone, not UTC: a change at 01:00 in Cairo belongs to that
 * Cairo day.
 */

export interface HistoryRow {
  sourceListingId: string;
  platformId: string;
  platformName: string;
  recordedAt: Date;
  price: number;
  inStock: boolean;
  /** The listing's last scrape; a listing is not carried forward long past it. */
  lastSeenAt: Date;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** The calendar day (YYYY-MM-DD) an instant falls on in `timeZone`. */
export function dayKey(instant: Date, timeZone: string): string {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(timeZone, formatter);
  }
  return formatter.format(instant);
}

export interface DailyChartPoint {
  date: string;
  min: number;
  max: number;
  avg: number;
  count: number;
}

export interface PriceHistoryView {
  chart: DailyChartPoint[];
  summary: {
    allTimeMin: number | null;
    allTimeMax: number | null;
    periodMin: number | null;
    periodMax: number | null;
    /** Mean of the daily best prices in the period. */
    avgPrice: number | null;
    /** Recorded price changes in the period. */
    dataPoints: number;
  };
  platformBreakdown: Array<{ platformId: string; name: string; minPrice: number; maxPrice: number; avgPrice: number }>;
}

/**
 * `rows` is the product's whole history (every listing currently matched to
 * it), in any order. The chart covers `from`..`to`; the price each listing
 * had when the window opened is carried into it, so day one is not empty.
 */
export function buildPriceHistory(
  rows: HistoryRow[],
  { from, to, timeZone }: { from: Date; to: Date; timeZone: string },
): PriceHistoryView {
  const sorted = [...rows].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const inWindow = sorted.filter((row) => row.recordedAt >= from && row.recordedAt <= to);

  // The last change before the window, per listing, stands for the listing's
  // price on the window's first day.
  const carried = new Map<string, HistoryRow>();
  for (const row of sorted) {
    if (row.recordedAt < from) carried.set(row.sourceListingId, row);
  }

  const fromDay = dayKey(from, timeZone);
  const changes: PriceChangePoint[] = [
    ...[...carried.values()].map((row) => ({ ...toChange(row, timeZone), date: fromDay })),
    ...inWindow.map((row) => toChange(row, timeZone)),
  ];
  const lastSeenByListing = new Map(rows.map((row) => [row.sourceListingId, dayKey(row.lastSeenAt, timeZone)]));

  const firstDay = changes.reduce<string | null>((first, change) => (first === null || change.date < first ? change.date : first), null);
  const chart = firstDay
    ? forwardFillDailySeries(changes, {
        from: firstDay > fromDay ? firstDay : fromDay,
        to: dayKey(to, timeZone),
        lastSeenByListing,
      }).map(({ date, min, max, avg, count }) => ({ date, min, max, avg, count }))
    : [];

  const allPrices = sorted.map((row) => row.price);
  const dailyBest = chart.map((point) => point.min);

  const byPlatform = new Map<string, { name: string; prices: number[] }>();
  for (const row of [...carried.values(), ...inWindow]) {
    const entry = byPlatform.get(row.platformId) ?? { name: row.platformName, prices: [] };
    entry.prices.push(row.price);
    byPlatform.set(row.platformId, entry);
  }

  return {
    chart,
    summary: {
      allTimeMin: allPrices.length ? Math.min(...allPrices) : null,
      allTimeMax: allPrices.length ? Math.max(...allPrices) : null,
      periodMin: chart.length ? Math.min(...chart.map((point) => point.min)) : null,
      periodMax: chart.length ? Math.max(...chart.map((point) => point.max)) : null,
      avgPrice: dailyBest.length ? dailyBest.reduce((sum, value) => sum + value, 0) / dailyBest.length : null,
      dataPoints: inWindow.length,
    },
    platformBreakdown: [...byPlatform.entries()].map(([platformId, { name, prices }]) => ({
      platformId,
      name,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      avgPrice: prices.reduce((sum, value) => sum + value, 0) / prices.length,
    })),
  };
}

function toChange(row: HistoryRow, timeZone: string): PriceChangePoint {
  return { sourceListingId: row.sourceListingId, date: dayKey(row.recordedAt, timeZone), price: row.price, inStock: row.inStock };
}

/**
 * Recorded-price statistics: the lowest and highest price any live-matched
 * listing of the product was recorded at, over all time and over the last
 * 365 days. These are what "All-time low/high" and "52-week low/high" mean
 * on the product page; they used to be the current min/max.
 */
export function recordedPriceStats(rows: Array<Pick<HistoryRow, 'price' | 'recordedAt'>>, now: Date = new Date()) {
  const prices = rows.map((row) => row.price);
  const yearAgo = new Date(now.getTime() - 365 * 86_400_000);
  const lastYear = rows.filter((row) => row.recordedAt >= yearAgo).map((row) => row.price);
  return {
    allTime: {
      min: prices.length ? Math.min(...prices) : null,
      max: prices.length ? Math.max(...prices) : null,
      avg: prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : null,
      dataPoints: prices.length,
    },
    week52: {
      low: lastYear.length ? Math.min(...lastYear) : null,
      high: lastYear.length ? Math.max(...lastYear) : null,
    },
  };
}
