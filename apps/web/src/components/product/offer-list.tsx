'use client';
import { useSearchParams } from 'next/navigation';
import { EmptyState } from '@/components/ui/state';
import { usePathname, useRouter } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { bestDealIds } from '@/lib/utils/price';
import { filterByColor, offerColors, sortOffers } from '@/lib/utils/offers';
import { cn } from '@/lib/utils/cn';
import type { SourceListing } from '@/types/product.types';
import { OfferRow } from './offer-row';

interface OfferListProps {
  listings: SourceListing[];
}

/**
 * Every store's offer for this product, cheapest buyable first (audit 06,
 * U-02).
 *
 * Colors share one product (owner decision D-6), so when the offers name more
 * than one color a chip row filters them; the choice lives in the URL
 * (?color=navy) like the search filters, and "Best Deal" follows it (U-04).
 */
export function OfferList({ listings }: OfferListProps) {
  const { t } = useI18n();
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
    return <EmptyState title={t.product.noOffers} className="rounded border border-border" />;
  }

  return (
    <div className="flex flex-col gap-3">
      {colors.length > 1 && (
        <div role="group" aria-label={t.product.filterByColor} className="flex flex-wrap gap-2">
          {[null, ...colors].map((c) => {
            const active = c === color;
            return (
              <button
                key={c ?? 'all'}
                type="button"
                aria-pressed={active}
                onClick={() => selectColor(c)}
                className={cn(
                  'h-8 rounded-sm border px-3 text-sm capitalize transition-colors',
                  active ? 'border-brand bg-brand-soft text-brand-soft-fg' : 'border-border-strong text-muted hover:text-fg',
                )}
              >
                {c ?? t.product.allColors}
              </button>
            );
          })}
        </div>
      )}

      <ul className="divide-y divide-border overflow-hidden rounded border border-border bg-surface">
        {offers.map((listing) => (
          <OfferRow key={listing.id} listing={listing} isBest={bestDeals.has(listing.id)} />
        ))}
      </ul>
    </div>
  );
}
