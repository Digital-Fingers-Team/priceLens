import { GOLDEN_HOLDOUT, GOLDEN_LISTINGS } from '../golden/matching-golden.fixtures';
import { oracleJudge, runGolden } from '../golden/golden-harness';

/**
 * The golden set in CI (audit 02, L-05). Precision is the number that must
 * not move: a wrong merge shows a shopper the price of a different product.
 * Recall floors are measurements; raise them when the matcher improves,
 * never lower them to make a change pass.
 *
 * Since 2026-09-29 the AI judge decides every step-9 merge (owner decision),
 * so recall is measured with a judge that knows the labels: it is the share
 * of true pairs whose product survives the guards and reaches the judge's
 * shortlist -- what the code rules still decide. Without a judge only
 * identifier and exact-title matches merge, and they must never be wrong.
 *
 * Measured at phase 02 (judge unavailable, fuzzy fallback, before the owner
 * decision): golden R 0.9333, holdout R 0.6250, precision 1.0 throughout.
 * Print the current numbers with: npx ts-node test/golden/report.ts --verbose
 */
describe('matching golden set', () => {
  it.each([
    ['forward', GOLDEN_LISTINGS],
    ['reversed', [...GOLDEN_LISTINGS].reverse()],
  ])('golden set, %s: the true product reaches the judge (recall at least 0.93), no wrong merges', async (_order, listings) => {
    const result = await runGolden(listings, undefined, oracleJudge(GOLDEN_LISTINGS));
    expect(result.wrongMerges).toEqual([]);
    expect(result.mixedProducts).toBe(0);
    expect(result.recall).toBeGreaterThanOrEqual(0.93);
  });

  it.each([
    ['forward', GOLDEN_HOLDOUT],
    ['reversed', [...GOLDEN_HOLDOUT].reverse()],
  ])('holdout set, %s: recall at least 0.62, no wrong merges', async (_order, listings) => {
    const result = await runGolden(listings, undefined, oracleJudge(GOLDEN_HOLDOUT));
    expect(result.wrongMerges).toEqual([]);
    expect(result.recall).toBeGreaterThanOrEqual(0.62);
  });

  it.each([
    ['golden', GOLDEN_LISTINGS],
    ['holdout', GOLDEN_HOLDOUT],
  ])('%s set without a judge: nothing merges on score alone, and nothing merges wrongly', async (_name, listings) => {
    const result = await runGolden(listings);
    expect(result.wrongMerges).toEqual([]);
    expect(result.mixedProducts).toBe(0);
  });

  it('keeps every Galaxy A57 RAM/storage variant on its own product (F-17)', async () => {
    const result = await runGolden(GOLDEN_LISTINGS, undefined, oracleJudge(GOLDEN_LISTINGS));
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
