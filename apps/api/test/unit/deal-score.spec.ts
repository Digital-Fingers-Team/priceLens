import { MIN_SIGNAL_COVERAGE, computeDealScore } from '../../src/intelligence/deal-score';
import { DailyPricePoint, computeHistoryStats } from '../../src/intelligence/price-statistics';

function series(prices: number[]): DailyPricePoint[] {
  const start = Date.UTC(2026, 0, 1);
  return prices.map((price, index) => ({
    date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
    min: price,
    max: price,
    avg: price,
    count: 1,
    inStock: true,
  }));
}

const flat = series(Array.from({ length: 30 }, () => 20_000));

describe('deal score', () => {
  it('publishes no score when too little resolves', () => {
    const result = computeDealScore({
      currentPrice: null,
      points: [],
      stats: null,
      competitorPrices: [],
      inStock: null,
      storeCount: 1,
    });

    expect(result.score).toBeNull();
    expect(result.grade).toBeNull();
    expect(result.coverage).toBeLessThan(MIN_SIGNAL_COVERAGE);
  });

  it('never invents a value for a signal it cannot measure', () => {
    const result = computeDealScore({
      currentPrice: 20_000,
      points: [],
      stats: null,
      competitorPrices: [],
      inStock: null,
      storeCount: 1,
    });

    const unavailable = result.signals.filter((signal) => !signal.available);
    expect(unavailable.length).toBeGreaterThan(0);
    // The crucial property: unmeasured signals carry null, not a neutral 50.
    for (const signal of unavailable) {
      expect(signal.score).toBeNull();
      expect(signal.detail).toBeTruthy();
    }
  });

  it('scores a genuine low across many stores highly', () => {
    const falling = series([
      ...Array.from({ length: 25 }, () => 24_000),
      ...Array.from({ length: 10 }, () => 18_000),
    ]);

    const result = computeDealScore({
      currentPrice: 17_000,
      points: falling,
      stats: computeHistoryStats(falling),
      competitorPrices: [17_000, 19_500, 21_000, 22_400, 23_000, 24_000],
      inStock: true,
      storeCount: 6,
    });

    expect(result.score).not.toBeNull();
    expect(result.score!).toBeGreaterThanOrEqual(80);
    expect(result.grade).toBe('EXCELLENT');
    expect(result.coverage).toBe(1);
  });

  it('scores the most expensive listing at a historic high poorly', () => {
    const rising = series(Array.from({ length: 30 }, (_, i) => 15_000 + i * 200));

    const result = computeDealScore({
      currentPrice: 20_800,
      points: rising,
      stats: computeHistoryStats(rising),
      competitorPrices: [17_000, 18_000, 20_800],
      inStock: false,
      storeCount: 3,
    });

    expect(result.score).not.toBeNull();
    expect(result.score!).toBeLessThan(40);
    expect(result.grade).toBe('POOR');
  });

  it('redistributes weight so a partial score stays on the same scale', () => {
    const result = computeDealScore({
      currentPrice: 20_000,
      points: flat,
      stats: computeHistoryStats(flat),
      competitorPrices: [],
      inStock: null,
      storeCount: 2,
    });

    expect(result.score).not.toBeNull();
    expect(result.score!).toBeGreaterThanOrEqual(0);
    expect(result.score!).toBeLessThanOrEqual(100);
    expect(result.coverage).toBeGreaterThanOrEqual(MIN_SIGNAL_COVERAGE);
    expect(result.coverage).toBeLessThan(1);
  });

  it('treats identical competitor prices as neutral, not a perfect deal', () => {
    const result = computeDealScore({
      currentPrice: 20_000,
      points: flat,
      stats: computeHistoryStats(flat),
      competitorPrices: [20_000, 20_000, 20_000],
      inStock: true,
      storeCount: 3,
    });

    const market = result.signals.find((signal) => signal.key === 'marketPosition');
    expect(market!.score).toBe(50);
  });

  it('always explains itself', () => {
    const result = computeDealScore({
      currentPrice: 20_000,
      points: flat,
      stats: computeHistoryStats(flat),
      competitorPrices: [20_000, 21_000],
      inStock: true,
      storeCount: 2,
    });

    expect(result.methodology).toMatch(/redistributed/i);
    expect(result.signals.every((signal) => signal.label && signal.detail)).toBe(true);
  });
});
