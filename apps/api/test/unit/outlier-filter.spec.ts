import {
  MIN_PRICES_FOR_OUTLIER_CHECK,
  OUTLIER_RATIO,
  filterPriceOutliers,
  filterMarketOutliers,
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

describe('market outlier filter', () => {
  type Offer = { store: string; value: number };
  const offer = (store: string, value: number): Offer => ({ store, value });
  const get = (item: Offer) => item.value;
  const storeOf = (item: Offer) => item.store;

  it('drops a far-too-cheap offer that one crowded store would have outvoted', () => {
    // The real Honor X9d page: eight Alibaba offers, one each at Noon and Amazon.
    const offers = [
      offer('alibaba', 8_412), offer('alibaba', 8_518),
      offer('alibaba', 20_250), offer('alibaba', 20_503), offer('alibaba', 20_503),
      offer('alibaba', 20_503), offer('alibaba', 20_876), offer('alibaba', 20_876),
      offer('noon', 24_299), offer('amazon', 24_666),
    ];
    const result = filterMarketOutliers(offers, get, storeOf);
    expect(result.excluded.map(get)).toEqual([8_412, 8_518]);
    expect(result.median).toBe(24_299);
  });

  it('keeps a genuine sale', () => {
    const result = filterMarketOutliers(
      [offer('a', 16_000), offer('b', 24_000), offer('c', 25_000)],
      get,
      storeOf,
    );
    expect(result.excluded).toHaveLength(0);
  });

  it('still drops an absurdly high offer', () => {
    const result = filterMarketOutliers(
      [offer('a', 24_000), offer('b', 25_000), offer('c', 90_000)],
      get,
      storeOf,
    );
    expect(result.excluded.map(get)).toEqual([90_000]);
  });

  it('does not judge two offers from one store', () => {
    const result = filterMarketOutliers([offer('a', 4_000), offer('a', 14_000)], get, storeOf);
    expect(result.excluded).toHaveLength(0);
  });

  it('falls back to one store\'s own listings when it is the only store', () => {
    const result = filterMarketOutliers(
      [offer('a', 3_000), offer('a', 12_000), offer('a', 13_000)],
      get,
      storeOf,
    );
    expect(result.excluded.map(get)).toEqual([3_000]);
  });

  it('never empties the set', () => {
    const result = filterMarketOutliers([offer('a', 1), offer('b', 1_000_000)], get, storeOf, 0.99, 1.01);
    expect(result.kept.length).toBeGreaterThan(0);
  });
});
