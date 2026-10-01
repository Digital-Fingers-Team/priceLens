import { nearestSale } from '../../src/intelligence/sale-events';
import { DailyPricePoint, computeBuyVerdict, computeHistoryStats } from '../../src/intelligence/price-statistics';

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe('sale calendar', () => {
  it('finds White Friday ahead, and says when it is on', () => {
    expect(nearestSale(at('2026-11-01'), 21)).toEqual({ event: 'WHITE_FRIDAY', daysAway: 9 });
    expect(nearestSale(at('2026-11-20'), 21)).toEqual({ event: 'WHITE_FRIDAY', daysAway: 0 });
  });

  it('knows Ramadan from the yearly table, including next year from December', () => {
    expect(nearestSale(at('2027-01-25'), 21)?.event).toBe('RAMADAN');
    expect(nearestSale(at('2027-12-31'), 21)?.event).toBe('RAMADAN'); // 2028 starts 28 Jan; offers a week before
  });

  it('is quiet when nothing is close', () => {
    expect(nearestSale(at('2026-06-15'), 21)).toBeNull();
  });
});

describe('seasonal buy/wait', () => {
  // 30 days hovering around 100, then the current price sits mid-range.
  const points: DailyPricePoint[] = Array.from({ length: 30 }, (_, i) => {
    const price = 90 + (i % 3) * 10;
    return { date: `2026-10-${String(i + 1).padStart(2, '0')}`, min: price, max: price, avg: price, count: 1, inStock: true } as DailyPricePoint;
  });
  const stats = computeHistoryStats(points);

  it('turns a fair price into "wait" when a big sale is two weeks away, and says why', () => {
    const quiet = computeBuyVerdict(100, points, stats, at('2026-06-15'));
    const before = computeBuyVerdict(100, points, stats, at('2026-11-01'));
    expect(quiet.verdict).toBe('FAIR_PRICE');
    expect(before.verdict).toBe('WAIT');
    expect(before.reasonCodes).toContainEqual({ code: 'SALE_SOON_WHITE_FRIDAY', params: { days: 9 } });
  });

  it('leaves a good price alone, and only notes a sale that is on', () => {
    const during = computeBuyVerdict(90, points, stats, at('2026-11-20'));
    expect(during.verdict).toBe('GOOD_TIME_TO_BUY');
    expect(during.reasonCodes.map((r) => r.code)).toContain('SALE_NOW_WHITE_FRIDAY');
  });
});
