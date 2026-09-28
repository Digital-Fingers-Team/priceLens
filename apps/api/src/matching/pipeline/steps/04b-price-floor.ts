/**
 * Step 4b -- price floor.
 *
 * The catalogue keeps only products worth comparing. A category's own
 * `minPriceEgp` wins (0 = no floor, how the original electronics categories
 * are seeded); otherwise the global floor (MIN_LISTING_PRICE_EGP) applies.
 * Runs on the base-currency (EGP) price, after step 4 has converted it.
 */
type FloorSource = { minPriceEgp: { toNumber(): number } | number | null };

export function priceFloorFor(category: FloorSource, globalFloor: number): number {
  const own = category.minPriceEgp;
  if (own == null) return globalFloor;
  return typeof own === 'number' ? own : own.toNumber();
}

/** A missing price is not "below": step 1 (price gate) owns that case. */
export function isBelowPriceFloor(price: number | null, floor: number): boolean {
  return price != null && floor > 0 && price < floor;
}
