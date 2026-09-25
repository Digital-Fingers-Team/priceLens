import { ProductTier } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type { RetailerListing } from '../interfaces/retailer-listing.interface';

/** Pure conversions between scraped listings and database values. */

/** Two-decimal string for a Decimal column; null for a missing or non-finite value. */
export function toDbDecimal(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return value.toFixed(2);
}

export function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function toSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/** A new product's tier, from the raw price of the listing that founded it. */
export function inferTier(price: number | null): ProductTier {
  if (price == null) return ProductTier.MID_RANGE;
  if (price < 300) return ProductTier.BUDGET;
  if (price < 900) return ProductTier.MID_RANGE;
  if (price < 1800) return ProductTier.PREMIUM;
  return ProductTier.ULTRA_PREMIUM;
}

/** What the store told us, kept verbatim on the listing row. */
export function buildRawAttributes(listing: RetailerListing, source: string): Record<string, unknown> {
  return {
    source,
    brand: listing.brand,
    model: listing.model,
    identifiers: listing.identifiers,
    imageUrl: listing.imageUrl,
    inStock: listing.inStock,
    rating: listing.rating,
    reviewCount: listing.reviewCount,
    raw: listing.raw,
  };
}
