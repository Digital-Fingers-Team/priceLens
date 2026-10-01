/**
 * Second-hand price ranges from classifieds listings. Pure, so the guards are
 * tested directly. Only a listing's title and price are ever looked at; the
 * caller drops everything else before it gets here.
 */

export interface ClassifiedListing {
  title: string;
  price: number;
}

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Words that make a different model (iPhone 13 vs 13 Pro) in English and in
 * how Egyptian sellers write them in Arabic.
 */
const VARIANT_WORDS: Record<string, string[]> = {
  pro: ['pro', 'برو'],
  max: ['max', 'ماكس'],
  plus: ['plus', 'بلس'],
  mini: ['mini', 'ميني'],
  ultra: ['ultra', 'الترا', 'التر'],
  lite: ['lite', 'لايت'],
  fe: ['fe'],
};

/** Not the device itself: covers, screens, boxes, parts, "wanted" ads. */
const NOT_THE_DEVICE = ['cover', 'case', 'screen protector', 'glass', 'charger', 'box only', 'جراب', 'كفر', 'اسكرينه', 'سكرينه', 'شاحن', 'علبه فقط', 'قطع غيار', 'مطلوب', 'wanted', 'broken', 'مكسور', 'للقطع'];

/** "ايفون 13" in a listing should match a product queried as "iPhone 13". */
export function listingMatches(query: string, title: string): boolean {
  const q = normalize(query);
  const t = normalize(title);
  const qWords = new Set(q.split(' '));
  const tWords = t.split(' ');

  // Every number in the model (13, s25, 128...) must appear in the listing.
  for (const token of q.split(' ').filter((w) => /\d/.test(w))) {
    if (!tWords.some((w) => w === token || w.replace(/[^\d]/g, '') === token.replace(/[^\d]/g, ''))) return false;
  }
  // A variant word the product does not have means a different model.
  for (const [key, spellings] of Object.entries(VARIANT_WORDS)) {
    if (qWords.has(key)) continue;
    if (spellings.some((s) => tWords.includes(s))) return false;
  }
  if (NOT_THE_DEVICE.some((word) => ` ${t} `.includes(` ${word} `))) return false;
  return true;
}

export interface UsedRange {
  sampleSize: number;
  p25: number | null;
  median: number | null;
  p75: number | null;
}

export const MIN_USED_SAMPLE = 5;

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * The typical second-hand price: matching listings, then the middle of the
 * market (25th-75th percentile) after dropping prices far outside it (a
 * typo, a "1 EGP" placeholder, a new-in-box listing at retail). Too few
 * listings is an honest "no range".
 */
export function usedRange(query: string, listings: ClassifiedListing[], newPrice: number | null): UsedRange {
  const prices = listings
    .filter((l) => Number.isFinite(l.price) && l.price > 0 && listingMatches(query, l.title))
    // Above the new price is not a used price; under 10% of it is a placeholder.
    .filter((l) => newPrice === null || (l.price <= newPrice * 1.05 && l.price >= newPrice * 0.1))
    .map((l) => l.price)
    .sort((a, b) => a - b);

  if (prices.length < MIN_USED_SAMPLE) return { sampleSize: prices.length, p25: null, median: null, p75: null };

  const q1 = quantile(prices, 0.25);
  const q3 = quantile(prices, 0.75);
  const fence = (q3 - q1) * 1.5;
  const kept = prices.filter((p) => p >= q1 - fence && p <= q3 + fence);
  if (kept.length < MIN_USED_SAMPLE) return { sampleSize: kept.length, p25: null, median: null, p75: null };

  const round = (n: number) => Math.round(n / 50) * 50;
  return { sampleSize: kept.length, p25: round(quantile(kept, 0.25)), median: round(quantile(kept, 0.5)), p75: round(quantile(kept, 0.75)) };
}

/** What to search for: the brand and model as people write them, never the whole store title. */
export function usedQuery(product: { brand: string | null; model: string | null }): string | null {
  const model = product.model?.trim();
  if (!model || model.length < 2) return null;
  const brand = product.brand?.trim();
  if (!brand || normalize(model).includes(normalize(brand))) return model;
  // Apple's models carry no brand word ("iPhone 17"); others read better with it.
  return `${brand} ${model}`;
}
