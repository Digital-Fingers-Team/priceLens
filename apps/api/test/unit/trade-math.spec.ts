import { readFileSync } from 'fs';
import { join } from 'path';
import { computeLandedCost } from '../../src/intelligence/landed-cost';
import {
  addDays,
  breakEvenRate,
  demandScore,
  fxScenarios,
  growthPct,
  median,
  opportunityMargin,
  opportunityScore,
  parseCbeRates,
  trendScore,
  volatilityPct,
  weekStartOf,
  zonedDay,
} from '../../src/trade/trade-math';

const rule = { shippingFlat: 0, shippingPct: 0, customsPct: 15, vatPct: 14, handlingFee: 50 };
const landedAt = (price: number) => computeLandedCost(price, rule).total;

describe('trade math', () => {
  it('median and volatility', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(volatilityPct([100, 100])).toBeNull(); // too few days to say
    expect(volatilityPct([100, 100, 100])).toBe(0);
    expect(volatilityPct([90, 100, 110])).toBe(8.16);
  });

  describe('opportunities', () => {
    it('margin is against the local price', () => {
      expect(opportunityMargin({ landedCost: 700, localMedian: 1000 })).toEqual({ marginEgp: 300, marginPct: 30 });
      expect(opportunityMargin({ landedCost: 1200, localMedian: 1000 })).toEqual({ marginEgp: -200, marginPct: -20 });
    });

    it('demand rewards stores, interest and stability, and saturates', () => {
      const thin = demandScore({ localStores: 1, interest: 0, reviewCount: null, volatilityPct: null });
      const proven = demandScore({ localStores: 5, interest: 100, reviewCount: 1000, volatilityPct: 0 });
      expect(thin).toBe(0.13); // unknown stability counts half
      expect(proven).toBe(1);
      expect(demandScore({ localStores: 50, interest: 1e6, reviewCount: 1e6, volatilityPct: 0 })).toBe(1);
      expect(demandScore({ localStores: 3, interest: 0, reviewCount: null, volatilityPct: 40 })).toBeLessThan(
        demandScore({ localStores: 3, interest: 0, reviewCount: null, volatilityPct: 2 }),
      );
    });

    it('score caps implausible margins so they do not float to the top alone', () => {
      expect(opportunityScore(90, 0.5)).toBe(opportunityScore(60, 0.5));
      expect(opportunityScore(30, 1)).toBeGreaterThan(opportunityScore(30, 0));
      expect(opportunityScore(-5, 1)).toBe(0);
    });
  });

  describe('FX scenarios', () => {
    it('scales the store price with the dollar; flat fees stay put', () => {
      // 1000 EGP at 50/USD: landed = 1000 + 150 customs + 161 VAT + 50 = 1361
      const [same, up10] = fxScenarios(1000, 50, [50, 55], landedAt, 2000);
      expect(same).toMatchObject({ rate: 50, changePct: 0, landedCost: 1361, marginEgp: 639 });
      // 1100 EGP: 1100 + 165 + 177.1 + 50
      expect(up10).toMatchObject({ rate: 55, changePct: 10, landedCost: 1492.1, marginEgp: 507.9 });
    });

    it('has no margin without a local price, and nothing without a rate', () => {
      expect(fxScenarios(1000, 50, [50], landedAt, null)[0].marginPct).toBeNull();
      expect(fxScenarios(1000, 0, [50], landedAt, 2000)).toEqual([]);
    });

    it('break-even rate is where the landed cost reaches the local price', () => {
      const rate = breakEvenRate(1000, 50, landedAt, 2000)!;
      expect(landedAt(1000 * (rate / 50))).toBeCloseTo(2000, 0);
      expect(rate).toBeGreaterThan(50);
      expect(breakEvenRate(1000, 50, landedAt, 30)).toBeNull(); // the flat fee alone exceeds it: never pays
    });
  });

  describe('weeks', () => {
    it('Egyptian weeks start on Saturday', () => {
      expect(weekStartOf('2026-10-03')).toBe('2026-10-03'); // Saturday
      expect(weekStartOf('2026-10-02')).toBe('2026-09-26'); // Friday
      expect(weekStartOf('2026-09-27')).toBe('2026-09-26'); // Sunday
      expect(addDays('2026-09-26', 7)).toBe('2026-10-03');
    });

    it('days are taken in Cairo', () => {
      // 22:30 UTC on the 1st is already the 2nd in Cairo (UTC+3 in summer).
      expect(zonedDay(new Date('2026-10-01T22:30:00Z'), 'Africa/Cairo')).toBe('2026-10-02');
    });

    it('growth has a floor and the score is clamped', () => {
      expect(growthPct(3, 1)).toBe(40); // (3-1)/5, not +200 %
      expect(growthPct(20, 10)).toBe(100);
      expect(trendScore({ supplyGrowthPct: 10_000, interestGrowthPct: 0, priceChangePct: null })).toBe(90);
      expect(trendScore({ supplyGrowthPct: 0, interestGrowthPct: 0, priceChangePct: -10 })).toBe(20);
    });
  });

  describe('CBE rates page', () => {
    const html = readFileSync(join(__dirname, '../fixtures/fx/cbe-rates.html'), 'utf8');

    it('reads the date and buy / sell per currency', () => {
      const parsed = parseCbeRates(html);
      expect(parsed.rateDate).toBe('2026-10-01');
      expect(parsed.rates.find((r) => r.currency === 'USD')).toEqual({ currency: 'USD', buy: 52.2571, sell: 52.3971 });
      expect(parsed.rates.find((r) => r.currency === 'CNY')).toEqual({ currency: 'CNY', buy: 7.7942, sell: 7.8152 });
      // The yen is quoted per 100.
      expect(parsed.rates.find((r) => r.currency === 'JPY')?.buy).toBeCloseTo(0.3305, 4);
    });

    it('returns nothing from a rejected request rather than guessing', () => {
      const parsed = parseCbeRates('<html><title>Request Rejected</title></html>');
      expect(parsed.rates).toEqual([]);
    });
  });
});
