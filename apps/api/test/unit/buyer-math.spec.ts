import { compareWarranty, couponVisible, offerCaution, promoSaving, quoteInstallment } from '../../src/buyer/buyer-math';
import { basketTotal } from '../../src/buyer/cart-watch.service';

const NOW = new Date('2026-10-01T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe('quoteInstallment', () => {
  it('a 0% plan with no fees costs nothing extra', () => {
    expect(quoteInstallment(12_000, { months: 6, markupPct: 0, adminFeePct: 0, adminFeeFlat: 0, downPaymentPct: 0 })).toEqual({
      downPayment: 0,
      monthly: 2000,
      adminFee: 0,
      totalPaid: 12_000,
      extraPct: 0,
    });
  });

  it('applies down payment, markup on the financed part, and the admin fee', () => {
    // 10,000: 10% down = 1,000; financed 9,000 * 1.2 = 10,800 over 12 = 900/month;
    // admin fee 2% of 9,000 = 180 + 50 = 230; total 1,000 + 10,800 + 230 = 12,030.
    expect(quoteInstallment(10_000, { months: 12, markupPct: 20, adminFeePct: 2, adminFeeFlat: 50, downPaymentPct: 10 })).toEqual({
      downPayment: 1000,
      monthly: 900,
      adminFee: 230,
      totalPaid: 12_030,
      extraPct: 20.3,
    });
  });
});

describe('promoSaving', () => {
  const tenPct = { valueType: 'PERCENT' as const, value: 10, maxDiscount: null, minSpend: null };
  it('takes a percentage, capped by the maximum discount', () => {
    expect(promoSaving(20_000, tenPct)).toBe(2000);
    expect(promoSaving(20_000, { ...tenPct, maxDiscount: 1500 })).toBe(1500);
  });
  it('is nothing under the minimum spend, and never more than the price', () => {
    expect(promoSaving(900, { ...tenPct, minSpend: 1000 })).toBe(0);
    expect(promoSaving(100, { valueType: 'AMOUNT', value: 500, maxDiscount: null, minSpend: null })).toBe(100);
  });
});

describe('couponVisible', () => {
  const base = { verified: false, lastVerifiedAt: null, workedCount: 0, failedCount: 0, lastWorkedReportAt: null };
  it('shows codes verified in the last 30 days or reported working in the last 14', () => {
    expect(couponVisible({ ...base, verified: true, lastVerifiedAt: daysAgo(10) }, NOW)).toBe(true);
    expect(couponVisible({ ...base, verified: true, lastVerifiedAt: daysAgo(40) }, NOW)).toBe(false);
    expect(couponVisible({ ...base, workedCount: 1, lastWorkedReportAt: daysAgo(3) }, NOW)).toBe(true);
    expect(couponVisible(base, NOW)).toBe(false);
  });
  it('hides a code buyers keep reporting broken, even if verified', () => {
    expect(couponVisible({ ...base, verified: true, lastVerifiedAt: daysAgo(1), failedCount: 3, workedCount: 1 }, NOW)).toBe(false);
  });
});

describe('compareWarranty', () => {
  it('ranks the local agent over international over seller, then by length', () => {
    expect(compareWarranty({ type: 'LOCAL_AGENT', months: 12 }, { type: 'INTERNATIONAL', months: 24 })).toBeGreaterThan(0);
    expect(compareWarranty({ type: 'SELLER', months: 24 }, { type: 'SELLER', months: 12 })).toBeGreaterThan(0);
    expect(compareWarranty({ type: 'NONE', months: 0 }, { type: 'SELLER', months: 3 })).toBeLessThan(0);
  });
});

describe('offerCaution', () => {
  it('flags only a price far below the market that meets weak feedback', () => {
    expect(offerCaution({ price: 600, rating: null, reviewCount: null }, 1000, 4)).toEqual({
      caution: true,
      signals: ['FAR_BELOW_MARKET', 'NO_FEEDBACK_DATA'],
    });
    expect(offerCaution({ price: 600, rating: 4.4, reviewCount: 2 }, 1000, 4).signals).toContain('FEW_REVIEWS');
    expect(offerCaution({ price: 600, rating: 4.6, reviewCount: 800 }, 1000, 4).caution).toBe(false);
    expect(offerCaution({ price: 950, rating: 2.1, reviewCount: 40 }, 1000, 4).caution).toBe(false);
  });
  it('says nothing about the market with fewer than three stores', () => {
    expect(offerCaution({ price: 400, rating: null, reviewCount: null }, 1000, 2).signals).not.toContain('FAR_BELOW_MARKET');
  });
});

describe('basketTotal', () => {
  const offer = (platformId: string, price: number) => ({ listingId: `${platformId}-${price}`, platformId, store: platformId, price, rating: null, reviewCount: null });
  const offers = new Map([
    ['phone', [offer('noon', 100), offer('jumia', 110)]],
    ['case', [offer('jumia', 5), offer('noon', 8)]],
  ]);
  const items = [{ productId: 'phone', qty: 1 }, { productId: 'case', qty: 2 }];

  it('across stores: each item at its own cheapest store', () => {
    expect(basketTotal(items, offers, true)).toMatchObject({ total: 110, store: null, missing: [] });
  });

  it('one store: the store that carries everything for least', () => {
    expect(basketTotal(items, offers, false)).toMatchObject({ total: 116, store: 'noon' });
  });

  it('reports items nobody prices and leaves them out of the total', () => {
    const result = basketTotal([...items, { productId: 'gone', qty: 1 }], offers, true);
    expect(result.missing).toEqual(['gone']);
    expect(result.total).toBe(110);
    expect(basketTotal([{ productId: 'gone', qty: 1 }], offers, false).total).toBeNull();
  });
});
