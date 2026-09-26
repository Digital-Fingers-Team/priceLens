import { describe, expect, it } from 'vitest';
import { cheapestOffer, filterByColor, offerColors, sortOffers } from './offers';

const o = (id: string, priceUsd: number | null, inStock: boolean | null = true, color: string | null = null) => ({
  id,
  priceUsd,
  inStock,
  color,
});

describe('offers', () => {
  it('puts the cheapest buyable offer first and sold-out offers last', () => {
    const sorted = sortOffers([o('soldout', 100, false), o('b', 300), o('noprice', null), o('a', 200), o('unknown', 250, null)]);
    expect(sorted.map((x) => x.id)).toEqual(['a', 'unknown', 'b', 'noprice', 'soldout']);
  });

  it('keeps API order for equal prices', () => {
    expect(sortOffers([o('x', 100), o('y', 100)]).map((x) => x.id)).toEqual(['x', 'y']);
  });

  it('lists each color once, case-insensitively, in first-seen order', () => {
    expect(offerColors([o('1', 1, true, 'Navy'), o('2', 1, true, null), o('3', 1, true, 'navy'), o('4', 1, true, 'Lilac')])).toEqual([
      'navy',
      'lilac',
    ]);
  });

  it('filters by color, and null means all', () => {
    const offers = [o('1', 1, true, 'Navy'), o('2', 2, true, 'Lilac')];
    expect(filterByColor(offers, 'navy').map((x) => x.id)).toEqual(['1']);
    expect(filterByColor(offers, null)).toHaveLength(2);
  });

  it('cheapest ignores sold-out offers, and is null when nothing is buyable', () => {
    expect(cheapestOffer([o('cheap-but-gone', 50, false), o('ok', 80)])?.id).toBe('ok');
    expect(cheapestOffer([o('gone', 50, false)])).toBeNull();
  });
});
