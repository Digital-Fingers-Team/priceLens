import type { SourceListing } from '@/types/product.types';
import { bestDealIds } from './price';

/**
 * Offer ordering and grouping for the product page (audit 06, U-02..U-04).
 * Comparisons use priceUsd -- despite the name, the FX-normalized base
 * currency amount -- so offers in different currencies sort correctly.
 */

type Offer = Pick<SourceListing, 'id' | 'priceUsd' | 'inStock' | 'color'>;

function rank(offer: Offer): number {
  // Buyable offers with a price first, then unknown price, then sold out.
  if (offer.inStock === false) return 2;
  return offer.priceUsd != null && offer.priceUsd > 0 ? 0 : 1;
}

/** Cheapest buyable first; sold-out and unpriced offers after. Stable. */
export function sortOffers<T extends Offer>(offers: readonly T[]): T[] {
  return offers
    .map((offer, index) => ({ offer, index }))
    .sort((a, b) => {
      const r = rank(a.offer) - rank(b.offer);
      if (r !== 0) return r;
      const pa = a.offer.priceUsd ?? Number.POSITIVE_INFINITY;
      const pb = b.offer.priceUsd ?? Number.POSITIVE_INFINITY;
      return pa - pb || a.index - b.index;
    })
    .map(({ offer }) => offer);
}

/** Distinct colors named by the offers, in first-seen order, lower-cased. */
export function offerColors(offers: readonly Offer[]): string[] {
  const seen = new Set<string>();
  for (const offer of offers) {
    const color = offer.color?.trim().toLowerCase();
    if (color) seen.add(color);
  }
  return [...seen];
}

export function filterByColor<T extends Offer>(offers: readonly T[], color: string | null): T[] {
  if (!color) return [...offers];
  return offers.filter((offer) => offer.color?.trim().toLowerCase() === color);
}

/** The offer the "Cheapest at" line points to, or null when none is buyable. */
export function cheapestOffer<T extends Offer>(offers: readonly T[]): T | null {
  const best = bestDealIds(offers);
  return sortOffers(offers).find((offer) => best.has(offer.id)) ?? null;
}
