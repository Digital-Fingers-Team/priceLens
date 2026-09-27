'use client';
import Image from 'next/image';
import { ArrowUpRight, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonClassName } from '@/components/ui/button-styles';
import { PriceTag } from '@/components/ui/price-tag';
import { useI18n } from '@/lib/i18n/provider';
import { useNow } from '@/lib/hooks/use-now';
import { cn } from '@/lib/utils/cn';
import { storeGoHref } from '@/lib/utils/safe-href';
import type { SourceListing } from '@/types/product.types';

/** Affiliate/outbound links: not endorsements, and no referrer leak. */
export const OUTBOUND_REL = 'sponsored nofollow noopener noreferrer';

function StockLabel({ inStock }: { inStock: boolean | null }) {
  const { t } = useI18n();
  if (inStock == null) return <span>{t.product.stockUnknown}</span>;
  return inStock ? (
    <span className="text-success">{t.product.inStock}</span>
  ) : (
    <span className="text-danger">{t.product.outOfStock}</span>
  );
}

/**
 * One store's offer: store, its own title (which names color/bundle), stock,
 * rating and freshness, the price in the store's own currency, and the way
 * out through /affiliate/go (D-21). One layout at every width: on a phone
 * the link is a full-width button under the price.
 */
export function OfferRow({ listing, isBest }: { listing: SourceListing; isBest: boolean }) {
  const { t, tf, fmt } = useI18n();
  const now = useNow();
  const href = storeGoHref(listing);
  const store = listing.platform.name;

  return (
    <li className={cn('grid gap-3 p-4 sm:grid-cols-offer sm:items-center sm:gap-6', isBest && 'bg-brand-soft/40')}>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          {listing.platform.logoUrl ? (
            <Image src={listing.platform.logoUrl} alt="" className="h-5 w-5 rounded-sm object-contain" width={20} height={20} />
          ) : null}
          <span className="font-medium text-fg">{store}</span>
          {isBest && <Badge variant="brand">{t.product.bestDeal}</Badge>}
        </div>
        <p dir="auto" className="line-clamp-2 text-sm text-muted" title={listing.rawTitle}>
          {listing.rawTitle}
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {listing.color && (
            <span>
              {t.product.color}: <span className="capitalize">{listing.color}</span>
            </span>
          )}
          <StockLabel inStock={listing.inStock} />
          {listing.rating != null && (
            <span className="inline-flex items-center gap-1">
              <Star className="h-3 w-3 fill-current text-warning" aria-hidden />
              <span className="sr-only">{t.product.rating}</span>
              {fmt.rating(listing.rating)}
              {listing.reviewCount != null && ` (${fmt.number(listing.reviewCount)})`}
            </span>
          )}
          <span>{tf(t.product.checked, { when: fmt.relative(listing.lastSeenAt, now) })}</span>
        </p>
      </div>

      {/* The store's own price, in its own currency (what you pay there).
          Best Deal is decided on the FX-normalized price (bestDealIds). */}
      <PriceTag amount={listing.rawPrice ?? listing.priceUsd} currency={listing.rawCurrency} size="md" emphasis={isBest} className="sm:justify-end" />

      {href ? (
        <a
          href={href}
          target="_blank"
          rel={OUTBOUND_REL}
          aria-label={tf(t.product.goToStoreNewTab, { store })}
          className={buttonClassName({ variant: isBest ? 'primary' : 'secondary', className: 'w-full sm:w-auto' })}
        >
          {tf(t.product.goToStore, { store })}
          <ArrowUpRight className="flip-rtl h-4 w-4" aria-hidden />
        </a>
      ) : (
        <span className="text-sm text-muted">{t.product.linkUnavailable}</span>
      )}
    </li>
  );
}
