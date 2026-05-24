'use client';
import Image from 'next/image';
import { ShieldCheck, Heart, Bell, Store, Tag, ExternalLink } from 'lucide-react';
import type { CanonicalProduct } from '@/types/product.types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils/format';
import { TIER_LABELS } from '@/config/constants';
import { useAuthStore } from '@/lib/store/auth.store';
import { useIsWatched, useToggleWatchlist } from '@/lib/hooks/use-watchlist';
import { useUiStore } from '@/lib/store/ui.store';

interface ProductHeaderProps {
  product: CanonicalProduct;
}

export function ProductHeader({ product }: ProductHeaderProps) {
  const { isAuthenticated } = useAuthStore();
  const isWatched = useIsWatched(product.id);
  const { mutate: toggleWatchlist, isPending: watchlistPending } = useToggleWatchlist();
  const openAlertModal = useUiStore((s) => s.openAlertModal);

  const { priceStats } = product;
  const hasRange = priceStats.min != null && priceStats.max != null && priceStats.min !== priceStats.max;
  const listingCount = product._count?.sourceListings ?? product.sourceListings?.length ?? 0;

  const attrs = product.attributes as Record<string, string>;

  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
      {/* Image */}
      <div className="relative aspect-square rounded-2xl overflow-hidden bg-ink-800 border border-ink-700">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.title}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-contain p-8"
            priority
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Store className="w-20 h-20 text-ink-700" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-5">

        {/* Brand + badges */}
        <div className="flex items-center flex-wrap gap-2">
          {product.brand && (
            <span className="text-sm font-semibold text-ink-400 uppercase tracking-wider">
              {product.brand}
            </span>
          )}
          {product.isVerified && (
            <Badge variant="success" dot>
              <ShieldCheck className="w-3 h-3" /> Verified
            </Badge>
          )}
          <Badge variant="outline">{TIER_LABELS[product.tier] ?? product.tier}</Badge>
          <Badge variant="default">
            <Tag className="w-3 h-3 mr-1" />{product.category.name}
          </Badge>
        </div>

        {/* Title */}
        <h1 className="text-2xl sm:text-3xl font-bold text-ink-50 leading-tight">
          {product.title}
        </h1>

        {/* Key attributes */}
        {Object.keys(attrs).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(attrs).slice(0, 6).map(([key, val]) => (
              <span
                key={key}
                className="px-2.5 py-1 rounded-lg bg-ink-800 border border-ink-700 text-xs text-ink-300"
              >
                <span className="text-ink-500 capitalize">{key.replace(/_/g, ' ')}: </span>
                {String(val)}
              </span>
            ))}
          </div>
        )}

        {/* Price section — always shows range, never just one price */}
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider">
              Price Across {listingCount} Store{listingCount !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-1 text-xs text-ink-500">
              <Store className="w-3.5 h-3.5" />
              <span>{listingCount} listing{listingCount !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {priceStats.min != null ? (
            <div className="space-y-1">
              {/* Best price */}
              <div className="flex items-baseline gap-3">
                <div>
                  <p className="text-[10px] text-ink-500 mb-0.5">Best price</p>
                  <span className="text-4xl font-black text-signal tracking-tight">
                    {formatCurrency(priceStats.min)}
                  </span>
                </div>
                {hasRange && (
                  <div>
                    <p className="text-[10px] text-ink-500 mb-0.5">Up to</p>
                    <span className="text-xl font-semibold text-ink-400">
                      {formatCurrency(priceStats.max)}
                    </span>
                  </div>
                )}
              </div>

              {/* Avg */}
              {priceStats.avg != null && (
                <p className="text-xs text-ink-500">
                  Avg: <span className="text-ink-300">{formatCurrency(priceStats.avg)}</span>
                </p>
              )}
            </div>
          ) : (
            <p className="text-ink-500 text-sm italic">No current prices available</p>
          )}
        </div>

        {/* Identifiers */}
        <div className="flex flex-wrap gap-3 text-xs text-ink-500">
          {product.gtin && <span>GTIN: <span className="text-ink-400 font-mono">{product.gtin}</span></span>}
          {product.upc && <span>UPC: <span className="text-ink-400 font-mono">{product.upc}</span></span>}
          {product.mpn && <span>MPN: <span className="text-ink-400 font-mono">{product.mpn}</span></span>}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 pt-1">
          {isAuthenticated ? (
            <>
              <Button
                variant={isWatched ? 'secondary' : 'primary'}
                size="lg"
                loading={watchlistPending}
                leftIcon={<Heart className={isWatched ? 'w-5 h-5 fill-current text-red-400' : 'w-5 h-5'} />}
                onClick={() => toggleWatchlist({ productId: product.id, isWatched })}
              >
                {isWatched ? 'Watching' : 'Watch Price'}
              </Button>
              <Button
                variant="outline"
                size="lg"
                leftIcon={<Bell className="w-5 h-5" />}
                onClick={() => openAlertModal(product.id)}
              >
                Set Alert
              </Button>
            </>
          ) : (
            <Button variant="outline" size="lg" leftIcon={<Heart className="w-5 h-5" />}>
              Sign in to watch
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}