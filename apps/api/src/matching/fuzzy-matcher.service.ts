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
      { name: 'variant_suffix', pattern: /\b(Ti|Super|XT|XTX|GRE|XT X)\b/i },
      { name: 'pro_tier', pattern: /\b(Pro|Pro Max|Max|Ultra|Plus)\b/i },
      { name: 'mini_se', pattern: /\b(Mini|SE|Lite)\b/i },
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

  private normalizeStorage(val: string): string {
    const m = /(\d+(?:\.\d+)?)\s*(TB|GB|MB)/i.exec(val);
    if (!m) return val.toLowerCase();
    const num = parseFloat(m[1]);
    const unit = m[2].toUpperCase();
    // Normalize to GB for comparison
    if (unit === 'TB') return `${num * 1000}GB`;
    if (unit === 'MB') return `${num / 1000}GB`;
    return `${num}GB`;
  }
}