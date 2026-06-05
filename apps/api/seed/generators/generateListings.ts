import type { PrismaClient } from '@prisma/client';
import type { Client } from 'pg';
import { createChallengeListing, createListing } from '../factories/listingFactory';
import type { CanonicalProductSeed, ListingSeed, SeedConfig, StoreDefinition } from '../types';
import { copyRows } from '../utils/batchInsert';

const LISTING_COLUMNS = [
  'id',
  'platform_id',
  'canonical_product_id',
  'external_id',
  'external_url',
  'raw_title',
  'raw_price',
  'raw_currency',
  'raw_brand',
  'raw_image_url',
  'raw_attributes',
  'raw_category',
  'normalized_title',
  'extracted_gtin',
  'extracted_mpn',
  'extracted_brand',
  'extracted_model',
  'extracted_attributes',
  'price_usd',
  'in_stock',
  'rating',
  'review_count',
  'match_status',
  'match_confidence',
  'matched_at',
  'first_seen_at',
  'last_seen_at',
  'last_scraped_at',
];

export interface ListingGenerationResult {
  listings: number;
  challenges: number;
}

export async function generateListings(
  prisma: PrismaClient,
  client: Client,
  config: SeedConfig,
  runId: string,
  products: CanonicalProductSeed[],
  stores: Map<string, { id: string; definition: StoreDefinition }>,
  onListings?: (listings: ListingSeed[]) => Promise<void>,
): Promise<ListingGenerationResult> {
  const storeList = Array.from(stores.values());
  let insertedListings = 0;
  let insertedChallenges = 0;
  let productCursor = await readCursor(prisma, runId, 'listings');
  const challengeCursor = await readCursor(prisma, runId, 'challenge-listings');
  let batch: ListingSeed[] = [];

  for (; productCursor < products.length; productCursor += 1) {
    const product = products[productCursor];
    for (let index = 0; index < config.listingsPerProduct; index += 1) {
      const store = storeList[(productCursor + index) % storeList.length];
      batch.push(createListing(product, store.definition, store.id, index, config));
    }
    if (batch.length >= config.batchSize) {
      insertedListings += await flush(prisma, client, config, runId, 'listings', productCursor + 1, batch, onListings);
      batch = [];
    }
  }

  if (batch.length > 0) {
    insertedListings += await flush(prisma, client, config, runId, 'listings', products.length, batch, onListings);
  }

  let challengeBatch: ListingSeed[] = [];
  for (let index = challengeCursor; index < config.challengeListingTarget; index += 1) {
    const product = products[index % products.length];
    const store = storeList[index % storeList.length];
    challengeBatch.push(createChallengeListing(product, store.definition, store.id, index, config));
    if (challengeBatch.length >= config.batchSize) {
      insertedChallenges += await flush(prisma, client, config, runId, 'challenge-listings', index + 1, challengeBatch);
      challengeBatch = [];
    }
  }

  if (challengeBatch.length > 0) {
    insertedChallenges += await flush(prisma, client, config, runId, 'challenge-listings', config.challengeListingTarget, challengeBatch);
  }

  return { listings: insertedListings, challenges: insertedChallenges };
}

function listingRow(listing: ListingSeed) {
  return [
    listing.id,
    listing.platformId,
    listing.canonicalProductId,
    listing.externalId,
    listing.externalUrl,
    listing.rawTitle,
    listing.rawPrice,
    listing.rawCurrency,
    listing.rawBrand,
    listing.rawImageUrl,
    listing.rawAttributes,
    listing.rawCategory,
    listing.normalizedTitle,
    listing.extractedGtin,
    listing.extractedMpn,
    listing.extractedBrand,
    listing.extractedModel,
    listing.extractedAttributes,
    listing.priceUsd,
    listing.inStock,
    listing.rating,
    listing.reviewCount,
    listing.matchStatus,
    listing.matchConfidence,
    listing.matchedAt,
    listing.firstSeenAt,
    listing.lastSeenAt,
    listing.lastScrapedAt,
  ];
}

async function flush(
  prisma: PrismaClient,
  client: Client,
  config: SeedConfig,
  runId: string,
  stage: string,
  cursor: number,
  listings: ListingSeed[],
  onListings?: (listings: ListingSeed[]) => Promise<void>,
): Promise<number> {
  const inserted = await copyRows(client, 'source_listings', LISTING_COLUMNS, listings.map(listingRow), '(platform_id, external_id)');
  if (onListings) await onListings(listings);
  await saveCheckpoint(prisma, runId, stage, cursor, inserted);
  console.log(`[seed] ${stage}: cursor ${cursor.toLocaleString()}, inserted ${inserted.toLocaleString()} rows`);
  return inserted;
}

async function readCursor(prisma: PrismaClient, runId: string, stage: string): Promise<number> {
  const checkpoint = await prisma.seedCheckpoint.findUnique({ where: { runId_stage: { runId, stage } } });
  return checkpoint?.cursor ?? 0;
}

async function saveCheckpoint(prisma: PrismaClient, runId: string, stage: string, cursor: number, insertedRows: number): Promise<void> {
  await prisma.seedCheckpoint.upsert({
    where: { runId_stage: { runId, stage } },
    update: { cursor, insertedRows },
    create: { runId, stage, cursor, insertedRows },
  });
}
