import { MatchStatus, Prisma } from '@prisma/client';
import { filterMarketOutliers } from '../intelligence/price-statistics';
import { normalizeArabic } from '../matching/text/arabic';

/**
 * What counts as a current offer: the one definition every price shown to a
 * shopper, every "best price", every statistic and every alert uses (audit
 * 02, L-10). An offer is LIVE when:
 *
 *  - matching accepted it (ACCEPTED or MANUAL_ACCEPT). PENDING -- a
 *    medium-confidence match waiting for review -- is not a confirmed offer
 *    for this product and is not shown as one;
 *  - it has a price above zero (the base-currency `priceUsd` column);
 *  - the store did not report it out of stock (`inStock` false); unknown
 *    stock (null) counts as available, because most stores never say;
 *  - it was seen by a scrape within the offer age window (OFFER_MAX_AGE_DAYS,
 *    default 7). Older than that, the price is a memory, not an offer: the
 *    listing may be gone, repriced or sold out. Seven days is the window the
 *    "was price" rule already used (price-intelligence
 *    getAdvertisedPreviousPrice); the value is owner decision D-13.
 *
 * Then one offer per store and title (the same item listed under several ids
 * is one offer; the cheapest is kept), and finally the market-outlier filter,
 * so a spare part priced at a tenth of the phone cannot be the best price.
 */
export const DEFAULT_OFFER_MAX_AGE_DAYS = 7;
const DAY_MS = 86_400_000;

/** When "now" is, and how old an offer may be. Services pass the configured window. */
export interface OfferPolicy {
  now?: Date;
  maxAgeDays?: number;
}

export interface OfferFields {
  priceUsd: unknown;
  inStock?: boolean | null;
  matchStatus?: string | null;
  lastSeenAt?: Date | null;
  platformId?: string;
  rawTitle?: string | null;
}

const ACCEPTED: ReadonlySet<string> = new Set([MatchStatus.ACCEPTED, MatchStatus.MANUAL_ACCEPT]);

/** A Decimal/string/number column as a finite number, or null. */
export function toPrice(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The oldest `lastSeenAt` a live offer may have. */
export function offerCutoff({ now = new Date(), maxAgeDays = DEFAULT_OFFER_MAX_AGE_DAYS }: OfferPolicy = {}): Date {
  return new Date(now.getTime() - maxAgeDays * DAY_MS);
}

export function isLiveOffer(offer: OfferFields, policy: OfferPolicy = {}): boolean {
  const price = toPrice(offer.priceUsd);
  if (price == null || price <= 0) return false;
  if (offer.inStock === false) return false;
  if (offer.matchStatus && !ACCEPTED.has(offer.matchStatus)) return false;
  if (offer.lastSeenAt && offer.lastSeenAt.getTime() < offerCutoff(policy).getTime()) return false;
  return true;
}

/**
 * A store title reduced to what identifies the item: case, spacing,
 * punctuation and Arabic letter forms removed.
 */
export function offerTitleKey(title: string | null | undefined): string {
  return normalizeArabic(title ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * One offer per store and title: the cheapest. Order is otherwise kept, so
 * a caller that sorted by price stays sorted.
 */
export function dedupeOffers<T extends OfferFields>(offers: T[]): T[] {
  const best = new Map<string, T>();
  for (const offer of offers) {
    const key = `${offer.platformId ?? ''}|${offerTitleKey(offer.rawTitle)}`;
    const current = best.get(key);
    if (!current || (toPrice(offer.priceUsd) ?? Infinity) < (toPrice(current.priceUsd) ?? Infinity)) {
      best.set(key, offer);
    }
  }
  const kept = new Set(best.values());
  return offers.filter((offer) => kept.has(offer));
}

/** Live, deduplicated, and not a price outlier against the product's other stores. */
export function liveOffers<T extends OfferFields>(offers: T[], policy: OfferPolicy = {}): T[] {
  const usable = dedupeOffers(offers.filter((offer) => isLiveOffer(offer, policy)));
  return filterMarketOutliers(
    usable,
    (offer) => toPrice(offer.priceUsd) ?? NaN,
    (offer) => offer.platformId ?? '?',
  ).kept;
}

/**
 * The same rule as isLiveOffer, as a SQL condition on a source_listings
 * alias. (Dedupe and the outlier filter need the whole product and stay in
 * code; SQL aggregates over this are "live offers" before them.)
 */
export function liveOfferSql(alias: string, policy: OfferPolicy = {}): Prisma.Sql {
  const t = Prisma.raw(alias);
  return Prisma.sql`(
    ${t}.price_usd > 0
    AND ${t}.in_stock IS NOT FALSE
    AND ${t}.match_status IN ('ACCEPTED', 'MANUAL_ACCEPT')
    AND ${t}.last_seen_at >= ${offerCutoff(policy)}
  )`;
}

/**
 * The Prisma `where` form of the same rule, for findMany/groupBy. Stock is
 * written as "true or null" on purpose: `NOT: { inStock: false }` compiles
 * to `NOT (in_stock = false)`, which is NULL -- not true -- for the many
 * listings whose store never reports stock, and would drop them.
 */
export function liveOfferWhere(policy: OfferPolicy = {}): Prisma.SourceListingWhereInput {
  return {
    priceUsd: { gt: 0 },
    matchStatus: { in: [MatchStatus.ACCEPTED, MatchStatus.MANUAL_ACCEPT] },
    OR: [{ inStock: true }, { inStock: null }],
    lastSeenAt: { gte: offerCutoff(policy) },
  };
}
