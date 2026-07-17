'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Heart, ExternalLink, ShieldCheck, Store } from 'lucide-react';
import type { SearchHit } from '@/types/search.types';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils/format';
import { TIER_LABELS } from '@/config/constants';
import { useIsWatched, useToggleWatchlist } from '@/lib/hooks/use-watchlist';
import { useAuthStore } from '@/lib/store/auth.store';
import { cn } from '@/lib/utils/cn';

interface ProductCardProps {
  product: SearchHit;
}

export function ProductCard({ product }: ProductCardProps) {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const isWatched = useIsWatched(product.id);
  const { mutate: toggleWatchlist, isPending } = useToggleWatchlist();

  const hasPrice = product.minPriceUsd != null;
  const hasPriceRange = hasPrice && product.maxPriceUsd != null && product.minPriceUsd !== product.maxPriceUsd;
  const titleHtml = product._formatted?.title ?? product.title;

  function handleWatchlist(e: React.MouseEvent) {
    e.preventDefault();
    if (!isAuthenticated) {
      // Send guests to sign in instead of silently doing nothing
      router.push('/login');
      return;
    }
    toggleWatchlist({ productId: product.id, isWatched });
  }

  return (
    <Link href={`/products/${product.slug}`} className="group block min-w-0">
      <article className={cn(
        'h-full min-w-0 rounded-xl border border-ink-700 bg-ink-900',
        'transition-all duration-200',
        'group-hover:border-ink-500 group-hover:bg-ink-800',
        'group-hover:shadow-lg group-hover:shadow-black/30',
      )}>

        {/* Image */}
        <div className="relative w-full aspect-[4/3] rounded-t-xl overflow-hidden bg-ink-800">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-contain p-4 transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Store className="w-12 h-12 text-ink-700" />
            </div>
          )}

          {/* Badges overlay */}
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
            {product.isVerified && (
              <Badge variant="success" dot>
                <ShieldCheck className="w-3 h-3" /> Verified
              </Badge>
            )}
          </div>

          {/* Watchlist button */}
          <button
            onClick={handleWatchlist}
            disabled={isPending}
            className={cn(
              'absolute top-3 right-3 w-8 h-8 rounded-full',
              'flex items-center justify-center',
              'transition-all duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/60 focus-visible:opacity-100',
              isWatched
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : 'bg-ink-900/80 text-ink-400 border border-ink-700 opacity-0 group-hover:opacity-100 focus:opacity-100',
              'hover:scale-110 disabled:opacity-50',
            )}
            aria-label={
              !isAuthenticated
                ? 'Sign in to save to watchlist'
                : isWatched
                ? 'Remove from watchlist'
                : 'Add to watchlist'
            }
          >
            <Heart className={cn('w-4 h-4', isWatched && 'fill-current')} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Brand */}
          {product.brand && (
            <p className="text-xs font-medium text-ink-500 uppercase tracking-wider">
              {product.brand}
            </p>
          )}

          {/* Title — Meilisearch highlights with <mark> */}
          <h3
            className="text-sm font-semibold text-ink-100 leading-snug line-clamp-2 [&_mark]:bg-signal/20 [&_mark]:text-signal [&_mark]:rounded"
            dangerouslySetInnerHTML={{ __html: titleHtml }}
          />

          {/* Store count (distinct retailers, not raw listing rows) */}
          <div className="flex items-center gap-1 text-xs text-ink-500">
            <Store className="w-3.5 h-3.5" />
            <span>
              {product.listingCount === 0
                ? 'No listings yet'
                : `${product.storeCount ?? product.listingCount} store${(product.storeCount ?? product.listingCount) === 1 ? '' : 's'}`}
            </span>
          </div>

          {/* Price range — the core of the UI */}
          <div className="pt-1 border-t border-ink-800">
            {hasPrice ? (
              <>
                <p className="text-[10px] font-medium text-ink-500 uppercase tracking-wider mb-1">
                  Price range
                </p>
                {hasPriceRange ? (
                  <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 min-w-0">
                    <span className="text-lg font-bold text-signal whitespace-nowrap">
                      {formatCurrency(product.minPriceUsd, product.priceStats?.currency)}
                    </span>
                    <span className="text-ink-500 text-sm">—</span>
                    <span className="text-sm font-medium text-ink-300 whitespace-nowrap">
                      {formatCurrency(product.maxPriceUsd, product.priceStats?.currency)}
                    </span>
                  </div>
                ) : (
                  <span className="text-lg font-bold text-signal">
                    {formatCurrency(product.minPriceUsd, product.priceStats?.currency)}
                  </span>
                )}
              </>
            ) : (
              <p className="text-sm text-ink-500 italic">No price data</p>
            )}
          </div>

          {/* CTA */}
          <div className="flex items-center justify-between pt-1">
            <Badge
              variant={
                product.tier === 'ULTRA_PREMIUM'
                  ? 'premium'
                  : product.tier === 'BUDGET'
                  ? 'info'
                  : 'outline'
              }
            >
              {TIER_LABELS[product.tier] ?? product.tier}
            </Badge>
            <span className="flex items-center gap-1 text-xs font-medium text-signal transition-colors group-hover:text-signal-dim">
              Compare <ExternalLink className="w-3 h-3" />
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
