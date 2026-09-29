import { NormalizerService } from '../normalizer.service';
import type { ListingForRepair, VariantGroup, VariantSplitPlan } from './variant-repair';

/**
 * Offer audit (owner decision, 2026-09-29: the AI judge decides every merge).
 *
 * Before that decision, ingestion merged on score alone -- a shared "AX3000"
 * put a Ruijie router, TP-Link access point and extender and Xiaomi mesh
 * systems on one product page, and those merges were never logged for
 * review. The audit asks the judge, per product, whether each offer whose
 * title differs from the product's is the same product; each one it
 * rejects becomes a product of its own (applyVariantSplits, `detached`).
 *
 * The plan is pure: the caller asks the judge about `toAsk` and passes the
 * verdicts back. An offer the judge could not answer stays where it is.
 */
export interface OfferAuditPlan extends VariantSplitPlan {
  /** Offers whose title differs from the product's: the ones to ask about. */
  toAsk: ListingForRepair[];
}

const normalizer = new NormalizerService();
const key = (title: string) => normalizer.normalizeTitle(title).normalized;

export function planOfferAudit(
  product: { id: string; title: string },
  listings: ListingForRepair[],
  verdicts: ReadonlyMap<string, boolean | null>,
): OfferAuditPlan {
  const productKey = key(product.title);
  const toAsk = listings.filter((listing) => key(listing.rawTitle) !== productKey);
  const rejected = new Set(toAsk.filter((listing) => verdicts.get(listing.id) === false).map((listing) => listing.id));

  const splits: VariantGroup[] = listings
    .filter((listing) => rejected.has(listing.id))
    .map((listing) => ({ variant: {}, listingIds: [listing.id], detached: true }));
  const keep: VariantGroup = { variant: {}, listingIds: listings.filter((l) => !rejected.has(l.id)).map((l) => l.id) };

  return { varying: [], keep, splits, unknown: [], toAsk };
}
