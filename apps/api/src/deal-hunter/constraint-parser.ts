/**
 * Turns "a laptop under 40,000 EGP with an RTX 4060" into structured
 * constraints.
 *
 * Deliberately deterministic rather than an LLM call. Three reasons:
 *   1. The competitive advantage is the price data, not the parsing. An LLM
 *      wrapper around someone else's catalogue is not a moat.
 *   2. It has to work on a deployment with no model API key configured, which
 *      is the current production state.
 *   3. A user needs to see and correct what was understood. A parse that can
 *      be shown as editable chips is worth more than one that cannot.
 *
 * Anything not recognised is returned in `unparsed` and used as free-text
 * search, so an unusual phrasing degrades to ordinary search rather than
 * silently dropping the user's words.
 */

export interface PriceConstraint {
  min: number | null;
  max: number | null;
}

export interface SpecConstraint {
  /** Which ExtractedAttributes field this matches against. */
  field: 'gpu' | 'cpu' | 'ram' | 'storage' | 'displaySize';
  /** Normalised value, e.g. "RTX 4060", "16GB". */
  value: string;
  /** The exact words the user typed, for display. */
  raw: string;
}

export interface ParsedQuery {
  price: PriceConstraint;
  /** Category slugs the wording points at. */
  categorySlugs: string[];
  brands: string[];
  specs: SpecConstraint[];
  /** Words we could not attribute to a constraint; used as free text. */
  unparsed: string;
  /** True when nothing at all was recognised. */
  isEmpty: boolean;
}

/** Category slug -> words that indicate it. */
const CATEGORY_TERMS: Record<string, string[]> = {
  laptops: ['laptop', 'laptops', 'notebook', 'ultrabook', 'macbook'],
  smartphones: ['phone', 'phones', 'smartphone', 'smartphones', 'mobile', 'iphone', 'galaxy'],
  televisions: ['tv', 'tvs', 'television', 'televisions'],
  monitors: ['monitor', 'monitors', 'display', 'screen'],
  'graphics-cards': ['gpu', 'graphics card', 'graphics cards', 'video card'],
  processors: ['cpu', 'processor', 'processors'],
  headphones: ['headphone', 'headphones', 'earbuds', 'earphones', 'headset'],
  tablets: ['tablet', 'tablets', 'ipad'],
  'smart-watches': ['smartwatch', 'smart watch', 'watch', 'watches'],
  'gaming-consoles': ['console', 'consoles', 'playstation', 'ps5', 'xbox', 'nintendo', 'switch'],
  'home-appliances': ['fridge', 'refrigerator', 'washing machine', 'washer', 'oven', 'microwave', 'air conditioner'],
};

/**
 * Brands worth recognising by name. Kept as a list rather than read from the
 * database so a brand appearing inside a product title (e.g. "Intel" in a
 * laptop name) cannot be mistaken for the user asking for that brand.
 */
const KNOWN_BRANDS = [
  'apple', 'samsung', 'lenovo', 'hp', 'dell', 'asus', 'acer', 'msi', 'huawei',
  'xiaomi', 'redmi', 'realme', 'oppo', 'vivo', 'nokia', 'infinix', 'tecno',
  'sony', 'lg', 'tcl', 'hisense', 'toshiba', 'sharp', 'philips', 'panasonic',
  'nvidia', 'amd', 'intel', 'gigabyte', 'zotac', 'palit', 'evga',
  'jbl', 'bose', 'anker', 'beats', 'sennheiser',
  'microsoft', 'google', 'oneplus', 'honor', 'nothing', 'dynabook', 'tornado',
  'zanussi', 'beko', 'unionaire', 'fresh', 'kiriazi', 'white point',
];

/** Multipliers for shorthand magnitudes. */
const MAGNITUDES: Record<string, number> = { k: 1_000, m: 1_000_000 };

const NUMBER = String.raw`(\d[\d,.\s]*)\s*(k|m)?`;

/**
 * Parses a number written the way people actually type prices: "40,000",
 * "40k", "40 000". Returns null for anything that is not a plausible price.
 */
function parseAmount(digits: string, magnitude?: string): number | null {
  // Strip separators. A trailing ".00" is a decimal, but "40.000" in many
  // locales means forty thousand -- treated as a separator only when it is
  // followed by exactly three digits and there is no other separator.
  let cleaned = digits.replace(/\s/g, '');

  if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) cleaned = cleaned.replace(/\./g, '');
  cleaned = cleaned.replace(/,/g, '');

  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;

  const scaled = magnitude ? value * (MAGNITUDES[magnitude.toLowerCase()] ?? 1) : value;
  // Guard against a model number being read as a price ("RTX 4060" is not
  // 4060 EGP). Callers only reach here through an explicit price phrase, but
  // an absurd value is still rejected.
  return scaled >= 1 && scaled <= 100_000_000 ? scaled : null;
}

function extractPrice(text: string): { price: PriceConstraint; consumed: string[] } {
  const consumed: string[] = [];
  let min: number | null = null;
  let max: number | null = null;

  const between = text.match(
    new RegExp(String.raw`(?:between|from)\s+${NUMBER}\s*(?:egp|le|جنيه)?\s*(?:and|to|-|–)\s*${NUMBER}`, 'i'),
  );
  if (between) {
    const low = parseAmount(between[1], between[2]);
    const high = parseAmount(between[3], between[4]);
    if (low != null && high != null) {
      min = Math.min(low, high);
      max = Math.max(low, high);
      consumed.push(between[0]);
    }
  }

  if (max == null) {
    const upper = text.match(
      new RegExp(
        String.raw`(?:under|below|less than|cheaper than|max|maximum|up to|no more than|within|<=?)\s*${NUMBER}`,
        'i',
      ),
    );
    if (upper) {
      const value = parseAmount(upper[1], upper[2]);
      if (value != null) {
        max = value;
        consumed.push(upper[0]);
      }
    }
  }

  if (min == null) {
    const lower = text.match(
      new RegExp(String.raw`(?:over|above|more than|at least|min|minimum|starting at|>=?)\s*${NUMBER}`, 'i'),
    );
    if (lower) {
      const value = parseAmount(lower[1], lower[2]);
      if (value != null) {
        min = value;
        consumed.push(lower[0]);
      }
    }
  }

  // A bare "... 40000 EGP" with no comparator reads as a budget ceiling,
  // which is how people write it.
  if (min == null && max == null) {
    const bare = text.match(new RegExp(String.raw`${NUMBER}\s*(?:egp|le\b|pounds?|جنيه)`, 'i'));
    if (bare) {
      const value = parseAmount(bare[1], bare[2]);
      if (value != null) {
        max = value;
        consumed.push(bare[0]);
      }
    }
  }

  return { price: { min, max }, consumed };
}

function extractSpecs(text: string): { specs: SpecConstraint[]; consumed: string[] } {
  const specs: SpecConstraint[] = [];
  const consumed: string[] = [];

  const add = (field: SpecConstraint['field'], value: string, raw: string) => {
    if (specs.some((spec) => spec.field === field && spec.value === value)) return;
    specs.push({ field, value, raw });
    consumed.push(raw);
  };

  // GPUs: "RTX 4060", "RTX4060 Ti", "GTX 1660", "RX 7800 XT".
  for (const match of text.matchAll(/\b(rtx|gtx|rx)\s*-?\s*(\d{3,4})\s*(ti|super|xt|xtx)?\b/gi)) {
    const suffix = match[3] ? ` ${match[3].toUpperCase()}` : '';
    add('gpu', `${match[1].toUpperCase()} ${match[2]}${suffix}`, match[0]);
  }

  // CPUs: "i7", "core i5", "Ryzen 7", "Ryzen 5 5600X", "M3 Pro".
  for (const match of text.matchAll(/\b(?:core\s*)?(i[3579])\b(?:[\s-]*(\d{4,5}[a-z]*))?/gi)) {
    add('cpu', match[2] ? `${match[1].toLowerCase()}-${match[2].toUpperCase()}` : match[1].toLowerCase(), match[0]);
  }
  for (const match of text.matchAll(/\bryzen\s*([3579])\b(?:\s*(\d{4}[a-z]*))?/gi)) {
    add('cpu', match[2] ? `Ryzen ${match[1]} ${match[2].toUpperCase()}` : `Ryzen ${match[1]}`, match[0]);
  }
  for (const match of text.matchAll(/\b(m[1234])\s*(pro|max|ultra)?\b/gi)) {
    const suffix = match[2] ? ` ${match[2][0].toUpperCase()}${match[2].slice(1).toLowerCase()}` : '';
    add('cpu', `${match[1].toUpperCase()}${suffix}`, match[0]);
  }

  // RAM must say so: a bare "16GB" is ambiguous with storage, so it is only
  // read as RAM when the word appears.
  for (const match of text.matchAll(/\b(\d{1,3})\s*gb\s*(?:of\s*)?(?:ram|memory)\b/gi)) {
    add('ram', `${match[1]}GB`, match[0]);
  }
  for (const match of text.matchAll(/\b(?:ram|memory)\s*(?:of\s*)?(\d{1,3})\s*gb\b/gi)) {
    add('ram', `${match[1]}GB`, match[0]);
  }

  // Storage: explicit, or a bare TB value (which is never RAM in this market).
  for (const match of text.matchAll(/\b(\d{3,4})\s*gb\s*(?:ssd|hdd|storage)\b/gi)) {
    add('storage', `${match[1]}GB`, match[0]);
  }
  for (const match of text.matchAll(/\b(\d(?:\.\d)?)\s*tb\b/gi)) {
    add('storage', `${match[1]}TB`, match[0]);
  }

  // Screen size: 15.6", 15.6 inch, 55-inch.
  for (const match of text.matchAll(/\b(\d{2}(?:\.\d)?)\s*(?:"|''|inch|inches|-inch)\b/gi)) {
    add('displaySize', `${match[1]} inch`, match[0]);
  }

  return { specs, consumed };
}

export function parseQuery(input: string): ParsedQuery {
  const original = (input ?? '').trim();
  const lower = original.toLowerCase();

  if (!original) {
    return { price: { min: null, max: null }, categorySlugs: [], brands: [], specs: [], unparsed: '', isEmpty: true };
  }

  // Specs first: an "RTX 4060" must be claimed before price parsing can see
  // a bare 4060 and mistake it for a budget.
  const { specs, consumed: specConsumed } = extractSpecs(lower);
  let remaining = lower;
  for (const phrase of specConsumed) remaining = remaining.replace(phrase.toLowerCase(), ' ');

  const { price, consumed: priceConsumed } = extractPrice(remaining);
  for (const phrase of priceConsumed) remaining = remaining.replace(phrase.toLowerCase(), ' ');

  const categorySlugs: string[] = [];
  for (const [slug, terms] of Object.entries(CATEGORY_TERMS)) {
    // Longest term first so "graphics card" is matched before "card".
    const sorted = [...terms].sort((a, b) => b.length - a.length);
    for (const term of sorted) {
      const pattern = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (pattern.test(remaining)) {
        if (!categorySlugs.includes(slug)) categorySlugs.push(slug);
        remaining = remaining.replace(pattern, ' ');
        break;
      }
    }
  }

  const brands: string[] = [];
  for (const brand of KNOWN_BRANDS) {
    const pattern = new RegExp(`\\b${brand.replace(/\s/g, '\\s+')}\\b`, 'i');
    if (pattern.test(remaining)) {
      brands.push(brand);
      remaining = remaining.replace(pattern, ' ');
    }
  }

  // Filler that carries no search value and would only dilute a text match.
  const unparsed = remaining
    .replace(
      /\b(i|need|want|looking|for|a|an|the|with|and|or|my|me|some|good|best|new|please|show|find|get|buy|egp|le|pounds?|budget|around|about)\b/gi,
      ' ',
    )
    .replace(/[^\p{L}\p{N}\s.+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    price,
    categorySlugs,
    brands,
    specs,
    unparsed,
    isEmpty:
      price.min == null &&
      price.max == null &&
      categorySlugs.length === 0 &&
      brands.length === 0 &&
      specs.length === 0 &&
      unparsed.length === 0,
  };
}
