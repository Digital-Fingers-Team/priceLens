import type { CatalogCandidate, MatchingTools, NormalizedListing } from '../types';
import { checkConflicts } from './08-conflict-guards';
import { listingKeys } from './listing-keys';

/**
 * Step 7 -- exact-title match.
 *
 * A candidate whose normalized title equals the listing's, unless the stores'
 * model fields disagree or any step 8 guard says otherwise. (Normalization drops words such as "bundle", "kit"
 * and "new", so equal normalized titles can still be different products.)
 * When several qualify, the lowest id wins, so the outcome never depends on
 * the order the database returned them in.
 */
export function findExactTitleMatch<C extends CatalogCandidate>(
  input: NormalizedListing,
  candidates: C[],
  tools: MatchingTools,
): C | null {
  const keys = listingKeys(input);
  const listingIsAccessory = tools.normalizer.isAccessory(input.listing.title);
  let best: C | null = null;

  for (const candidate of candidates) {
    if (candidate.normalizedTitle.trim().toLowerCase() !== input.normalized.normalized) {
      continue;
    }
    const candidateModel = candidate.model?.trim().toLowerCase() || null;
    if (candidateModel && keys.model && candidateModel !== keys.model) {
      continue;
    }
    if (checkConflicts(input, candidate, tools, keys, listingIsAccessory).conflict !== null) {
      continue;
    }
    if (!best || candidate.id < best.id) {
      best = candidate;
    }
  }

  return best;
}
