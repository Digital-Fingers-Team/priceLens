'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Heart, ShieldCheck, Store } from 'lucide-react';
import type { SearchHit } from '@/types/search.types';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils/format';
import { TIER_LABELS } from '@/config/constants';
import { useIsWatched, useToggleWatchlist } from '@/lib/hooks/use-watchlist';
import { useAuthStore } from '@/lib/store/auth.store';
import { cn } from '@/lib/utils/cn';
import { LinkPending } from '@/components/ui/link-pending';

interface ProductCardProps {
  product: SearchHit;
  /** Load the image eagerly: set for the first row, where it is usually the LCP. */
  priority?: boolean;
}

export function ProductCard({ product, priority = false }: ProductCardProps) {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const isWatched = useIsWatched(product.id);
  const { mutate: toggleWatchlist, isPending } = useToggleWatchlist();

  const hasPrice = product.minPriceUsd != null;
  const hasPriceRange = hasPrice && product.maxPriceUsd != null && product.minPriceUsd !== product.maxPriceUsd;

  function handleWatchlist(e: React.MouseEvent) {
    e.preventDefault();
    if (!isAuthenticated) {
      // Send guests to sign in instead of silently doing nothing
      router.push(`/login?next=${encodeURIComponent(`/products/${product.slug}`)}`);
      return;
    }
    toggleWatchlist({ productId: product.id, isWatched });
  }

  const storeTotal = product.storeCount ?? product.listingCount;
  const href = `/products/${product.slug}`;

  // An article with one stretched link (the title) and the watchlist button
  // beside it, not a link wrapping a button (nested interactive content).
  // Below sm the card is a compact row, so a phone shows several results per
  // screen instead of one (audit 06, U-06/U-07).
  return (
    <article
      className={cn(
        'group relative flex sm:block h-full min-w-0 rounded-xl border border-ink-700 bg-ink-900',
        'transition-colors duration-200 hover:border-ink-500 hover:bg-ink-800',
        'focus-within:border-signal/50',
      )}
    >
      {/* Image */}
      <div className="relative w-28 shrink-0 aspect-square sm:w-full sm:aspect-[4/3] rounded-l-xl sm:rounded-l-none sm:rounded-t-xl overflow-hidden bg-ink-800">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 112px, (max-width: 1024px) 50vw, 33vw"
            priority={priority}
            className="object-contain p-2 sm:p-4"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Store className="w-10 h-10 text-ink-700" aria-hidden />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3 sm:p-4 sm:gap-3">
        <div className="flex items-center gap-2 pr-10">
          {product.brand && (
            <p className="text-xs font-medium text-ink-500 uppercase tracking-wider truncate">{product.brand}</p>
          )}
          {product.isVerified && (
            <Badge variant="success">
              <ShieldCheck className="w-3 h-3" aria-hidden /> Verified
            </Badge>
          )}
        </div>

        {/* Title: store-supplied text, always rendered as text. Three lines,
            so storage/RAM/color -- what tells variants apart -- stay visible. */}
        <h3 dir="auto" className="text-sm font-semibold text-ink-100 leading-snug line-clamp-3">
          <Link
            href={href}
            className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none"
          >
            {product.title}
            <LinkPending />
          </Link>
        </h3>

        <div className="mt-auto space-y-1">
          {hasPrice ? (
            <p className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-xs text-ink-500">From</span>
              <span className="text-lg font-bold text-signal whitespace-nowrap">
                {formatCurrency(product.minPriceUsd, product.priceStats?.currency)}
              </span>
              {hasPriceRange && (
                <span className="text-xs text-ink-500 whitespace-nowrap">
                  to {formatCurrency(product.maxPriceUsd, product.priceStats?.currency)}
                </span>
              )}
            </p>
          ) : (
            <p className="text-sm text-ink-500">No current price</p>
          )}
          <p className="flex items-center justify-between gap-2 text-xs text-ink-500">
            <span>
              {product.listingCount === 0
                ? 'No stores yet'
                : `Compare ${storeTotal} store${storeTotal === 1 ? '' : 's'}`}
            </span>
            <span className="hidden sm:inline">{TIER_LABELS[product.tier] ?? product.tier}</span>
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
          'absolute top-2 right-2 z-10 w-10 h-10 rounded-full',
          'flex items-center justify-center transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/60',
          isWatched
            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
            : 'bg-ink-900/80 text-ink-400 border border-ink-700 hover:text-ink-100',
          'disabled:opacity-50',
        )}
        aria-pressed={isAuthenticated ? isWatched : undefined}
        aria-label={
          !isAuthenticated
            ? `Sign in to save ${product.title}`
            : isWatched
            ? `Remove ${product.title} from watchlist`
            : `Add ${product.title} to watchlist`
        }
      >
        <Heart className={cn('w-4 h-4', isWatched && 'fill-current')} aria-hidden />
      </button>
    </article>
  );
}
