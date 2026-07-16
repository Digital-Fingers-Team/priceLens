// apps/api/src/matching/fuzzy-matcher.service.ts
import { Injectable } from '@nestjs/common';

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
      { name: 'pro_tier', pattern: /\b(Pro Max|Ultra|Plus|Pro|Max)\b/i },
      { name: 'mini_se', pattern: /\b(Mini|Lite|SE)\b/i },
    ];

    for (const { name, pattern } of VARIANT_PATTERNS) {
      const matchA = (pattern.exec(titleA) ?? [])[0]?.toLowerCase();
      const matchB = (pattern.exec(titleB) ?? [])[0]?.toLowerCase();

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

  /**
   * Detect conflicting color values.
   * Color is its own SKU for phones/laptops — a black unit and a blue unit
   * must never be merged into one canonical product.
   */
  detectColorConflict(colorA?: string, colorB?: string): string | null {
    if (!colorA || !colorB) return null;
    return colorA.trim().toLowerCase() !== colorB.trim().toLowerCase() ? 'color_conflict' : null;
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

  /** Maps each qualifying code's digit run -> the code's full text (letters + digits, lowercase). */
  private extractModelCodes(title: string): Map<string, string> {
    const codes = new Map<string, string>();
    const matches = title.toLowerCase().match(/[a-z]*\d+[a-z]*/g) ?? [];
    for (const code of matches) {
      const digits = code.replace(/[a-z]/g, '');
      const letters = code.replace(/\d/g, '');
      if (digits.length < 3) continue; // too short to be a meaningful model number
      if (letters && FuzzyMatcherService.MODEL_CODE_UNIT_SUFFIXES.has(letters)) continue;
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
