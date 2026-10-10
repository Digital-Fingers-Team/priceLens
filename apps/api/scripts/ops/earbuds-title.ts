/** Earbuds and in-ear earphones, by title (English store titles). */
const EARBUDS = /\b(earbuds?|earphones?|in[-\s]ear|tws|airpods|freebuds|galaxy\s+buds\d*|redmi\s+buds\d*|nord\s+buds|xbuds|buds\s*\d*\s*(pro|lite|fe|ace|play|active|plus)?)\b/i;

/** A thing made for earbuds, not earbuds: cases, tips, batteries, spare parts, bundles with a phone. */
const FOR_EARBUDS =
  /\b(cases?|covers?|skins?|stickers?|silicone|shell|pouch|bag|tips|ear\s*tips|foam|hooks?|battery|batteries|replacement|spare|charging\s+(case|box)|charger|cable|adapter|holder|stand|strap|lanyard|cleaning|cleaner|earpiece|protective|protector|for\s+(airpods|freebuds|galaxy\s+buds|redmi\s+buds))\b/i;

/**
 * Something else that names earbuds: a phone or watch sold with them, a
 * speaker with TWS pairing, a phone with its storage (earbuds never state GB)
 * or with earbuds as a gift.
 */
const OTHER_DEVICE = /\b(speakers?|soundbar|watch|smartwatch|phone|smartphone|tablet|laptop|gift|\d+\s?(gb|tb))\b|\+/i;

/** Whether a product filed outside Headphones is itself a pair of earbuds or earphones. */
export function isMisfiledEarbuds(title: string): boolean {
  return EARBUDS.test(title) && !FOR_EARBUDS.test(title) && !OTHER_DEVICE.test(title);
}
