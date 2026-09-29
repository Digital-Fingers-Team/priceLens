'use client';
import { productTitle } from '@/lib/product-title';
import Image from 'next/image';
import { ArrowUpRight, Bell, Heart, ImageOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buttonClassName } from '@/components/ui/button-styles';
import { PriceTag } from '@/components/ui/price-tag';
import { useI18n } from '@/lib/i18n/provider';
import { useNow } from '@/lib/hooks/use-now';
import { useAuthStore } from '@/lib/store/auth.store';
import { useIsWatched, useToggleWatchlist } from '@/lib/hooks/use-watchlist';
import { useUiStore } from '@/lib/store/ui.store';
import { cheapestOffer } from '@/lib/utils/offers';
import { storeGoHref } from '@/lib/utils/safe-href';
import type { CanonicalProduct } from '@/types/product.types';
import { OUTBOUND_REL } from './offer-row';
import { useCategoryName } from './use-category-name';

/** "DisplaySize" / "display_size" -> dictionary key "displaySize". */
function attributeKey(key: string) {
  const words = key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(' ');
  return words.map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))).join('');
}

export function ProductHeader({ product }: { product: CanonicalProduct }) {
  const { t, tf, tp, fmt, locale } = useI18n();
  const now = useNow();
  const categoryName = useCategoryName(product.category);
  const { isAuthenticated } = useAuthStore();
  const isWatched = useIsWatched(product.id);
  const { mutate: toggleWatchlist, isPending: watchlistPending } = useToggleWatchlist();
  const openAlertModal = useUiStore((s) => s.openAlertModal);

  const { priceStats } = product;
  const hasRange = priceStats.min != null && priceStats.max != null && priceStats.min !== priceStats.max;
  const listingCount = product._count?.sourceListings ?? product.sourceListings?.length ?? 0;
  const storeCount =
    product.storeCount ??
    (product.sourceListings?.length ? new Set(product.sourceListings.map((l) => l.platform.id)).size : 0);

  const listings = product.sourceListings ?? [];
  const cheapest = cheapestOffer(listings);
  const cheapestHref = cheapest ? storeGoHref(cheapest) : undefined;
  // When a store last confirmed a price -- what "fresh" means to a shopper,
  // unlike the product row's updatedAt.
  const lastChecked = listings.reduce<string | null>(
    (latest, l) => (latest == null || l.lastSeenAt > latest ? l.lastSeenAt : latest),
    null,
  );

  const attributeLabels = t.product.attributes as Record<string, string>;
  const attrs = Object.entries((product.attributes ?? {}) as Record<string, unknown>)
    .filter(([, val]) => typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean')
    .slice(0, 6);

  return (
    <section className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
      <div className="relative aspect-square overflow-hidden rounded border border-border bg-media">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={productTitle(product, locale)}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-contain p-8"
            priority
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted">
            <ImageOff className="h-8 w-8" aria-hidden />
            <span className="text-xs">{t.product.noImage}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {product.brand && <span className="label-mono text-muted">{product.brand}</span>}
            {product.isVerified && <Badge variant="success">{t.product.verified}</Badge>}
            <Badge variant="outline">{t.tiers[product.tier] ?? product.tier}</Badge>
            <Badge variant="neutral">{categoryName}</Badge>
          </div>
          <h1 dir="auto" className="text-xl font-semibold text-fg sm:text-2xl">
            {productTitle(product, locale)}
          </h1>
          {attrs.length > 0 && (
            <dl className="flex flex-wrap gap-2">
              {attrs.map(([key, val]) => (
                <div key={key} className="flex gap-1 rounded-sm border border-border px-2 py-1 text-xs">
                  <dt className="text-muted">{attributeLabels[attributeKey(key)] ?? key.replace(/_/g, ' ')}:</dt>
                  <dd className="text-fg" dir="auto">
                    {String(val)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded border border-border bg-surface p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="label-mono text-muted">{tp(t.product.priceAcross, storeCount)}</p>
            <p className="text-xs text-muted">{tp(t.product.listings, listingCount)}</p>
          </div>

          {priceStats.min != null ? (
            <>
              {/* Wraps instead of overflowing: on a phone the best price plus
                  "up to" is wider than the screen. */}
              <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted">{t.product.bestPrice}</span>
                  <PriceTag amount={priceStats.min} currency={priceStats.currency} size="lg" emphasis />
                </div>
                {hasRange && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">{t.product.upTo}</span>
                    <PriceTag amount={priceStats.max} currency={priceStats.currency} size="md" className="text-muted" />
                  </div>
                )}
              </div>

              {cheapest && (
                <p className="text-sm text-muted">
                  {t.product.cheapestAt} <span className="font-medium text-fg">{cheapest.platform.name}</span>
                  {' · '}
                  <a href="#offers" className="text-brand hover:underline">
                    {tp(t.product.compareAll, storeCount)}
                  </a>
                </p>
              )}
              <p className="flex flex-wrap gap-x-4 text-xs text-muted">
                {priceStats.avg != null && (
                  <span>{tf(t.product.average, { price: fmt.currency(priceStats.avg, priceStats.currency) })}</span>
                )}
                {lastChecked && <span>{tf(t.product.pricesChecked, { when: fmt.relative(lastChecked, now) })}</span>}
              </p>
              {cheapest && cheapestHref && (
                <a
                  href={cheapestHref}
                  target="_blank"
                  rel={OUTBOUND_REL}
                  aria-label={tf(t.product.goToStoreNewTab, { store: cheapest.platform.name })}
                  className={buttonClassName({ size: 'lg', className: 'mt-1 w-full sm:w-auto sm:self-start' })}
                >
                  {tf(t.product.goToStore, { store: cheapest.platform.name })}
                  <ArrowUpRight className="flip-rtl h-4 w-4" aria-hidden />
                </a>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">{t.product.noPrices}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {isAuthenticated ? (
            <>
              <Button
                variant={isWatched ? 'secondary' : 'primary'}
                size="lg"
                loading={watchlistPending}
                aria-pressed={isWatched}
                leftIcon={<Heart className={isWatched ? 'h-4 w-4 fill-current text-brand' : 'h-4 w-4'} aria-hidden />}
                onClick={() => toggleWatchlist({ productId: product.id, isWatched })}
              >
                {isWatched ? t.product.watching : t.product.watch}
              </Button>
              <Button variant="outline" size="lg" leftIcon={<Bell className="h-4 w-4" aria-hidden />} onClick={() => openAlertModal(product.id)}>
                {t.product.setAlert}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="lg"
              aria-pressed={isWatched}
              leftIcon={<Heart className={isWatched ? 'h-4 w-4 fill-current text-brand' : 'h-4 w-4'} aria-hidden />}
              onClick={() => toggleWatchlist({ productId: product.id, isWatched })}
            >
              {isWatched ? t.product.saved : t.product.saveWithoutAccount}
            </Button>
          )}
        </div>

        {(product.gtin || product.upc || product.mpn) && (
          <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted" dir="ltr">
            {product.gtin && <span>GTIN {product.gtin}</span>}
            {product.upc && <span>UPC {product.upc}</span>}
            {product.mpn && <span>MPN {product.mpn}</span>}
          </p>
        )}
      </div>
    </section>
  );
}
