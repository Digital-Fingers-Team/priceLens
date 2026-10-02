'use client';
import { useId, useState } from 'react';
import Image from 'next/image';
import { ArrowUpRight, ChevronDown, Star } from 'lucide-react';
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
 *
 * A store selling the product more than once (other colors, sellers or
 * bundles) gets one box: its cheapest offer here, the rest folded under a
 * toggle that names how many and the price range.
 */
export function OfferRow({
  listing,
  isBest,
  more = [],
  bestDeals,
}: {
  listing: SourceListing;
  isBest: boolean;
  more?: SourceListing[];
  bestDeals?: Set<string>;
}) {
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
          {listing.platform.kind === 'OFFLINE_CHAIN' && (
            <Badge variant="outline" title={t.product.hasStoresHint}>
              {t.product.hasStores}
            </Badge>
          )}
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

      {more.length > 0 && <MoreOffers lead={listing} more={more} bestDeals={bestDeals} />}
    </li>
  );
}

/** The store's other offers, folded under one toggle inside its box. */
function MoreOffers({ lead, more, bestDeals }: { lead: SourceListing; more: SourceListing[]; bestDeals?: Set<string> }) {
  const { t, tf, tp, fmt } = useI18n();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const store = lead.platform.name;

  // The range covers the whole box, lead included, when one currency prices it.
  const priced = [lead, ...more].filter((o) => o.rawPrice != null && o.rawPrice > 0);
  const currency = priced[0]?.rawCurrency;
  const prices = priced.map((o) => o.rawPrice as number);
  const range =
    prices.length > 1 && priced.every((o) => o.rawCurrency === currency)
      ? [Math.min(...prices), Math.max(...prices)]
      : null;

  return (
    <div className="sm:col-span-full">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded border border-dashed border-border-strong px-3 py-2 text-start text-sm text-muted transition-colors hover:border-brand hover:text-fg"
      >
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium text-fg">{open ? t.product.hideOffers : `+${tp(t.product.moreOffers, more.length)}`}</span>
          {range && range[0] !== range[1] && (
            <span className="tabular-nums">
              <span className="whitespace-nowrap">{fmt.currency(range[0], currency)}</span>
              {' – '}
              <span className="whitespace-nowrap">{fmt.currency(range[1], currency)}</span>
            </span>
          )}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <ul id={panelId} aria-label={tf(t.product.otherOffersAt, { store })} className="mt-2 divide-y divide-border rounded border border-border bg-surface-2/40">
          {more.map((offer) => (
            <MoreOfferItem key={offer.id} offer={offer} isBest={bestDeals?.has(offer.id) ?? false} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** One of a store's other offers: title, color, stock, price and its own link. */
function MoreOfferItem({ offer, isBest }: { offer: SourceListing; isBest: boolean }) {
  const { t, tf, fmt } = useI18n();
  const now = useNow();
  const href = storeGoHref(offer);
  const store = offer.platform.name;

  return (
    <li className="flex items-center gap-3 p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p dir="auto" className="line-clamp-2 text-sm text-fg" title={offer.rawTitle}>
          {offer.rawTitle}
        </p>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          {offer.color && (
            <span>
              {t.product.color}: <span className="capitalize">{offer.color}</span>
            </span>
          )}
          <StockLabel inStock={offer.inStock} />
          <span>{tf(t.product.checked, { when: fmt.relative(offer.lastSeenAt, now) })}</span>
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <PriceTag amount={offer.rawPrice ?? offer.priceUsd} currency={offer.rawCurrency} size="sm" emphasis={isBest} />
        {href ? (
          <a
            href={href}
            target="_blank"
            rel={OUTBOUND_REL}
            aria-label={tf(t.product.goToStoreNewTab, { store })}
            className={buttonClassName({ variant: 'secondary', size: 'sm' })}
          >
            {tf(t.product.goToStore, { store })}
            <ArrowUpRight className="flip-rtl h-4 w-4" aria-hidden />
          </a>
        ) : (
          <span className="text-xs text-muted">{t.product.linkUnavailable}</span>
        )}
      </div>
    </li>
  );
}
