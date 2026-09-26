import { describe, expect, it } from 'vitest';
import { bestDealIds } from './price';

const offer = (id: string, priceUsd: number | null, inStock: boolean | null = null) => ({ id, priceUsd, inStock });

describe('bestDealIds', () => {
  it('marks the cheapest offer', () => {
    expect(bestDealIds([offer('a', 300), offer('b', 250), offer('c', 400)])).toEqual(new Set(['b']));
  });

  it('never crowns a sold-out offer, even when it is cheapest', () => {
    expect(bestDealIds([offer('sold-out', 100, false), offer('b', 250, true)])).toEqual(new Set(['b']));
  });

  it('counts unknown stock as buyable (most stores never publish it)', () => {
    expect(bestDealIds([offer('unknown', 200, null), offer('b', 250, true)])).toEqual(new Set(['unknown']));
  });

  it('marks every offer tied at the lowest price', () => {
    expect(bestDealIds([offer('a', 250), offer('b', 250), offer('c', 300)])).toEqual(new Set(['a', 'b']));
  });

  it('marks nothing when no offer is buyable', () => {
    expect(bestDealIds([offer('a', null), offer('b', 0), offer('c', 90, false)])).toEqual(new Set());
    expect(bestDealIds([])).toEqual(new Set());
  });
});
