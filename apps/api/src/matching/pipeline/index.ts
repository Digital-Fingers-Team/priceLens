/**
 * The ingestion matching pipeline: how one scraped listing becomes an offer
 * on a canonical product. Each step is a pure function (or, where it needs
 * I/O, takes that I/O as a parameter), so each can be tested alone.
 *
 *   1  price gate          hasUsablePrice          drop listings with no usable price
 *   2  junk filter         detectJunkListing       sponsored cards, wholesale lots
 *   3  normalize/extract   normalizeListing        normalized title + attributes
 *   4  currency            toBasePrices            store currency -> base (EGP)
 *   5  category sanity     checkCategorySanity     accessory-in-device-category, price floor
 *   6  identifier match    identifierLookupClauses GTIN/UPC/EAN/MPN lookup (+ identifiersConflict)
 *   7  exact-title match   findExactTitleMatch     same normalized title, no conflict
 *   8  conflict guards     checkConflicts          brand, accessory (+ kind), type, chip, variant, model code,
 *                                                  identifier, condition, bundle, model year, storage, RAM,
 *                                                  display size, quantity (volume/weight/pack)
 *   9  rank + decide       rankCandidates,         fuzzy score (+ model/code agreement), unknown-variant
 *                          decideMatch             ambiguity, deterministic ties, auto-accept, LLM confirm,
 *                                                  fuzzy fallback
 *  10  market outlier      checkMarketOutlier      price far from the product's other stores
 *
 * Steps 6-9 run together in findCanonicalMatch. Running the steps in order
 * and persisting the result is the scraping module's job. Thresholds live in
 * ./thresholds.ts.
 */
export * from './types';
export * from './thresholds';
export { hasUsablePrice } from './steps/01-price-gate';
export { detectJunkListing } from './steps/02-junk-filter';
export { normalizeListing } from './steps/03-normalize';
export { toBasePrices, keepAdvertisedPrice } from './steps/04-currency';
export type { ConvertToBase, BasePrices } from './steps/04-currency';
export { checkCategorySanity } from './steps/05-category-sanity';
export { identifierLookupClauses, identifiersConflict } from './steps/06-identifier-match';
export { findExactTitleMatch } from './steps/07-exact-title-match';
export { checkConflicts } from './steps/08-conflict-guards';
export type { ConflictGuard, GuardResult } from './steps/08-conflict-guards';
export { rankCandidates, decideMatch, capacityGb } from './steps/09-rank-and-decide';
export { checkMarketOutlier } from './steps/10-market-outlier';
export type { PricedOffer } from './steps/10-market-outlier';
export { findCanonicalMatch } from './find-canonical-match';
export { listingKeys } from './steps/listing-keys';
export type { ListingKeys } from './steps/listing-keys';
