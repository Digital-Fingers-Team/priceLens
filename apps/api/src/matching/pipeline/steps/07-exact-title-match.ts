import type { CatalogCandidate, MatchingTools, NormalizedListing } from '../types';
import { identifiersConflict } from './06-identifier-match';
import { listingKeys } from './listing-keys';

/**
 * Step 7 -- exact-title match.
 *
 * The first candidate whose normalized title equals the listing's, unless
 * brand, model, identifiers, condition (new vs used) or product type say
 * otherwise. Candidates are tried in the order given.
 */
export function findExactTitleMatch<C extends CatalogCandidate>(
  input: NormalizedListing,
  candidates: C[],
  { fuzzy }: Pick<MatchingTools, 'fuzzy'>,
): C | null {
  const { listing, normalized } = input;
  const keys = listingKeys(input);

  for (const candidate of candidates) {
    if (candidate.normalizedTitle.trim().toLowerCase() !== normalized.normalized) {
      continue;
    }

    const candidateBrand = candidate.brand?.trim().toLowerCase() ?? null;
    if (candidateBrand && keys.brand && candidateBrand !== keys.brand) {
      continue;
    }

    const candidateModel = candidate.model?.trim().toLowerCase() ?? null;
    if (candidateModel && keys.model && candidateModel !== keys.model) {
      continue;
    }

    if (identifiersConflict(listing.identifiers, candidate)) {
      continue;
    }

    if (fuzzy.detectConditionConflict(listing.title, candidate.title)) {
      continue;
    }

    if (fuzzy.detectProductTypeConflict(listing.title, candidate.title)) {
      continue;
    }

    return candidate;
  }

  return null;
}
