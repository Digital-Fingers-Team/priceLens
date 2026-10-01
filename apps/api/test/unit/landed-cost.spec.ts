import { computeLandedCost } from '../../src/intelligence/landed-cost';
import { pickRule } from '../../src/intelligence/landed-cost.service';

const rule = { shippingFlat: 0, shippingPct: 0, customsPct: 15, vatPct: 14, handlingFee: 0 };

describe('computeLandedCost', () => {
  it('charges customs on goods + shipping, and VAT on that plus customs', () => {
    // 1000 + 15% = 1150; VAT 14% of 1150 = 161; total 1311.
    expect(computeLandedCost(1000, rule)).toEqual({ price: 1000, shipping: 0, customs: 150, vat: 161, handling: 0, total: 1311 });
  });

  it('adds flat and percentage shipping before duty, and handling after', () => {
    const result = computeLandedCost(1000, { ...rule, shippingFlat: 100, shippingPct: 5, handlingFee: 50 });
    // shipping 100 + 50 = 150; dutiable 1150; customs 172.5; VAT 14% of 1322.5 = 185.15; +50
    expect(result).toEqual({ price: 1000, shipping: 150, customs: 172.5, vat: 185.15, handling: 50, total: 1557.65 });
  });

  it('treats negative or missing rates as zero rather than discounting', () => {
    const result = computeLandedCost(500, { shippingFlat: -10, shippingPct: Number.NaN, customsPct: -5, vatPct: 0, handlingFee: -1 });
    expect(result.total).toBe(500);
  });
});

describe('pickRule', () => {
  const base = { id: 'x', shippingFlat: 0, shippingPct: 0, customsPct: 0, vatPct: 14, handlingFee: 0 } as never;
  const rules = [
    { ...(base as object), id: 'store-default', platformId: 'ali', categoryId: null },
    { ...(base as object), id: 'store-phones', platformId: 'ali', categoryId: 'phones' },
  ] as never[];

  it('prefers the category rule, falls back to the store default, else none', () => {
    expect((pickRule(rules, 'ali', 'phones') as { id: string }).id).toBe('store-phones');
    expect((pickRule(rules, 'ali', 'tvs') as { id: string }).id).toBe('store-default');
    expect(pickRule(rules, 'noon', 'phones')).toBeNull();
  });
});
