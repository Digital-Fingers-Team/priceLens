import {
  FUZZY_MATCH_THRESHOLD,
  MAX_JUDGED_CANDIDATES,
  MODEL_AGREEMENT_SCORE,
} from '../thresholds';
import type {
  CatalogCandidate,
  MatchingTools,
  NormalizedListing,
  RankedCandidate,
  SameProductJudge,
} from '../types';
import { checkConflicts } from './08-conflict-guards';
import { listingKeys } from './listing-keys';

/**
 * Step 9a -- rank.
 *
 * Every candidate that passes the step 8 guards, scored by fuzzy title
 * similarity and sorted strongest first. The sort is stable: candidates with
 * equal scores keep the order they were given in.
 *
 * Retailers pad titles wildly differently ("Samsung Galaxy S26 - 256GB - Sky
 * Blue" vs "Samsung Galaxy S26, Unlocked Android Smartphone... Sky Blue"),
 * which tanks raw token overlap even for the same SKU. When the model number
 * agrees as well, that structured agreement is stronger evidence than the
 * text, so the score is raised to MODEL_AGREEMENT_SCORE. The candidate's
 * model falls back to a fresh extraction, because older rows predate model
 * extraction for several phone brands.
 *
 * Fuzzy text score is used rather than title embeddings on purpose: the
 * embedding model scored the same phone worded by two stores (~0.54) below
 * two different phones (~0.53) and a wrong-color variant near 1.0.
 */
export function rankCandidates<C extends CatalogCandidate>(
  input: NormalizedListing,
  candidates: C[],
  tools: MatchingTools,
): Array<RankedCandidate<C>> {
  const { normalizer, fuzzy } = tools;
  const { normalized } = input;
  const keys = listingKeys(input);
  const listingIsAccessory = normalizer.isAccessory(input.listing.title);

  const survivors: Array<RankedCandidate<C>> = [];
  for (const candidate of candidates) {
    const guard = checkConflicts(input, candidate, tools, keys, listingIsAccessory);
    if (guard.conflict !== null) {
      continue;
    }

    const candidateTitle = normalizer.normalizeTitle(candidate.title);
    const titleScore = fuzzy.combinedScore(
      normalized.normalized,
      normalized.tokens,
      candidateTitle.normalized,
      candidateTitle.tokens,
    );

    const candidateModel =
      candidate.model?.trim().toLowerCase() ?? guard.candidateExtracted.model?.trim().toLowerCase() ?? null;
    const modelsAgree = !!candidateModel && !!keys.model && candidateModel === keys.model;
    const score = modelsAgree ? Math.max(titleScore, MODEL_AGREEMENT_SCORE) : titleScore;

    survivors.push({ candidate, score });
  }

  return survivors.sort((a, b) => b.score - a.score);
}

/**
 * Step 9b -- decide.
 *
 * 1. The top survivor scores at least MODEL_AGREEMENT_SCORE: it cleared every
 *    guard and its model number matches, which is more reliable than the
 *    LLM (a small model rejected real duplicates worded differently). Accept.
 * 2. Otherwise ask the judge about the top MAX_JUDGED_CANDIDATES in order;
 *    the first "same" wins.
 * 3. If the judge could not be asked at all, fall back to the fuzzy score:
 *    accept the top survivor when it reaches FUZZY_MATCH_THRESHOLD.
 * 4. Otherwise no match: the listing founds a new product.
 */
export async function decideMatch<C extends CatalogCandidate>(
  listingTitle: string,
  ranked: Array<RankedCandidate<C>>,
  judge: SameProductJudge,
): Promise<C | null> {
  const top = ranked.slice(0, MAX_JUDGED_CANDIDATES);

  if (top.length > 0 && top[0].score >= MODEL_AGREEMENT_SCORE) {
    return top[0].candidate;
  }

  let judgeUnavailable = false;
  for (const { candidate } of top) {
    const verdict = await judge.judgeSameProduct(listingTitle, candidate.title);
    if (verdict === true) {
      return candidate;
    }
    if (verdict === null) {
      // Every remaining call would fail the same way.
      judgeUnavailable = true;
      break;
    }
  }

  if (judgeUnavailable && ranked.length > 0 && ranked[0].score >= FUZZY_MATCH_THRESHOLD) {
    return ranked[0].candidate;
  }

  return null;
}
