import { isBelowPriceFloor, priceFloorFor } from '../../src/matching/pipeline';

describe('price floor (pipeline step 4b)', () => {
  it('uses the global floor when the category has none', () => {
    expect(priceFloorFor({ minPriceEgp: null }, 5000)).toBe(5000);
  });

  it('lets a category override it, 0 meaning no floor', () => {
    expect(priceFloorFor({ minPriceEgp: 0 }, 5000)).toBe(0);
    expect(priceFloorFor({ minPriceEgp: { toNumber: () => 12000 } }, 5000)).toBe(12000);
  });

  it('keeps a price exactly at the floor and drops one just under', () => {
    expect(isBelowPriceFloor(5000, 5000)).toBe(false);
    expect(isBelowPriceFloor(4999.99, 5000)).toBe(true);
  });

  it('never drops on a missing price (the price gate owns that)', () => {
    expect(isBelowPriceFloor(null, 5000)).toBe(false);
  });

  it('drops nothing when the floor is 0', () => {
    expect(isBelowPriceFloor(1, 0)).toBe(false);
  });
});
