'use client';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpRight, Star } from 'lucide-react';
import type { SourceListing } from '@/types/product.types';
import { Badge } from '@/components/ui/badge';
import { buttonClassName } from '@/components/ui/button-styles';
import { formatCurrency, formatNumber, formatRating, formatRelativeTime } from '@/lib/utils/format';
import { bestDealIds } from '@/lib/utils/price';
import { filterByColor, offerColors, sortOffers } from '@/lib/utils/offers';
import { safeExternalHref } from '@/lib/utils/safe-href';
import { cn } from '@/lib/utils/cn';

interface OfferListProps {
  listings: SourceListing[];
}

function StockLabel({ inStock }: { inStock: boolean | null }) {
  if (inStock == null) return <span className="text-ink-500">Stock not listed</span>;
  return inStock ? (
    <span className="text-emerald-400">In stock</span>
  ) : (
    <span className="text-red-400">Out of stock</span>
  );
}

/**
 * Every store's offer for this product, cheapest buyable first (audit 06,
 * U-02). One row per offer that works at any width: on a phone the store link
 * is a full-width button instead of a column scrolled off the side of a table.
 *
 * Colors share one product (owner decision D-6), so when the offers name more
 * than one color a chip row filters them; the choice lives in the URL
 * (?color=navy) like the search filters, and "Best Deal" follows it (U-04).
 */
export function OfferList({ listings }: OfferListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const colors = offerColors(listings);
  const requested = searchParams.get('color')?.toLowerCase() ?? null;
  const color = requested && colors.includes(requested) ? requested : null;

  const offers = sortOffers(filterByColor(listings, color));
  const bestDeals = bestDealIds(offers);

  function selectColor(next: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set('color', next);
    else params.delete('color');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  if (listings.length === 0) {
    return (
      <p className="rounded-xl border border-ink-700 px-4 py-10 text-center text-ink-500">
        No store has this product listed right now.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {colors.length > 1 && (
        <div role="group" aria-label="Filter offers by color" className="flex flex-wrap gap-2">
          {[null, ...colors].map((c) => {
            const active = c === color;
            return (
              <button
                key={c ?? 'all'}
                type="button"
                aria-pressed={active}
                onClick={() => selectColor(c)}
                className={cn(
                  'min-h-9 rounded-full border px-3.5 text-sm capitalize transition-colors',
                  active
                    ? 'border-signal bg-signal/10 text-signal'
                    : 'border-ink-600 text-ink-300 hover:border-ink-400',
                )}
              >
                {c ?? 'All colors'}
              </button>
            );
          })}
        </div>
      )}

      <ul className="divide-y divide-ink-800 rounded-xl border border-ink-700">
        {offers.map((listing) => {
          const isBest = bestDeals.has(listing.id);
          const href = safeExternalHref(listing.externalUrl);
          const store = listing.platform.name;
          return (
            <li
              key={listing.id}
              className={cn(
                'grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-6',
                isBest && 'bg-signal/5',
              )}
            >
              {/* Store and the store's own title (which says the color/bundle). */}
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {listing.platform.logoUrl ? (
                    <Image
                      src={listing.platform.logoUrl}
                      alt=""
                      className="h-5 w-5 rounded object-contain"
                      width={20}
                      height={20}
                    />
                  ) : null}
                  <span className="font-semibold text-ink-100">{store}</span>
                  {isBest && (
                    <Badge variant="success" dot>
                      Best Deal
                    </Badge>
                  )}
                </div>
                <p dir="auto" className="text-sm text-ink-400 line-clamp-2" title={listing.rawTitle}>
                  {listing.rawTitle}
                </p>
                <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-500">
                  {listing.color && <span className="capitalize">Color: {listing.color}</span>}
                  <StockLabel inStock={listing.inStock} />
                  {listing.rating != null && (
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
                      {formatRating(listing.rating)}
                      {listing.reviewCount != null && ` (${formatNumber(listing.reviewCount)})`}
                    </span>
                  )}
                  <span>Checked {formatRelativeTime(listing.lastSeenAt)}</span>
                </p>
              </div>

              {/* The store's own price, in its own currency (what you pay there).
                  Best Deal is decided on the FX-normalized price (bestDealIds). */}
              <p className={cn('text-lg font-bold sm:text-right', isBest ? 'text-signal' : 'text-ink-100')}>
                {formatCurrency(listing.rawPrice ?? listing.priceUsd, listing.rawCurrency)}
              </p>

              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`View on ${store} (opens in a new tab)`}
                  className={buttonClassName({
                    variant: isBest ? 'primary' : 'outline',
                    size: 'md',
                    className: 'w-full sm:w-auto min-h-11',
                  })}
                >
                  Go to {store}
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                </a>
              ) : (
                <span className="text-sm text-ink-500">Link unavailable</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
