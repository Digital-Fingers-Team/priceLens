'use client';
import Image from 'next/image';
import { Heart, ImageOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { LinkPending } from '@/components/ui/link-pending';
import { useIsWatched, useToggleWatchlist } from '@/lib/hooks/use-watchlist';
import { Link, useRouter } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { useAuthStore } from '@/lib/store/auth.store';
import { cn } from '@/lib/utils/cn';
import { loginHref } from '@/lib/utils/next-path';
import type { SearchHit } from '@/types/search.types';

interface ProductCardProps {
  product: SearchHit;
  /** Load the image eagerly: set for the first row, where it is usually the LCP. */
  priority?: boolean;
}

export function ProductCard({ product, priority = false }: ProductCardProps) {
  const { t, tf, tp, fmt } = useI18n();
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const isWatched = useIsWatched(product.id);
  const { mutate: toggleWatchlist, isPending } = useToggleWatchlist();

  const hasPrice = product.minPriceUsd != null;
  const hasPriceRange = hasPrice && product.maxPriceUsd != null && product.minPriceUsd !== product.maxPriceUsd;
  const currency = product.priceStats?.currency;
  const href = `/products/${product.slug}`;

  function handleWatchlist(e: React.MouseEvent) {
    e.preventDefault();
    if (!isAuthenticated) {
      // Send guests to sign in instead of silently doing nothing
      router.push(loginHref(href));
      return;
    }
    toggleWatchlist({ productId: product.id, isWatched });
  }

  const storeTotal = product.storeCount ?? product.listingCount;

  // An article with one stretched link (the title) and the watchlist button
  // beside it, not a link wrapping a button (nested interactive content).
  // Below sm the card is a compact row, so a phone shows several results per
  // screen instead of one (audit 06, U-06/U-07).
  return (
    <article className="group relative flex h-full min-w-0 overflow-hidden rounded border border-border bg-surface transition-colors hover:border-border-strong focus-within:border-brand sm:flex-col">
      <div className="relative aspect-square w-28 shrink-0 bg-media sm:aspect-product sm:w-full">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 112px, (max-width: 1024px) 50vw, 25vw"
            priority={priority}
            className="object-contain p-2 sm:p-4"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted">
            <ImageOff className="h-6 w-6" aria-hidden />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3 sm:gap-3 sm:p-4">
        <div className="flex min-h-6 items-center gap-2 pe-10 sm:pe-0">
          {product.brand && <p className="label-mono truncate text-muted">{product.brand}</p>}
          {product.isVerified && <Badge variant="success">{t.product.verified}</Badge>}
        </div>

        {/* Title: store-supplied text, always rendered as text. Three lines,
            so storage/RAM/color -- what tells variants apart -- stay visible. */}
        <h3 dir="auto" className="line-clamp-3 text-sm font-medium text-fg">
          <Link href={href} className="after:absolute after:inset-0 focus-visible:outline-none">
            {product.title}
            <LinkPending />
          </Link>
        </h3>

        <div className="mt-auto flex flex-col gap-1">
          {hasPrice ? (
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-xs text-muted">{t.product.from}</span>
              <span className="whitespace-nowrap text-base font-semibold tabular-nums text-brand">
                {fmt.currency(product.minPriceUsd, currency)}
              </span>
              {hasPriceRange && (
                <span className="whitespace-nowrap text-xs tabular-nums text-muted">
                  {tf(t.product.to, { price: fmt.currency(product.maxPriceUsd, currency) })}
                </span>
              )}
            </p>
          ) : (
            <p className="text-sm text-muted">{t.product.noCurrentPrice}</p>
          )}
          <p className="flex items-center justify-between gap-2 text-xs text-muted">
            <span>{product.listingCount === 0 ? t.product.noStoresYet : tp(t.product.compareStores, storeTotal)}</span>
            <span className="hidden sm:inline">{t.tiers[product.tier] ?? product.tier}</span>
          </p>
        </div>
      </div>

      {/* Watchlist: always visible (touch screens have no hover), above the
          stretched link. */}
      <button
        type="button"
        onClick={handleWatchlist}
        disabled={isPending}
        className={cn(
          'absolute end-2 top-2 z-10 flex h-10 w-10 items-center justify-center rounded-full border transition-colors disabled:opacity-50',
          isWatched ? 'border-brand bg-brand-soft text-brand' : 'border-border bg-surface/90 text-muted hover:text-fg',
        )}
        aria-pressed={isAuthenticated ? isWatched : undefined}
        aria-label={
          !isAuthenticated
            ? tf(t.product.signInToSave, { title: product.title })
            : isWatched
              ? tf(t.product.removeFromWatchlist, { title: product.title })
              : tf(t.product.addToWatchlist, { title: product.title })
        }
      >
        <Heart className={cn('h-4 w-4', isWatched && 'fill-current')} aria-hidden />
      </button>
    </article>
  );
}
