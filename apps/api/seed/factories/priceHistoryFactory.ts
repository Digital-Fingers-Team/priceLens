import { v5 as uuidv5 } from 'uuid';
import type { ListingSeed, PriceHistorySeed, SeedConfig } from '../types';
import { historyPrice } from '../utils/pricing';
import { SeededRandom } from '../utils/random';

export function createPriceHistoryRows(
  listing: ListingSeed,
  categorySlug: string,
  config: SeedConfig,
): PriceHistorySeed[] {
  if (!listing.canonicalProductId) return [];
  const random = new SeededRandom(`history:${listing.id}`);
  const rows: PriceHistorySeed[] = [];
  const stepDays = Math.max(1, Math.floor(180 / config.historyRowsPerListing));

  for (let index = 0; index < config.historyRowsPerListing; index += 1) {
    const dayOffset = (config.historyRowsPerListing - index - 1) * stepDays;
    const recordedAt = new Date(config.now.getTime() - dayOffset * 86_400_000 + random.int(0, 22) * 3_600_000);
    const price = historyPrice(listing.priceUsd, categorySlug, recordedAt, dayOffset, random);
    rows.push({
      id: uuidv5(`price-history:${listing.id}:${recordedAt.toISOString().slice(0, 13)}`, config.seedNamespace),
      canonicalProductId: listing.canonicalProductId,
      sourceListingId: listing.id,
      priceUsd: price.price,
      currency: 'USD',
      originalPrice: price.originalPrice,
      inStock: price.inStock,
      recordedAt,
    });
  }

  return rows;
}
