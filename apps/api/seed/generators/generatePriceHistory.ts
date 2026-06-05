import type { PrismaClient } from '@prisma/client';
import type { Client } from 'pg';
import { createPriceHistoryRows } from '../factories/priceHistoryFactory';
import type { CanonicalProductSeed, ListingSeed, PriceHistorySeed, SeedConfig } from '../types';
import { copyRows } from '../utils/batchInsert';

const PRICE_HISTORY_COLUMNS = [
  'id',
  'canonical_product_id',
  'source_listing_id',
  'price_usd',
  'currency',
  'original_price',
  'in_stock',
  'recorded_at',
];

export class PriceHistoryWriter {
  private readonly productCategories = new Map<string, string>();
  private readonly buffer: PriceHistorySeed[] = [];
  private inserted = 0;
  private seenListings = 0;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly client: Client,
    private readonly config: SeedConfig,
    private readonly runId: string,
    products: CanonicalProductSeed[],
  ) {
    for (const product of products) {
      this.productCategories.set(product.id, product.categorySlug);
    }
  }

  async addListings(listings: ListingSeed[]): Promise<void> {
    for (const listing of listings) {
      if (!listing.canonicalProductId) continue;
      const categorySlug = this.productCategories.get(listing.canonicalProductId);
      if (!categorySlug) continue;
      this.buffer.push(...createPriceHistoryRows(listing, categorySlug, this.config));
      this.seenListings += 1;
      if (this.buffer.length >= this.config.batchSize) {
        await this.flush();
      }
    }
  }

  async flush(): Promise<number> {
    if (this.buffer.length === 0) return 0;
    const rows = this.buffer.splice(0, this.buffer.length);
    const inserted = await copyRows(this.client, 'price_history', PRICE_HISTORY_COLUMNS, rows.map(historyRow));
    this.inserted += inserted;
    await this.prisma.seedCheckpoint.upsert({
      where: { runId_stage: { runId: this.runId, stage: 'price-history' } },
      update: { cursor: this.seenListings, insertedRows: this.inserted },
      create: { runId: this.runId, stage: 'price-history', cursor: this.seenListings, insertedRows: this.inserted },
    });
    if (this.inserted % this.config.logInterval < this.config.batchSize || inserted === 0) {
      console.log(`[seed] price-history: ${this.inserted.toLocaleString()} rows`);
    }
    return inserted;
  }

  count(): number {
    return this.inserted;
  }
}

function historyRow(row: PriceHistorySeed) {
  return [
    row.id,
    row.canonicalProductId,
    row.sourceListingId,
    row.priceUsd,
    row.currency,
    row.originalPrice,
    row.inStock,
    row.recordedAt,
  ];
}
