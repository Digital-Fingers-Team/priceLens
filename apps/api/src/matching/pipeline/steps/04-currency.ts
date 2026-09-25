import type { ScrapedListing } from '../types';

/** Converts an amount in `currency` to the base currency (FxRatesService.convert). */
export type ConvertToBase = (amount: number, currency: string) => Promise<number | null>;

export interface BasePrices {
  /** The live price in the base currency; null when the listing has none. */
  price: number | null;
  /** The advertised "was" price in the base currency, kept only when above the live price. */
  advertisedPrice: number | null;
}

/**
 * Step 4 -- currency normalization.
 *
 * `listing.priceUsd`/`listing.currency` are the raw scraped amount in the
 * store's own currency. Converted once here to the base currency (EGP), so
 * every cross-store comparison, sort and merge decision compares like with
 * like. The raw amount is stored untouched next to it.
 */
export async function toBasePrices(listing: ScrapedListing, convert: ConvertToBase): Promise<BasePrices> {
  const price = listing.priceUsd != null ? await convert(listing.priceUsd, listing.currency) : null;
  const advertisedPrice =
    listing.advertisedPrice != null && price != null
      ? keepAdvertisedPrice(await convert(listing.advertisedPrice, listing.currency), price)
      : null;
  return { price, advertisedPrice };
}

/**
 * A "was" price is only a discount claim when it is above the live price;
 * anything else must not be stored as one.
 */
export function keepAdvertisedPrice(advertised: number | null, livePrice: number): number | null {
  return advertised != null && advertised > livePrice ? advertised : null;
}
