import type { NormalizedListing } from '../types';

export interface ListingKeys {
  /** Lowercased brand: the store's field first, then the one read from the title. */
  brand: string | null;
  /** Lowercased model: the store's field first, then the one read from the title. */
  model: string | null;
}

/** The brand and model a listing is compared on in steps 7-9. */
export function listingKeys({ listing, extracted }: NormalizedListing): ListingKeys {
  return {
    brand: listing.brand?.trim().toLowerCase() ?? extracted.brand?.trim().toLowerCase() ?? null,
    model: listing.model?.trim().toLowerCase() ?? extracted.model?.trim().toLowerCase() ?? null,
  };
}
