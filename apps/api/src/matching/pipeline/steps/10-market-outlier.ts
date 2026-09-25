import { filterMarketOutliers } from '../../../intelligence/price-statistics';

export interface PricedOffer {
  /** Base-currency price. */
  price: number;
  /** Store (platform) id: several listings from one store count as one voice. */
  store: string;
}

export interface MarketOutlierResult {
  outlier: boolean;
  median: number | null;
}

/**
 * Step 10 -- market-outlier check.
 *
 * Title matching can agree on brand and model number and still be wrong -- a
 * spare part, a fake, or a different tier of a wholesale range all name the
 * product they are not. A price far outside what every other store charges
 * is the one signal those cannot fake. `others` are the product's other
 * accepted, priced listings.
 */
export function checkMarketOutlier(self: PricedOffer, others: PricedOffer[]): MarketOutlierResult {
  const prices = [
    ...others.map((other) => ({ ...other, self: false })),
    { ...self, self: true },
  ];
  const { excluded, median } = filterMarketOutliers(
    prices,
    (entry) => entry.price,
    (entry) => entry.store,
  );
  return { outlier: excluded.some((entry) => entry.self), median };
}
