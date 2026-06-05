import { MatchStatus } from '@prisma/client';
import { v5 as uuidv5 } from 'uuid';
import type { CanonicalProductSeed, ListingSeed, SeedConfig, StoreDefinition } from '../types';
import { listingPrice } from '../utils/pricing';
import { SeededRandom, weightedPick } from '../utils/random';
import { mutateTitle, normalizeTitle } from '../utils/titleMutator';

export function createListing(
  product: CanonicalProductSeed,
  store: StoreDefinition,
  platformId: string,
  listingIndex: number,
  config: SeedConfig,
): ListingSeed {
  const random = new SeededRandom(`listing:${product.id}:${store.slug}:${listingIndex}`);
  const rawTitle = mutateTitle(product, store, random);
  const priceUsd = listingPrice(product.basePrice, store, product.categorySlug, config.now, random);
  const confidence = weightedPick(random, [
    { value: random.float(0.9, 0.99), weight: 72 },
    { value: random.float(0.62, 0.87), weight: 22 },
    { value: random.float(0.28, 0.58), weight: 6 },
  ]);
  const matchStatus = confidence >= 0.88 ? MatchStatus.ACCEPTED : confidence >= 0.6 ? MatchStatus.PENDING : MatchStatus.REJECTED;
  const externalId = `${store.slug.toUpperCase()}-${product.sku}-${listingIndex}`;
  const id = uuidv5(`listing:${platformId}:${externalId}`, config.seedNamespace);

  return {
    id,
    platformId,
    platformSlug: store.slug,
    canonicalProductId: product.id,
    externalId,
    externalUrl: externalUrl(store, externalId),
    rawTitle,
    rawPrice: priceUsd,
    rawCurrency: 'USD',
    rawBrand: random.bool(0.92) ? product.brand : null,
    rawImageUrl: product.thumbnailUrl,
    rawAttributes: product.attributes,
    rawCategory: product.categorySlug,
    normalizedTitle: normalizeTitle(rawTitle),
    extractedGtin: random.bool(0.62) ? product.gtin : null,
    extractedMpn: random.bool(0.78) ? product.mpn : null,
    extractedBrand: random.bool(0.9) ? product.brand : null,
    extractedModel: random.bool(0.88) ? product.model : null,
    extractedAttributes: product.attributes,
    priceUsd,
    inStock: !random.bool(0.08),
    rating: random.bool(0.84) ? random.float(3.6, 5, 1) : null,
    reviewCount: random.bool(0.8) ? random.int(4, 9000) : null,
    matchStatus,
    matchConfidence: confidence,
    matchedAt: matchStatus === MatchStatus.ACCEPTED ? config.now : null,
    firstSeenAt: daysAgo(config.now, random.int(10, 210)),
    lastSeenAt: config.now,
    lastScrapedAt: config.now,
  };
}

export function createChallengeListing(
  product: CanonicalProductSeed,
  store: StoreDefinition,
  platformId: string,
  challengeIndex: number,
  config: SeedConfig,
): ListingSeed {
  const random = new SeededRandom(`challenge:${product.id}:${store.slug}:${challengeIndex}`);
  const priceUsd = listingPrice(product.basePrice, store, product.categorySlug, config.now, random);
  const rawTitle = mutateTitle(product, store, random)
    .replace(/\b128GB\b/g, '256GB')
    .replace(/\bPro Max\b/g, random.pick(['Pro', 'PM', 'ProMax']))
    .replace(/\bRTX 4080\b/g, 'RTX4080')
    .replace(/\bGalaxy\b/g, 'Glaxy');
  const externalId = `${store.slug.toUpperCase()}-MATCH-${product.sku}-${challengeIndex}`;
  const id = uuidv5(`challenge-listing:${platformId}:${externalId}`, config.seedNamespace);

  return {
    id,
    platformId,
    platformSlug: store.slug,
    canonicalProductId: null,
    externalId,
    externalUrl: externalUrl(store, externalId),
    rawTitle,
    rawPrice: priceUsd,
    rawCurrency: 'USD',
    rawBrand: random.bool(0.75) ? product.brand : null,
    rawImageUrl: product.thumbnailUrl,
    rawAttributes: product.attributes,
    rawCategory: product.categorySlug,
    normalizedTitle: normalizeTitle(rawTitle),
    extractedGtin: null,
    extractedMpn: random.bool(0.4) ? product.mpn : null,
    extractedBrand: random.bool(0.75) ? product.brand : null,
    extractedModel: random.bool(0.55) ? product.model : null,
    extractedAttributes: product.attributes,
    priceUsd,
    inStock: !random.bool(0.12),
    rating: random.bool(0.65) ? random.float(3.2, 4.8, 1) : null,
    reviewCount: random.bool(0.65) ? random.int(1, 1300) : null,
    matchStatus: MatchStatus.PENDING,
    matchConfidence: random.float(0.58, 0.86),
    matchedAt: null,
    firstSeenAt: daysAgo(config.now, random.int(1, 120)),
    lastSeenAt: config.now,
    lastScrapedAt: config.now,
  };
}

function externalUrl(store: StoreDefinition, externalId: string): string {
  if (store.slug === 'amazon') return `${store.baseUrl}/dp/${externalId}`;
  if (store.slug === 'walmart') return `${store.baseUrl}/ip/${externalId}`;
  if (store.slug === 'ebay') return `${store.baseUrl}/itm/${externalId}`;
  return `${store.baseUrl}/product/${externalId.toLowerCase()}`;
}

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}
