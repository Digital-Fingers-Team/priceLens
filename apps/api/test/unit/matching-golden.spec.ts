import { GOLDEN_HOLDOUT, GOLDEN_LISTINGS } from '../golden/matching-golden.fixtures';
import { runGolden } from '../golden/golden-harness';

/**
 * The golden set in CI (audit 02, L-05). Precision is the number that must
 * not move: a wrong merge shows a shopper the price of a different product.
 * Recall floors are the phase 02 measurements; raise them when the matcher
 * improves, never lower them to make a change pass.
 *
 * Measured at phase 02 (judge unavailable, fuzzy fallback):
 *   golden   forward  P 1.0000 R 0.9333 | reversed P 1.0000 R 0.9333
 *   holdout  forward  P 1.0000 R 0.6250 | reversed P 1.0000 R 0.6250
 *   before phase 02:  golden P 0.5234 R 0.5333 (reversed P 0.4758 R 0.5619),
 *                     holdout P 1.0000 R 0.1250
 * Print the current numbers with: npx ts-node test/golden/report.ts --verbose
 */
describe('matching golden set', () => {
  it.each([
    ['forward', GOLDEN_LISTINGS],
    ['reversed', [...GOLDEN_LISTINGS].reverse()],
  ])('golden set, %s: no wrong merges, recall at least 0.93', async (_order, listings) => {
    const result = await runGolden(listings);
    expect(result.wrongMerges).toEqual([]);
    expect(result.precision).toBe(1);
    expect(result.mixedProducts).toBe(0);
    expect(result.recall).toBeGreaterThanOrEqual(0.93);
  });

  it.each([
    ['forward', GOLDEN_HOLDOUT],
    ['reversed', [...GOLDEN_HOLDOUT].reverse()],
  ])('holdout set, %s: no wrong merges, recall at least 0.62', async (_order, listings) => {
    const result = await runGolden(listings);
    expect(result.wrongMerges).toEqual([]);
    expect(result.recall).toBeGreaterThanOrEqual(0.62);
  });

  it('keeps every Galaxy A57 RAM/storage variant on its own product (F-17)', async () => {
    const result = await runGolden(GOLDEN_LISTINGS);
    const a57 = GOLDEN_LISTINGS.filter((listing) => /^a57-/.test(listing.truth));
    const productsByTruth = new Map<string, Set<string | null>>();
    for (const listing of a57) {
      const products = productsByTruth.get(listing.truth) ?? new Set();
      products.add(result.assignments.get(listing.id) ?? null);
      productsByTruth.set(listing.truth, products);
    }
    // Each variant on exactly one product...
    for (const [truth, products] of productsByTruth) {
      expect({ truth, products: products.size }).toEqual({ truth, products: 1 });
    }
    // ...and no two variants on the same one.
    const firstProducts = [...productsByTruth.values()].map((products) => [...products][0]);
    expect(new Set(firstProducts).size).toBe(productsByTruth.size);
  });
});
