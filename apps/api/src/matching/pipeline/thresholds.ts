/**
 * Every number and word list the ingestion matcher decides with, in one
 * place. Tuning any of these changes which listings merge: re-run the
 * characterization suite (test/e2e/matching-characterization.e2e-spec.ts)
 * and review its snapshot diff.
 */

/**
 * Minimum combined fuzzy score (token overlap + Jaccard + edit similarity) for
 * merging a scraped listing into an existing canonical product from another
 * store when the LLM judge is unavailable. High on purpose: a wrong merge (two
 * different products shown as one) is worse than a missed merge (same product
 * shown twice).
 */
export const FUZZY_MATCH_THRESHOLD = 0.85;

/**
 * Score assigned to a survivor whose extracted model number exactly matches
 * the listing's. The auto-accept fast path uses the same constant, so the two
 * can't drift apart.
 */
export const MODEL_AGREEMENT_SCORE = 0.95;

/** How many ranked survivors the LLM judge is asked about, strongest first. */
export const MAX_JUDGED_CANDIDATES = 8;

/** Same-category canonical products loaded as candidates per listing. */
export const CANDIDATE_POOL_SIZE = 200;

/**
 * Listings that are never a real single-unit offer for the product they name:
 * sponsored result cards (Amazon pairs the ad title with some other item's
 * price), and wholesale "bulk order" / MOQ offers, whose title lists several
 * models and whose price is the lowest tier of a range. One of these created
 * an "RTX 5090" product at a fourteenth of the real price and was then shown
 * as its best deal.
 */
export const JUNK_LISTING_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\s*sponsored\b/i, 'sponsored result'],
  [/\bbulk\s+(?:order|buy|purchase|price)\b/i, 'bulk/wholesale offer'],
  [/\bmoq\b/i, 'bulk/wholesale offer'],
];

/**
 * A listing priced under this fraction of its category's median is not that
 * kind of product. Most products have a single store, so there is often no
 * other listing to compare a price against -- the category is the only
 * reference. It is a safety net for junk whose title gives nothing away (a
 * replacement screen listed as just "OPPO A35 HD" at 298 EGP); cases and
 * parts that say what they are are caught by the accessory rule first.
 *
 * Kept low because the median it is measured against moves: with the junk
 * cleaned out, the Smartphones median is ~16,900 EGP, so 2.5% (~420) still
 * admits the cheapest real phones (Nokia 105, ~510) with margin, and the
 * Graphics Cards floor (~1,030) the cheapest real cards (~1,600).
 */
export const CATEGORY_PRICE_FLOOR_RATIO = 0.025;
/** Below this many priced listings a category median is not trusted. */
export const MIN_LISTINGS_FOR_CATEGORY_FLOOR = 50;
/** How long a category median is reused before it is recomputed. */
export const CATEGORY_MEDIAN_TTL_MS = 60 * 60 * 1000;

/**
 * Categories whose products are devices, where a case, cable or screen is
 * never the product -- store searches for "smartphone" return cases too, and
 * each became a "smartphone" of its own. Left out on purpose: Headphones
 * ("with charging case"), Smart Watches ("aluminium case") and Home
 * Appliances ("stand mixer"), where the accessory words describe the product.
 */
export const DEVICE_CATEGORIES: ReadonlySet<string> = new Set([
  'smartphones',
  'tablets',
  'laptops',
  'tvs',
  'monitors',
  'cpus',
  'graphics cards',
]);
/**
 * Accessory wording alone is not enough: a real phone "with Free cover" says
 * "cover" too. Accessories are also cheap next to the devices around them, so
 * both must hold -- measured: 15% of the phone median (~2,500 EGP) is above
 * nearly every case and below nearly every phone.
 */
export const DEVICE_ACCESSORY_PRICE_RATIO = 0.15;
/** Wording only the device itself uses; a cheap feature phone "with charger" is still a phone. */
export const DESCRIBES_DEVICE = /\b(dual[\s-]?sim|keypad|feature\s+phone|\d+\s?gb\s+ram)\b/i;

/** Confidence stored when a listing joins an existing product. */
export const MATCHED_CONFIDENCE = 1;
/** Confidence stored when a listing founds a new product. */
export const NEW_PRODUCT_CONFIDENCE = 0.98;
