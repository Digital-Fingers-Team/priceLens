import type { ExtractedAttributes } from '../../interfaces/matching.interfaces';
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
import { ListingKeys, listingKeys } from './listing-keys';

/** The variant dimensions a title may leave out. */
const VARIANT_DIMENSIONS = ['ram', 'storage'] as const;
type VariantDimension = (typeof VARIANT_DIMENSIONS)[number];

interface Survivor<C extends CatalogCandidate> extends RankedCandidate<C> {
  extracted: ExtractedAttributes;
  /** How many variant dimensions both sides state (and, having passed step 8, agree on). */
  statedOnBoth: number;
}

/**
 * Step 9a -- rank.
 *
 * Every candidate that passes the step 8 guards, scored by fuzzy title
 * similarity, with ambiguous variants removed, strongest first.
 *
 * Retailers pad titles wildly differently ("Samsung Galaxy S26 - 256GB - Sky
 * Blue" vs "Samsung Galaxy S26, Unlocked Android Smartphone... Sky Blue"),
 * which tanks raw token overlap even for the same SKU. When the model number
 * agrees, or both titles carry the same strong product code ("24U411A-B"),
 * that structured agreement is stronger evidence than the text, so the score
 * is raised to MODEL_AGREEMENT_SCORE. The candidate's model falls back to a
 * fresh extraction, because older rows predate model extraction for several
 * phone brands.
 *
 * Unknown variants (F-17). A title that does not state its RAM (or storage)
 * passes the RAM guard against every product. When the model exists in
 * several RAM sizes, picking one would be a guess -- the Galaxy A57 8GB and
 * 12GB products merged exactly this way. So, per dimension:
 *  - the listing states it: products that do not state it are dropped. Such
 *    a product may be any variant, and once a known-variant listing joins it,
 *    listings of every other variant would follow.
 *  - the listing does not state it, and the model's products state two or
 *    more different values: products that state it are dropped (the listing
 *    may still join a product that does not state it either, or found one).
 *    With exactly one known value the listing may join it: one offer may be
 *    misplaced if it is really an unseen variant, but nothing else follows.
 * "The model's products" are the candidates with the same brand, model and
 * tier, before the step 8 guards, so a 12GB product that the RAM guard
 * removed still counts as evidence that 12GB exists.
 *
 * Accessories get no model-agreement boost: for them the model is the phone
 * they fit, and every case for the Galaxy A57 agrees on it.
 *
 * Ties are broken by how many variant dimensions both sides state, then by
 * candidate id, so the result never depends on the order the database
 * returned the candidates in.
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
  const listingText = normalizer.matchingText(input.listing.title);

  const survivors: Array<Survivor<C>> = [];
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

    const candidateModel = modelOf(candidate, guard.candidateExtracted);
    const modelsAgree = !!candidateModel && !!keys.model && candidateModel === keys.model;
    const codesAgree = fuzzy.sharesStrongModelCode(listingText, normalizer.matchingText(candidate.title));
    const score =
      (modelsAgree || codesAgree) && !listingIsAccessory ? Math.max(titleScore, MODEL_AGREEMENT_SCORE) : titleScore;

    const statedOnBoth = VARIANT_DIMENSIONS.filter(
      (dimension) => input.extracted[dimension] && guard.candidateExtracted[dimension],
    ).length;
    survivors.push({ candidate, score, extracted: guard.candidateExtracted, statedOnBoth });
  }

  const unambiguous = dropAmbiguousVariants(input, survivors, candidates, tools, keys, listingIsAccessory);

  return unambiguous
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.statedOnBoth - a.statedOnBoth ||
        (a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0),
    )
    .map(({ candidate, score }) => ({ candidate, score }));
}

function modelOf(candidate: CatalogCandidate, extracted: ExtractedAttributes): string | null {
  return candidate.model?.trim().toLowerCase() || extracted.model?.trim().toLowerCase() || null;
}

/** A capacity string as a number of GB ("1TB" -> 1000), or null when unreadable. */
export function capacityGb(value: string | undefined | null): number | null {
  if (!value) return null;
  const match = /(\d+(?:\.\d+)?)\s*(tb|gb|mb)?/i.exec(value);
  if (!match) return null;
  const amount = parseFloat(match[1]);
  const unit = (match[2] ?? 'gb').toLowerCase();
  return unit === 'tb' ? amount * 1000 : unit === 'mb' ? amount / 1000 : amount;
}

/**
 * The values each variant dimension takes across the listing's model family:
 * candidates of the same brand, model, tier, condition and accessory-ness.
 * Without a model on the listing, the family is the survivors themselves.
 */
function familyValues<C extends CatalogCandidate>(
  input: NormalizedListing,
  survivors: Array<Survivor<C>>,
  candidates: C[],
  { normalizer, fuzzy }: MatchingTools,
  keys: ListingKeys,
  listingIsAccessory: boolean,
): Record<VariantDimension, Set<number>> {
  const values: Record<VariantDimension, Set<number>> = { ram: new Set(), storage: new Set() };
  const add = (extracted: ExtractedAttributes) => {
    for (const dimension of VARIANT_DIMENSIONS) {
      const gb = capacityGb(extracted[dimension]);
      if (gb !== null) values[dimension].add(gb);
    }
  };

  if (!keys.model) {
    survivors.forEach((survivor) => add(survivor.extracted));
    return values;
  }

  const listingText = normalizer.matchingText(input.listing.title);
  for (const candidate of candidates) {
    const brand = candidate.brand?.trim().toLowerCase() ?? null;
    if (brand && keys.brand && brand !== keys.brand) continue;
    if (normalizer.isAccessory(candidate.title) !== listingIsAccessory) continue;
    const candidateText = normalizer.matchingText(candidate.title);
    if (fuzzy.detectVariantConflict(listingText, candidateText)) continue;
    if (fuzzy.detectConditionConflict(listingText, candidateText)) continue;
    if (fuzzy.detectProductTypeConflict(listingText, candidateText)) continue;
    const extracted = normalizer.extractAttributes(candidate.title);
    if (modelOf(candidate, extracted) !== keys.model) continue;
    add(extracted);
  }
  return values;
}

function dropAmbiguousVariants<C extends CatalogCandidate>(
  input: NormalizedListing,
  survivors: Array<Survivor<C>>,
  candidates: C[],
  tools: MatchingTools,
  keys: ListingKeys,
  listingIsAccessory: boolean,
): Array<Survivor<C>> {
  if (survivors.length === 0) return survivors;
  const family = familyValues(input, survivors, candidates, tools, keys, listingIsAccessory);

  let kept = survivors;
  for (const dimension of VARIANT_DIMENSIONS) {
    const own = capacityGb(input.extracted[dimension]);
    const known = family[dimension];
    if (own !== null) {
      kept = kept.filter((survivor) => capacityGb(survivor.extracted[dimension]) !== null);
    } else if (known.size >= 2) {
      kept = kept.filter((survivor) => capacityGb(survivor.extracted[dimension]) === null);
    }
  }
  return kept;
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
