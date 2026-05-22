// apps/api/src/matching/interfaces/matching.interfaces.ts

export interface NormalizedTitle {
  raw: string;
  normalized: string;
  tokens: string[];
  brand?: string;
  model?: string;
  series?: string;
  variant?: string;
}

export interface ExtractedAttributes {
  brand?: string;
  model?: string;
  series?: string;
  variant?: string;          // e.g. "Ti", "Super", "XT", "Plus"
  color?: string;
  storage?: string;          // e.g. "512GB", "1TB"
  ram?: string;              // e.g. "16GB", "32GB"
  cpu?: string;
  gpu?: string;
  displaySize?: string;      // e.g. "14 inch"
  displayResolution?: string;
  connectivity?: string[];   // e.g. ["5G", "Wi-Fi 6E"]
  os?: string;
  generation?: string;       // e.g. "12th Gen", "M3"
  form?: string;             // "Founders Edition", "Gaming OC", etc.
  wattage?: string;
  voltage?: string;
  // Raw key-value for anything we don't explicitly model
  extra: Record<string, string>;
}

export interface IdentifierSet {
  gtin?: string;
  upc?: string;
  ean?: string;
  mpn?: string;
  sku?: string;
}

export interface MatchCandidate {
  canonicalProductId: string;
  title: string;
  normalizedTitle: string;
  brand?: string | null;
  model?: string | null;
  attributes: Record<string, unknown>;
  identifiers: IdentifierSet;
  categoryId: string;
  tier: string;
  embedding?: number[] | null;
}

export interface StepScore {
  step: string;
  score: number;       // 0.0 – 1.0
  weight: number;      // contribution weight
  matched: boolean;
  reason: string;
}

export interface MatchScoreBreakdown {
  exactIdentifier: StepScore;
  brandModel: StepScore;
  fuzzyTitle: StepScore;
  semantic: StepScore;
  attributeConsistency: StepScore;
  priceSanity: StepScore;
  categoryConstraint: StepScore;
}

export interface MatchResult {
  candidateId: string | null;
  status: 'ACCEPTED' | 'PENDING' | 'REJECTED';
  confidence: number;         // 0.0 – 1.0
  breakdown: MatchScoreBreakdown;
  flags: string[];            // e.g. ['different_storage', 'brand_mismatch']
  reasoning: string;          // human-readable
  processingMs: number;
  engineVersion: string;
}

// Confidence thresholds
export const CONFIDENCE_THRESHOLDS = {
  AUTO_ACCEPT: 0.88,
  SEND_TO_REVIEW: 0.60,
  // Below SEND_TO_REVIEW → REJECTED
} as const;