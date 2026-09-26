import { FuzzyMatcherService } from '../../src/matching/fuzzy-matcher.service';
import { NormalizerService } from '../../src/matching/normalizer.service';
import {
  CandidateSource,
  CatalogCandidate,
  ListingIdentifiers,
  MatchingTools,
  SameProductJudge,
  detectJunkListing,
  findCanonicalMatch,
  normalizeListing,
} from '../../src/matching/pipeline';
import type { GoldenListing } from './matching-golden.fixtures';

/**
 * Runs golden listings through matching steps 2, 3 and 6-9 exactly as
 * ingestion does (same functions, same order), with an in-memory catalog in
 * place of Postgres, and scores the outcome pairwise against the labels.
 *
 * The judge is "unavailable" (returns null), so step 9 uses its
 * deterministic fuzzy fallback. That is the conservative configuration:
 * with an LLM configured, only the judge can add merges on top of it.
 *
 * Steps 5 and 10 are left out on purpose: they reject by price against the
 * category and the product's other stores, which the golden set (titles
 * only) cannot exercise. They have their own unit tests.
 */

export interface GoldenScore {
  /** Pairs placed on one product that truly are one product. */
  truePositives: number;
  /** Pairs placed on one product that are different products (wrong merges). */
  falsePositives: number;
  /** Pairs of one product that ended up on different products (missed merges). */
  falseNegatives: number;
  precision: number;
  recall: number;
  /** Products holding listings of more than one truth (the F-17 symptom). */
  mixedProducts: number;
  wrongMerges: Array<[string, string]>;
  missedMerges: Array<[string, string]>;
  /** Listing id -> canonical product id (null when rejected before matching). */
  assignments: Map<string, string | null>;
}

const unavailableJudge: SameProductJudge = { judgeSameProduct: async () => null };

export function defaultTools(): MatchingTools {
  return { normalizer: new NormalizerService(), fuzzy: new FuzzyMatcherService() };
}

class MemoryCatalog implements CandidateSource<CatalogCandidate> {
  readonly products: Array<CatalogCandidate & { categoryId: string }> = [];

  async findByIdentifier(identifiers: ListingIdentifiers) {
    return (
      this.products.find((product) =>
        (['gtin', 'upc', 'ean', 'mpn'] as const).some((key) => identifiers[key] && product[key] === identifiers[key]),
      ) ?? null
    );
  }

  async findInCategory(categoryId: string) {
    return this.products.filter((product) => product.categoryId === categoryId);
  }
}

export async function runGolden(listings: GoldenListing[], tools: MatchingTools = defaultTools()): Promise<GoldenScore> {
  const catalog = new MemoryCatalog();
  const assignments = new Map<string, string | null>();

  for (const golden of listings) {
    if (detectJunkListing(golden.title)) {
      assignments.set(golden.id, null);
      continue;
    }
    const listing = {
      title: golden.title,
      priceUsd: 1000,
      currency: 'EGP',
      brand: golden.brand ?? null,
      model: null,
      identifiers: { gtin: golden.gtin ?? null, upc: null, ean: null, mpn: null },
    };
    const input = normalizeListing(listing, tools);
    const match = await findCanonicalMatch(input, golden.category, { candidates: catalog, judge: unavailableJudge }, tools);
    if (match) {
      assignments.set(golden.id, match.id);
      continue;
    }
    const id = `p${catalog.products.length + 1}`;
    catalog.products.push({
      id,
      categoryId: golden.category,
      title: golden.title,
      normalizedTitle: input.normalized.normalized,
      brand: listing.brand ?? input.extracted.brand ?? null,
      model: listing.model ?? input.extracted.model ?? null,
      gtin: listing.identifiers.gtin,
      upc: null,
      ean: null,
      mpn: null,
    });
    assignments.set(golden.id, id);
  }

  return score(listings, assignments);
}

function score(listings: GoldenListing[], assignments: Map<string, string | null>): GoldenScore {
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  const wrongMerges: Array<[string, string]> = [];
  const missedMerges: Array<[string, string]> = [];

  for (let i = 0; i < listings.length; i += 1) {
    for (let j = i + 1; j < listings.length; j += 1) {
      const a = listings[i];
      const b = listings[j];
      const productA = assignments.get(a.id) ?? null;
      const productB = assignments.get(b.id) ?? null;
      const predictedSame = productA !== null && productA === productB;
      const trulySame = a.truth === b.truth;
      if (predictedSame && trulySame) truePositives += 1;
      else if (predictedSame) {
        falsePositives += 1;
        wrongMerges.push([a.title, b.title]);
      } else if (trulySame) {
        falseNegatives += 1;
        missedMerges.push([a.title, b.title]);
      }
    }
  }

  const truthsByProduct = new Map<string, Set<string>>();
  for (const listing of listings) {
    const product = assignments.get(listing.id);
    if (!product) continue;
    const truths = truthsByProduct.get(product) ?? new Set<string>();
    truths.add(listing.truth);
    truthsByProduct.set(product, truths);
  }
  const mixedProducts = [...truthsByProduct.values()].filter((truths) => truths.size > 1).length;

  return {
    truePositives,
    falsePositives,
    falseNegatives,
    precision: truePositives + falsePositives === 0 ? 1 : truePositives / (truePositives + falsePositives),
    recall: truePositives + falseNegatives === 0 ? 1 : truePositives / (truePositives + falseNegatives),
    mixedProducts,
    wrongMerges,
    missedMerges,
    assignments,
  };
}
