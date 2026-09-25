import type { ExtractedAttributes } from '../../interfaces/matching.interfaces';
import type { CatalogCandidate, MatchingTools, NormalizedListing } from '../types';
import { identifiersConflict } from './06-identifier-match';
import { ListingKeys, listingKeys } from './listing-keys';

/** Names of the guards, in the order they run. */
export type ConflictGuard =
  | 'brand'
  | 'accessory'
  | 'product-type'
  | 'chip'
  | 'variant'
  | 'model-code-suffix'
  | 'disjoint-model'
  | 'identifier'
  | 'condition'
  | 'storage'
  | 'ram'
  | 'display-size';

export type GuardResult =
  | { conflict: ConflictGuard }
  | { conflict: null; candidateExtracted: ExtractedAttributes };

/**
 * Step 8 -- conflict guards.
 *
 * Hard reasons a candidate is NOT the listing's product, whatever the text
 * similarity says. Returns the first guard that fires, or -- when none does
 * -- the candidate's attributes, extracted fresh from its title for step 9.
 *
 * Color is deliberately not a guard: one product covers every color of a
 * model/storage/RAM, and each store row shows its own color (owner decision
 * D-6). Stores name colors differently ("Black" / "Awesome Graphite"), so
 * splitting by color kept the same phone from ever lining up across stores.
 *
 * `keys` may be passed in when the caller checks many candidates for one
 * listing, to avoid recomputing them.
 */
export function checkConflicts(
  input: NormalizedListing,
  candidate: CatalogCandidate,
  { normalizer, fuzzy }: MatchingTools,
  keys: ListingKeys = listingKeys(input),
  listingIsAccessory: boolean = normalizer.isAccessory(input.listing.title),
): GuardResult {
  const { listing, extracted } = input;

  const candidateBrand = candidate.brand?.trim().toLowerCase() ?? null;
  if (candidateBrand && keys.brand && candidateBrand !== keys.brand) {
    return { conflict: 'brand' };
  }

  // An accessory's title routinely *names* the product it's compatible with
  // ("Case for Samsung Galaxy S26 Ultra") -- that would otherwise satisfy the
  // brand/model/title checks and merge a phone case into the phone.
  if (listingIsAccessory !== normalizer.isAccessory(candidate.title)) {
    return { conflict: 'accessory' };
  }

  // A laptop titled "... RTX 5050" and an "RTX 5050" card agree on model
  // number, which alone clears the auto-accept in step 9. Different kinds of
  // product are never the same product, whatever they share.
  if (fuzzy.detectProductTypeConflict(listing.title, candidate.title)) {
    return { conflict: 'product-type' };
  }

  // "MacBook Air M4" vs "MacBook Air M5": same brand and model name, and the
  // chip is too short for the model-code guards below to notice.
  if (fuzzy.detectChipConflict(listing.title, candidate.title)) {
    return { conflict: 'chip' };
  }

  if (fuzzy.detectVariantConflict(listing.title, candidate.title)) {
    return { conflict: 'variant' };
  }

  if (fuzzy.detectModelCodeSuffixConflict(listing.title, candidate.title)) {
    return { conflict: 'model-code-suffix' };
  }

  if (fuzzy.detectDisjointModelConflict(listing.title, candidate.title)) {
    return { conflict: 'disjoint-model' };
  }

  if (identifiersConflict(listing.identifiers, candidate)) {
    return { conflict: 'identifier' };
  }

  if (fuzzy.detectConditionConflict(listing.title, candidate.title)) {
    return { conflict: 'condition' };
  }

  // Recomputed fresh from the candidate's title rather than trusting its
  // stored `attributes` column, which can be stale or never populated for
  // older or previously merged rows.
  const candidateExtracted = normalizer.extractAttributes(candidate.title);
  if (fuzzy.detectStorageConflict(extracted.storage ?? undefined, candidateExtracted.storage)) {
    return { conflict: 'storage' };
  }
  if (fuzzy.detectRamConflict(extracted.ram ?? undefined, candidateExtracted.ram)) {
    return { conflict: 'ram' };
  }
  if (fuzzy.detectDisplaySizeConflict(extracted.displaySize ?? undefined, candidateExtracted.displaySize)) {
    return { conflict: 'display-size' };
  }

  return { conflict: null, candidateExtracted };
}
