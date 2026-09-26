import { findExactTitleMatch } from './steps/07-exact-title-match';
import { decideMatch, rankCandidates } from './steps/09-rank-and-decide';
import { listingKeys } from './steps/listing-keys';
import type {
  CandidateSource,
  CatalogCandidate,
  MatchingTools,
  NormalizedListing,
  SameProductJudge,
} from './types';

/**
 * Steps 6-9: the canonical product a listing belongs to, or null when it
 * should found a new one. The only I/O is behind the two ports: candidate
 * lookup and the same-product judge.
 */
export async function findCanonicalMatch<C extends CatalogCandidate>(
  input: NormalizedListing,
  categoryId: string,
  ports: { candidates: CandidateSource<C>; judge: SameProductJudge },
  tools: MatchingTools,
): Promise<C | null> {
  // Step 6: a shared identifier (GTIN/UPC/EAN/MPN) settles it.
  const identifierMatch = await ports.candidates.findByIdentifier(input.listing.identifiers);
  if (identifierMatch) {
    return identifierMatch;
  }

  const candidates = await ports.candidates.findInCategory(categoryId, {
    normalizedTitle: input.normalized.normalized,
    model: listingKeys(input).model,
  });

  // Step 7: same normalized title, no conflict.
  const exact = findExactTitleMatch(input, candidates, tools);
  if (exact) {
    return exact;
  }

  // Steps 8 + 9: guard, rank, decide.
  const ranked = rankCandidates(input, candidates, tools);
  return decideMatch(input.listing.title, ranked, ports.judge);
}
