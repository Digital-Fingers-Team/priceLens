// apps/api/src/matching/fuzzy-matcher.service.ts
import { Injectable } from '@nestjs/common';
import { extractModelYear, extractQuantitySpec, isBundle } from './text/specs';
import { spellOutPlusTier } from './text/tier';

@Injectable()
export class FuzzyMatcherService {

  /**
   * Compute Levenshtein distance between two strings.
   * Uses the classic DP approach with row-optimization.
   */
  levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,  // substitution
            matrix[i][j - 1] + 1,      // insertion
            matrix[i - 1][j] + 1,      // deletion
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  /**
   * Normalized edit similarity: 1.0 = identical, 0.0 = completely different.
   */
  editSimilarity(a: string, b: string): number {
    if (a === b) return 1.0;
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1.0;
    return 1 - this.levenshtein(a, b) / maxLen;
  }

  /**
   * Jaccard similarity over token sets.
   * Good for bag-of-words comparison ignoring order.
   */
  jaccardSimilarity(tokensA: string[], tokensB: string[]): number {
    const setA = new Set(tokensA);
    const setB = new Set(tokensB);
    const intersection = new Set([...setA].filter((x) => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    if (union.size === 0) return 1.0;
    return intersection.size / union.size;
  }

  /**
   * Token overlap (F1-like measure).
   * Precision + Recall of token matching, penalizes extra tokens.
   */
  tokenOverlap(tokensA: string[], tokensB: string[]): number {
    const setA = new Set(tokensA);
    const setB = new Set(tokensB);

    const intersection = [...setA].filter((x) => setB.has(x)).length;
    const precision = setB.size > 0 ? intersection / setB.size : 0;
    const recall = setA.size > 0 ? intersection / setA.size : 0;

    if (precision + recall === 0) return 0;
    return (2 * precision * recall) / (precision + recall);
  }

  /**
   * Combined fuzzy score — weighted blend of edit similarity,
   * Jaccard on tokens, and critical token matching.
   */
  combinedScore(
    normalizedA: string,
    tokensA: string[],
    normalizedB: string,
    tokensB: string[],
  ): number {
    const editScore = this.editSimilarity(normalizedA, normalizedB);
    const jaccardScore = this.jaccardSimilarity(tokensA, tokensB);
    const overlapScore = this.tokenOverlap(tokensA, tokensB);

    // Weighted: token overlap most important, edit distance as tiebreaker
    return editScore * 0.2 + jaccardScore * 0.3 + overlapScore * 0.5;
  }

  /**
   * Check if two strings refer to different variants of the same product.
   * Returns a flag description if they differ in a critical attribute.
   * 
   * IMPORTANT: This prevents RTX 4080 from matching RTX 4080 Super,
   * or iPhone 15 Pro from matching iPhone 15 Pro Max.
   */
  detectVariantConflict(titleA: string, titleB: string): string | null {
    const VARIANT_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
      { name: 'variant_suffix', pattern: /\b(XT X|XTX|Super|Ti|GRE|XT)\b/i },
      { name: 'pro_tier', pattern: /\b(Pro Max|Pro Plus|Ultra|Plus|Pro|Max)\b/i },
      { name: 'mini_se', pattern: /\b(Mini|Lite|SE)\b/i },
    ];

    // "Pro+" is its own tier, not "Pro" (see spellOutPlusTier).
    const textA = spellOutPlusTier(titleA);
    const textB = spellOutPlusTier(titleB);
    for (const { name, pattern } of VARIANT_PATTERNS) {
      const matchA = (pattern.exec(textA) ?? [])[0]?.toLowerCase();
      const matchB = (pattern.exec(textB) ?? [])[0]?.toLowerCase();

      // Both have variant but different ones → conflict
      if (matchA && matchB && matchA !== matchB) return `${name}_conflict`;
      // One has variant, other doesn't → conflict
      if (matchA && !matchB) return `${name}_missing_in_candidate`;
      if (!matchA && matchB) return `${name}_missing_in_source`;
    }

    return null;
  }

  /**
   * Detect conflicting storage values.
   * 512GB ≠ 1TB — these are different SKUs and must NOT be merged.
   */
  detectStorageConflict(storageA?: string, storageB?: string): string | null {
    if (!storageA || !storageB) return null;
    return this.normalizeStorage(storageA) !== this.normalizeStorage(storageB)
      ? 'storage_conflict'
      : null;
  }

  /**
   * Detect conflicting RAM values.
   */
  detectRamConflict(ramA?: string, ramB?: string): string | null {
    if (!ramA || !ramB) return null;
    const normalizeRam = (r: string) => parseInt(r.replace(/\D/g, ''), 10);
    return normalizeRam(ramA) !== normalizeRam(ramB) ? 'ram_conflict' : null;
  }

  /*
   * There is deliberately no color conflict: one product covers every color
   * of a model/storage/RAM, and each offer keeps its own color (owner
   * decision D-6).
   */

  /**
   * Detect different sizes of a consumable: 500 ml vs 1 L, 100 g vs 200 g,
   * a single can vs a pack of 6. Titles are the matching text (see
   * NormalizerService.matchingText). A title that names no pack is one unit,
   * so "Pepsi 330ml" and "Pepsi 330ml pack of 6" conflict; a size only one
   * side states is not a conflict.
   */
  detectQuantityConflict(titleA: string, titleB: string): string | null {
    const a = extractQuantitySpec(titleA);
    const b = extractQuantitySpec(titleB);
    const differs = (x?: number, y?: number) => x !== undefined && y !== undefined && Math.abs(x - y) > Math.max(x, y) * 0.01;
    if (differs(a.volumeMl, b.volumeMl)) return 'volume_conflict';
    if (differs(a.weightG, b.weightG)) return 'weight_conflict';
    if ((a.packCount ?? 1) !== (b.packCount ?? 1)) return 'pack_conflict';
    return null;
  }

  /** A bundle (console + game, phone + earbuds) is not the item sold alone. */
  detectBundleConflict(titleA: string, titleB: string): string | null {
    return isBundle(titleA) !== isBundle(titleB) ? 'bundle_conflict' : null;
  }

  /** "Nokia 105 (2023)" vs "Nokia 105 (2019)". Silent unless both state a year. */
  detectModelYearConflict(titleA: string, titleB: string): string | null {
    const a = extractModelYear(titleA);
    const b = extractModelYear(titleB);
    return a !== undefined && b !== undefined && a !== b ? 'model_year_conflict' : null;
  }

  /**
   * Both titles carry the same strong product code ("24U411A-B", "U8000F",
   * "15IAX9"): letters and at least three digits. Store copy around such a
   * code varies wildly, but the code itself is the manufacturer's SKU name.
   */
  sharesStrongModelCode(titleA: string, titleB: string): boolean {
    const strong = (title: string) =>
      new Set(
        title
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((token) => {
            const letters = token.replace(/\d/g, '');
            const digits = token.replace(/[a-z]/g, '');
            return (
              token.length >= 5 &&
              letters.length > 0 &&
              digits.length >= 3 &&
              !FuzzyMatcherService.MODEL_CODE_UNIT_SUFFIXES.has(letters)
            );
          }),
      );
    const a = strong(titleA);
    const b = strong(titleB);
    return [...a].some((code) => b.has(code));
  }

  /**
   * Detect conflicting display sizes (monitors/TVs/laptops). A 24-inch and a
   * 27-inch monitor are physically different products even when the rest of
   * the model name is nearly identical ("LG 24U411A-B" vs "LG 27U411A-B") —
   * this caught two real false merges where the LLM judge missed the size
   * digits buried in an otherwise-matching title.
   */
  detectDisplaySizeConflict(sizeA?: string, sizeB?: string): string | null {
    if (!sizeA || !sizeB) return null;
    const a = parseFloat(sizeA);
    const b = parseFloat(sizeB);
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    return Math.abs(a - b) >= 0.5 ? 'display_size_conflict' : null;
  }

  /** Keywords marking a listing as used/refurbished rather than new retail stock. */
  private static readonly USED_CONDITION_PATTERN =
    /\b(used|refurbished|refurb|renewed|pre-?owned|second-?\s?hand|open-?box|as-?is|asis)\b/i;

  /**
   * Detect a new-vs-used/refurbished mismatch. A brand-new retail unit and a
   * used/refurbished one are not the same product for price-comparison
   * purposes even when brand/model/storage/color all agree — merging them
   * produces a misleading "best price" (a real bug this caught: an official-
   * warranty new iPhone 16 merged with an Alibaba "Used Excellent Condition"
   * listing at roughly half the price under the same canonical product).
   * Only fires when exactly one side is flagged as used — two listings that
   * both say "used"/"refurbished" can still legitimately be compared.
   */
  detectConditionConflict(titleA: string, titleB: string): string | null {
    const usedA = FuzzyMatcherService.USED_CONDITION_PATTERN.test(titleA);
    const usedB = FuzzyMatcherService.USED_CONDITION_PATTERN.test(titleB);
    return usedA !== usedB ? 'condition_conflict' : null;
  }

  /**
   * What kind of product a title describes, checked in order — the first hit
   * wins. The order matters: a laptop title names its GPU ("RTX 5050 GPU")
   * and a headset names what it pairs with ("for phone"), so the kinds that
   * mention others come first.
   */
  private static readonly PRODUCT_TYPES: Array<[string, RegExp]> = [
    ['laptop', /\b(laptops?|notebooks?|macbook|chromebook|ultrabook)\b/i],
    ['tablet', /\b(tablets?|ipad|galaxy\s+tab|matepad|redmi\s+pad|xiaomi\s+pad)\b/i],
    ['desktop', /\b(desktop\s+(?:pc|computer)|gaming\s+pc|all[-\s]in[-\s]one\s+pc|mini\s+pc)\b/i],
    ['graphics_card', /\b(graphics?\s+cards?|video\s+cards?|gpu)\b/i],
    // Before monitor/tv: a smartwatch has a "heart rate monitor", a soundbar is "for TV".
    ['watch', /\b(smart\s?watch|watch)\b/i],
    ['audio', /\b(headphones?|headsets?|earbuds?|earphones?|buds\d*|speakers?|soundbar)\b/i],
    ['monitor', /\bmonitors?\b/i],
    ['tv', /\b(tv|television)\b/i],
    ['phone', /\b(smartphones?|mobile\s+phones?|cell\s+phones?|phones?)\b/i],
  ];

  /** The first product kind a title names, or null when it names none. */
  productType(title: string): string | null {
    const hit = FuzzyMatcherService.PRODUCT_TYPES.find(([, pattern]) => pattern.test(title));
    return hit ? hit[0] : null;
  }

  /**
   * Detect two titles that plainly describe different kinds of product — a
   * laptop and a graphics card, a phone and its earbuds. Every other guard
   * compares attributes of the *same* kind of thing; none of them notice when
   * a laptop titled "... RTX 5050" is compared with an "RTX 5050" card, and
   * the matching model number then auto-accepted the merge. Silent unless both
   * titles say what they are.
   */
  detectProductTypeConflict(titleA: string, titleB: string): string | null {
    const typeA = this.productType(titleA);
    const typeB = this.productType(titleB);
    return typeA && typeB && typeA !== typeB ? 'product_type_conflict' : null;
  }

  /**
   * Processor families, each captured to a comparable token. Chip names are
   * too short for the model-code guards ("M4" has one digit, "i7" one letter),
   * so without this a MacBook Air M4 and a MacBook Air M5 -- same brand, same
   * model name -- counted as the same product.
   */
  private static readonly CHIP_PATTERNS: Array<[string, RegExp]> = [
    // Only on Apple titles: elsewhere "M2" is an SSD form factor.
    ['apple', /\bm([1-9])(?:\s*(pro|max|ultra))?\b/gi],
    // Tier and generation are separate families, so "Core i7" still matches
    // "i7-1355U" (generation unknown on one side) but not "i7-1255U".
    ['intel_core', /\b(?:core\s*)?i([3579])\b/gi],
    ['intel_gen', /\bi[3579][-\s](\d{4,5}[a-z]{0,2})\b/gi],
    ['intel_ultra', /\bcore\s+ultra\s+([3579])\b/gi],
    ['ryzen', /\bryzen\s+([3579])\b/gi],
  ];

  private chips(title: string): Map<string, Set<string>> {
    const found = new Map<string, Set<string>>();
    const isApple = /\b(apple|macbook|imac|ipad|mac\s?mini|mac\s?studio)\b/i.test(title);
    for (const [family, pattern] of FuzzyMatcherService.CHIP_PATTERNS) {
      if (family === 'apple' && !isApple) continue;
      for (const match of title.matchAll(pattern)) {
        const token = match
          .slice(1)
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        const set = found.get(family) ?? new Set<string>();
        set.add(token);
        found.set(family, set);
      }
    }
    return found;
  }

  /**
   * Detect two titles naming different chips of the same family (M4 vs M5,
   * i5 vs i7, Ryzen 5 vs Ryzen 7). Silent unless both name a chip of the same
   * family, and when either lists several (a "M2/M3 compatible" style title)
   * any shared chip is enough to pass.
   */
  detectChipConflict(titleA: string, titleB: string): string | null {
    const a = this.chips(titleA);
    const b = this.chips(titleB);
    for (const [family, chipsA] of a) {
      const chipsB = b.get(family);
      if (!chipsB) continue;
      const shares = [...chipsA].some((chip) => chipsB.has(chip));
      if (!shares) return 'chip_conflict';
    }
    return null;
  }

  /** Storage/RAM/network-gen unit suffixes to ignore — these are formatting, not model identity. */
  private static readonly MODEL_CODE_UNIT_SUFFIXES = new Set([
    'gb', 'tb', 'mb', 'kb', 'mp', 'mah', 'mm', 'cm', 'in', 'inch',
    'hz', 'khz', 'mhz', 'ghz', 'fps', 'db', 'kw', 'ma', 'g', 'k', 'p', 'w', 'v',
  ]);

  /**
   * Detect two titles that share a model number's digits but disagree on a
   * letter suffix directly attached to it — e.g. "Ryzen 7 7700" vs "Ryzen 7
   * 7700X", "RTX 4080" vs "RTX 4080Ti". This is deliberately narrow (same
   * digit run required on both sides) to avoid false-flagging genuine
   * duplicates worded differently: it only fires when both titles are
   * talking about the *same* number, just with a different letter glued to
   * it — a strong, low-noise signal that a 1.5B LLM reliably misses when the
   * surrounding title text is otherwise near-identical.
   */
  detectModelCodeSuffixConflict(titleA: string, titleB: string): string | null {
    const codesA = this.extractModelCodes(titleA);
    const codesB = this.extractModelCodes(titleB);

    for (const [digitKey, codeA] of codesA) {
      const codeB = codesB.get(digitKey);
      if (codeB && codeA !== codeB) {
        return 'model_code_suffix_conflict';
      }
    }
    return null;
  }

  /**
   * Detect two titles whose primary alphanumeric model/SKU codes are
   * completely unrelated — e.g. "Samsung ... F6000 Smart TV" vs "Samsung ...
   * H5000F Smart TV". `detectModelCodeSuffixConflict` deliberately only
   * fires when both sides share the same digit run (7700 vs 7700X); it stays
   * silent here because F6000 and H5000F don't share a digit core at all,
   * which is exactly why this needs a second, complementary check.
   *
   * Only "strong" codes count — alphanumeric tokens containing at least one
   * letter (a real product code), never a bare number, since bare numbers
   * are usually a spec or a year ("2025 Model") and comparing those would
   * flag two identical-model TVs from different release-year listings as a
   * conflict. A bare-digit token like "256" (from "256GB") is excluded the
   * same way. This only fires when BOTH titles have at least one strong code
   * and none of those codes is shared — if either title has none, or if the
   * two share at least one code (even alongside other, non-shared codes,
   * e.g. one listing tacking on an extra internal SKU), it stays silent and
   * defers to fuzzy score + the LLM judge as before.
   */
  detectDisjointModelConflict(titleA: string, titleB: string): string | null {
    const strongCodes = (title: string): Set<string> => {
      const codes = this.extractModelCodes(title);
      const strong = new Set<string>();
      for (const [digitKey, code] of codes) {
        if (/[a-z]/.test(code)) strong.add(digitKey);
      }
      return strong;
    };

    const codesA = strongCodes(titleA);
    const codesB = strongCodes(titleB);
    if (codesA.size === 0 || codesB.size === 0) return null;

    const sharesAny = [...codesA].some((key) => codesB.has(key));
    return sharesAny ? null : 'disjoint_model_code_conflict';
  }

  /** Maps each qualifying code's digit run -> the code's full text (letters + digits, lowercase). */
  private extractModelCodes(title: string): Map<string, string> {
    const codes = new Map<string, string>();
    const matches = title.toLowerCase().match(/[a-z]*\d+[a-z]*/g) ?? [];
    for (const code of matches) {
      const digits = code.replace(/[a-z]/g, '');
      const letters = code.replace(/\d/g, '');
      if (letters && FuzzyMatcherService.MODEL_CODE_UNIT_SUFFIXES.has(letters)) continue;

      // A token carrying several letters alongside a digit is a product code
      // even when it has only one or two digits ("MDHA4", "MW103", "A2337").
      // The 3-digit floor below still applies to bare numbers and single-letter
      // tokens, so specs and chip names ("13", "256", "M4") stay excluded —
      // comparing those would flag identical models as conflicting.
      const isLetterLedCode = letters.length >= 2 && digits.length >= 1;
      if (!isLetterLedCode && digits.length < 3) continue;

      codes.set(digits, code);
    }
    return codes;
  }

  private normalizeStorage(val: string): string {
    const normalized = this.storageToGb(val);
    if (normalized === null) return val.trim().toLowerCase();
    return `${normalized}GB`;
  }

  private storageToGb(val: string): number | null {
    const m = /(\d+(?:\.\d+)?)\s*(TB|GB|MB)/i.exec(val);
    if (!m) return null;

    const num = parseFloat(m[1]);
    const unit = m[2].toUpperCase();

    if (unit === 'TB') return num * 1000;
    if (unit === 'MB') return num / 1000;
    return num;
  }
}
