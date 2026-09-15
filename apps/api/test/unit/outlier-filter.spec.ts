import {
  MIN_PRICES_FOR_OUTLIER_CHECK,
  OUTLIER_RATIO,
  filterPriceOutliers,
} from '../../src/intelligence/price-statistics';

const price = (value: number) => ({ value });
const get = (item: { value: number }) => item.value;

describe('price outlier filter', () => {
  it('drops an accessory mis-matched onto a product', () => {
    // The real case from production: a 4,123 listing on a ~14,000 product.
    const result = filterPriceOutliers(
      [price(4_123), price(12_460), price(14_800), price(14_999)],
      get,
    );

    expect(result.excluded.map(get)).toEqual([4_123]);
    expect(result.kept.map(get)).toEqual([12_460, 14_800, 14_999]);
  });

  it('drops an absurdly high mismatch too', () => {
    const result = filterPriceOutliers(
      [price(12_000), price(13_000), price(14_000), price(90_000)],
      get,
    );
    expect(result.excluded.map(get)).toEqual([90_000]);
  });

  it('keeps a genuine clearance price', () => {
    // 30% off is a sale, not a mismatch, and must survive.
    const result = filterPriceOutliers([price(9_800), price(13_500), price(14_000)], get);
    expect(result.excluded).toHaveLength(0);
  });

  it('does not filter when there is too little to judge against', () => {
    // With two prices there is no way to tell which one is wrong.
    const result = filterPriceOutliers([price(4_000), price(14_000)], get);
    expect(result.excluded).toHaveLength(0);
    expect(result.kept).toHaveLength(2);
    expect(MIN_PRICES_FOR_OUTLIER_CHECK).toBe(3);
  });

  it('never empties the set', () => {
    // If the rule would remove everything, the median was untrustworthy and
    // returning nothing would be worse than returning the raw data.
    const result = filterPriceOutliers([price(1), price(1_000_000), price(2)], get, 1.0001);
    expect(result.kept.length).toBeGreaterThan(0);
  });

  it('reports the median it judged against', () => {
    const result = filterPriceOutliers([price(10_000), price(12_000), price(14_000)], get);
    expect(result.median).toBe(12_000);
  });

  it('respects the configured ratio', () => {
    const justInside = 12_000 * (OUTLIER_RATIO - 0.1);
    const result = filterPriceOutliers(
      [price(11_000), price(12_000), price(13_000), price(justInside)],
      get,
    );
    expect(result.excluded).toHaveLength(0);
  });

  it('treats a zero or negative price as an outlier', () => {
    const result = filterPriceOutliers([price(0), price(12_000), price(13_000), price(14_000)], get);
    expect(result.excluded.map(get)).toEqual([0]);
  });
});
