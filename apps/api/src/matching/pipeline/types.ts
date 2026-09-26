import type { ExtractedAttributes, NormalizedTitle } from '../interfaces/matching.interfaces';
import type { FuzzyMatcherService } from '../fuzzy-matcher.service';
import type { NormalizerService } from '../normalizer.service';

/**
 * Types shared by the matching pipeline steps. They describe only what the
 * steps read, so a scraped `RetailerListing` and a `CanonicalProduct` row
 * satisfy them structurally, and a test can build them by hand.
 */

export interface ListingIdentifiers {
  gtin: string | null;
  upc: string | null;
  ean: string | null;
  mpn: string | null;
}

/** A listing as a store connector returns it (the fields matching reads). */
export interface ScrapedListing {
  title: string;
  /** Raw price in the store's own currency. The name is historical. */
  priceUsd: number | null;
  advertisedPrice?: number | null;
  currency: string;
  brand: string | null;
  model: string | null;
  identifiers: ListingIdentifiers;
}

/** A canonical product considered as a match (the fields matching reads). */
export interface CatalogCandidate {
  id: string;
  title: string;
  normalizedTitle: string;
  brand: string | null;
  model: string | null;
  gtin: string | null;
  upc: string | null;
  ean: string | null;
  mpn: string | null;
}

/** The stateless text tools every step uses. Real instances in tests too. */
export interface MatchingTools {
  normalizer: NormalizerService;
  fuzzy: FuzzyMatcherService;
}

/** Step 3's output: what the rest of the pipeline knows about the listing. */
export interface NormalizedListing<L extends ScrapedListing = ScrapedListing> {
  listing: L;
  normalized: NormalizedTitle;
  extracted: ExtractedAttributes;
}

/** A candidate that passed every conflict guard, with its rank score. */
export interface RankedCandidate<C extends CatalogCandidate = CatalogCandidate> {
  candidate: C;
  score: number;
}

/** What the candidate lookup knows about the listing, to fetch the products nearest to it. */
export interface CandidateHint {
  normalizedTitle: string;
  /** Lowercased model, when known. */
  model: string | null;
}

/**
 * Where step 6-9 candidates come from. Implemented over Prisma in the app.
 *
 * `findInCategory` returns the category's products nearest the listing: the
 * most similar titles plus every product of the same model, capped. The
 * steps never depend on the order it returns them in.
 */
export interface CandidateSource<C extends CatalogCandidate = CatalogCandidate> {
  findByIdentifier(identifiers: ListingIdentifiers): Promise<C | null>;
  findInCategory(categoryId: string, near: CandidateHint): Promise<C[]>;
}

/**
 * Step 9's second opinion. `true` = same product, `false` = different,
 * `null` = could not ask (not configured or unreachable).
 */
export interface SameProductJudge {
  judgeSameProduct(titleA: string, titleB: string): Promise<boolean | null>;
}
