import type { ConnectorType, MatchStatus, ProductTier } from '@prisma/client';

export type SeedProfile = 'demo' | 'medium' | 'full';

export interface SeedConfig {
  profile: SeedProfile;
  seedVersion: string;
  seedNamespace: string;
  productTarget: number;
  listingsPerProduct: number;
  challengeListingTarget: number;
  historyRowsPerListing: number;
  batchSize: number;
  reset: boolean;
  resume: boolean;
  generateProducts: boolean;
  now: Date;
  logInterval: number;
}

export interface CategoryDefinition {
  slug: string;
  name: string;
  parentSlug?: string;
  level: number;
  searchTerms: string[];
}

export interface StoreDefinition {
  slug: string;
  name: string;
  baseUrl: string;
  connectorType: ConnectorType;
  rateLimit: number;
  priceModifier: number;
  titleStyle: 'clean' | 'dash' | 'compact' | 'marketplace' | 'verbose';
}

export interface ProductModelDefinition {
  categorySlug: string;
  brand: string;
  series: string;
  models: string[];
  variants?: string[];
  storage?: string[];
  ram?: string[];
  colors?: string[];
  displaySizes?: string[];
  cpu?: string[];
  gpu?: string[];
  refreshRates?: string[];
  capacities?: string[];
  energyRatings?: string[];
  editions?: string[];
  basePrice: number;
  releaseYears: number[];
  searchBoost?: number;
}

export interface CanonicalProductSeed {
  id: string;
  categorySlug: string;
  categoryId: string;
  slug: string;
  title: string;
  normalizedTitle: string;
  brand: string;
  model: string;
  sku: string;
  gtin: string;
  mpn: string;
  attributes: Record<string, string | number | boolean>;
  basePrice: number;
  tier: ProductTier;
  searchBoost: number;
  imageUrl: string;
  thumbnailUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListingSeed {
  id: string;
  platformId: string;
  platformSlug: string;
  canonicalProductId: string | null;
  externalId: string;
  externalUrl: string;
  rawTitle: string;
  rawPrice: number;
  rawCurrency: string;
  rawBrand: string | null;
  rawImageUrl: string | null;
  rawAttributes: Record<string, string | number | boolean>;
  rawCategory: string | null;
  normalizedTitle: string;
  extractedGtin: string | null;
  extractedMpn: string | null;
  extractedBrand: string | null;
  extractedModel: string | null;
  extractedAttributes: Record<string, string | number | boolean>;
  priceUsd: number;
  inStock: boolean;
  rating: number | null;
  reviewCount: number | null;
  matchStatus: MatchStatus;
  matchConfidence: number;
  matchedAt: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastScrapedAt: Date;
}

export interface PriceHistorySeed {
  id: string;
  canonicalProductId: string;
  sourceListingId: string;
  priceUsd: number;
  currency: string;
  originalPrice: number | null;
  inStock: boolean;
  recordedAt: Date;
}

export interface GenerationStats {
  products: number;
  listings: number;
  challengeListings: number;
  priceHistory: number;
}

export interface CatalogProductInput {
  definition: ProductModelDefinition;
  model: string;
  variant?: string;
  storage?: string;
  ram?: string;
  color?: string;
  displaySize?: string;
  cpu?: string;
  gpu?: string;
  refreshRate?: string;
  capacity?: string;
  energyRating?: string;
  edition?: string;
  releaseYear: number;
  sequence: number;
}
