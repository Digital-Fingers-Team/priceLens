import type { MatchingTools, NormalizedListing, ScrapedListing } from '../types';

/**
 * Step 3 -- normalize and extract.
 *
 * The normalized title (lowercased, filler words removed, tokenized) and the
 * attributes read from the title, with the store's own brand/model/identifier
 * fields offered as structured hints.
 */
export function normalizeListing<L extends ScrapedListing>(
  listing: L,
  { normalizer }: Pick<MatchingTools, 'normalizer'>,
): NormalizedListing<L> {
  const normalized = normalizer.normalizeTitle(listing.title);
  const extracted = normalizer.extractAttributes(listing.title, {
    brand: listing.brand ?? undefined,
    model: listing.model ?? undefined,
    gtin: listing.identifiers.gtin ?? undefined,
    upc: listing.identifiers.upc ?? undefined,
    ean: listing.identifiers.ean ?? undefined,
    mpn: listing.identifiers.mpn ?? undefined,
  });
  return { listing, normalized, extracted };
}
