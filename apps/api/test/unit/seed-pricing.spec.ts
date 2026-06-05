import { storeDefinitions } from '../../seed/factories/storeFactory';
import { createPriceHistoryRows } from '../../seed/factories/priceHistoryFactory';
import type { ListingSeed, SeedConfig } from '../../seed/types';
import { listingPrice, priceForProduct } from '../../seed/utils/pricing';
import { SeededRandom } from '../../seed/utils/random';

describe('seed pricing', () => {
  it('applies realistic attribute multipliers', () => {
    const base = priceForProduct(999, { storage: '1TB', ram: '32GB', variant: 'Pro Max' }, 'laptops');
    expect(base).toBeGreaterThan(999);
    expect(base).toBeLessThan(3000);
  });

  it('keeps listing prices near the product base price', () => {
    const amazon = storeDefinitions[0];
    const price = listingPrice(1200, amazon, 'smartphones', new Date('2026-06-05T00:00:00Z'), new SeededRandom('price'));
    expect(price).toBeGreaterThan(900);
    expect(price).toBeLessThan(1400);
  });

  it('generates bounded historical prices with discounts', () => {
    const config: SeedConfig = {
      profile: 'demo',
      seedVersion: 'test',
      seedNamespace: '7c34be4a-2a51-4a1d-b2c1-f7e6d916ca27',
      productTarget: 1,
      listingsPerProduct: 1,
      challengeListingTarget: 0,
      historyRowsPerListing: 40,
      batchSize: 10,
      reset: false,
      resume: true,
      now: new Date('2026-06-05T00:00:00Z'),
      logInterval: 10,
    };
    const listing = {
      id: 'listing-id',
      canonicalProductId: 'product-id',
      priceUsd: 1000,
    } as ListingSeed;

    const rows = createPriceHistoryRows(listing, 'smartphones', config);

    expect(rows).toHaveLength(40);
    expect(Math.min(...rows.map((row) => row.priceUsd))).toBeGreaterThan(700);
    expect(Math.max(...rows.map((row) => row.priceUsd))).toBeLessThan(1300);
    expect(rows.some((row) => row.originalPrice != null)).toBe(true);
  });
});
