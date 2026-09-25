/**
 * Step 1 -- price gate.
 *
 * A listing without a positive, finite price is a scrape error or an
 * out-of-stock card, not an offer. It is dropped before anything else runs
 * and never stored.
 */
export function hasUsablePrice(price: number | null | undefined): price is number {
  return price != null && Number.isFinite(price) && price > 0;
}
