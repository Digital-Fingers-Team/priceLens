import {
  breakEvenPrice,
  computeProfit,
  listingKey,
  parseProductsCsv,
  rankOf,
  suggestPrice,
  suggestionsCsv,
} from '../../src/seller/seller-math';

const fees = { commissionPct: 10, fixedFee: 15, shippingFee: 35, returnRatePct: 2, vatPct: 14 };

describe('seller math', () => {
  describe('computeProfit', () => {
    it('subtracts every fee, VAT inside the price, and the cost', () => {
      const p = computeProfit(1140, 700, fees);
      expect(p.commission).toBe(114);
      expect(p.returns).toBe(22.8);
      expect(p.vat).toBe(140);
      // 1140 - 114 - 15 - 35 - 22.8 - 140 - 700
      expect(p.netProfit).toBe(113.2);
      expect(p.marginPct).toBe(9.9);
    });

    it('has no profit without a cost, and no VAT for an unregistered seller', () => {
      const p = computeProfit(1000, null, { ...fees, vatPct: 0 });
      expect(p.netProfit).toBeNull();
      expect(p.marginPct).toBeNull();
      expect(p.vat).toBe(0);
    });

    it('the break-even price nets zero', () => {
      const price = breakEvenPrice(700, fees)!;
      expect(Math.abs(computeProfit(price, 700, fees).netProfit!)).toBeLessThanOrEqual(0.02);
      expect(breakEvenPrice(100, { ...fees, commissionPct: 99 })).toBeNull();
    });
  });

  describe('suggestPrice', () => {
    const base = { strategy: 'BEAT_LOWEST' as const, offset: 5, floor: null, ceiling: null, currentPrice: 1000 };

    it('goes the offset below the cheapest competitor', () => {
      expect(suggestPrice({ ...base, lowestCompetitor: 950 })).toEqual({ price: 945, reason: 'BEAT_LOWEST' });
      expect(suggestPrice({ ...base, strategy: 'MATCH_LOWEST', lowestCompetitor: 950 })).toEqual({ price: 950, reason: 'MATCH_LOWEST' });
    });

    it('never goes below the floor or above the ceiling', () => {
      expect(suggestPrice({ ...base, floor: 980, lowestCompetitor: 950 })).toEqual({ price: 980, reason: 'HELD_AT_FLOOR' });
      expect(suggestPrice({ ...base, ceiling: 1100, lowestCompetitor: 1500 })).toEqual({ price: 1100, reason: 'HELD_AT_CEILING' });
    });

    it('suggests nothing without a competitor, and says when the price is already right', () => {
      expect(suggestPrice({ ...base, lowestCompetitor: null })).toEqual({ price: null, reason: 'NO_COMPETITOR' });
      expect(suggestPrice({ ...base, lowestCompetitor: 1005 })).toEqual({ price: 1000, reason: 'ALREADY_THERE' });
    });
  });

  describe('listings and ranks', () => {
    it('one key for the same listing however the link is written', () => {
      const key = 'noon.com/iphone-15/n123/p';
      expect(listingKey('https://www.noon.com/egypt-en/iphone-15/N123/p/?o=abc#x')).toBe(key);
      expect(listingKey('https://www.amazon.eg/-/en/dp/B0ABC/')).toBe('amazon.eg/dp/b0abc');
      expect(listingKey('https://www.jumia.com.eg/ar/phone-123.html')).toBe('jumia.com.eg/phone-123.html');
      expect(listingKey('not a url')).toBeNull();
    });

    it('finds the position by link or store id', () => {
      const results = [
        { externalId: 'a', externalUrl: 'https://store.eg/a' },
        { externalId: 'b', externalUrl: 'https://store.eg/b?ref=1' },
        { externalId: 'c', externalUrl: 'https://store.eg/c' },
      ];
      expect(rankOf(results, { url: 'https://store.eg/b', externalId: null })).toBe(2);
      expect(rankOf(results, { url: null, externalId: 'c' })).toBe(3);
      expect(rankOf(results, { url: 'https://store.eg/z', externalId: null })).toBeNull();
    });
  });

  describe('CSV', () => {
    it('reads columns in any order, Arabic headers and quoted names', () => {
      const csv = '\uFEFFالسعر,sku,name,cost,url\r\n"1,200",A1,"Phone ""Pro""",900,https://store.eg/a\n\n,A2,Case,,\n';
      const { rows, errors } = parseProductsCsv(csv);
      expect(errors).toEqual([]);
      expect(rows).toEqual([
        { sku: 'A1', name: 'Phone "Pro"', cost: 900, price: 1200, url: 'https://store.eg/a' },
        { sku: 'A2', name: 'Case', cost: null, price: null, url: null },
      ]);
    });

    it('reports bad lines and keeps the good ones', () => {
      const { rows, errors } = parseProductsCsv('sku,name,price,url\nA,One,abc,\nB,,10,\nC,Three,10,nope\nD,Four,10,\nD,Again,10,');
      expect(rows.map((r) => r.sku)).toEqual(['D']);
      expect(errors.map((e) => e.line)).toEqual([2, 3, 4, 6]);
      expect(parseProductsCsv('name,price\nx,1').errors[0].line).toBe(1);
    });

    it('writes suggestions with quoting', () => {
      expect(suggestionsCsv([{ sku: 'A', name: 'a, b', currentPrice: 10, suggestedPrice: null, reason: 'NO_COMPETITOR' }])).toBe(
        'sku,name,current_price,suggested_price,reason\nA,"a, b",10,,NO_COMPETITOR',
      );
    });
  });
});
