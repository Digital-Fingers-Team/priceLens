'use client';
import Link from 'next/link';
import Image from 'next/image';
import { Heart, Bell, Trash2, Store } from 'lucide-react';
import { useWatchlist, useToggleWatchlist } from '@/lib/hooks/use-watchlist';
import { useAuthStore } from '@/lib/store/auth.store';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatRelativeTime } from '@/lib/utils/format';
import { useUiStore } from '@/lib/store/ui.store';
import { redirect } from 'next/navigation';

export default function WatchlistPage() {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    redirect('/login');
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="flex items-center gap-3">
        <Heart className="w-6 h-6 text-red-400" />
        <h1 className="text-2xl font-bold text-ink-100">My Watchlist</h1>
      </div>
      <WatchlistContent />
    </div>
  );
}

function WatchlistContent() {
  const { data: items, isLoading, isError } = useWatchlist();
  const { mutate: toggleWatchlist } = useToggleWatchlist();
  const openAlertModal = useUiStore((s) => s.openAlertModal);

  if (isError) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
        <h2 className="text-lg font-semibold text-red-300">Watchlist unavailable</h2>
        <p className="text-sm text-ink-400 mt-1">
          The backend could not load your real watchlist data right now.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
        <Heart className="w-12 h-12 text-ink-700" />
        <div>
          <h2 className="text-lg font-semibold text-ink-300">Your watchlist is empty</h2>
          <p className="text-sm text-ink-500 mt-1">
            Search for products and click the heart icon to track prices.
          </p>
        </div>
        <Link href="/search">
          <Button variant="primary">Browse products</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-500">{items.length} product{items.length !== 1 ? 's' : ''} watched</p>

      {items.map((item) => {
        const product = item.canonicalProduct;
        const listingCount = product._count?.sourceListings ?? 0;

        return (
          <div
            key={item.id}
            className="rounded-xl border border-ink-700 bg-ink-900 p-4 flex items-center gap-4 group hover:border-ink-500 transition-colors"
          >
            {/* Thumbnail */}
            <Link href={`/products/${product.slug}`} className="shrink-0">
              <div className="w-16 h-16 rounded-xl bg-ink-800 border border-ink-700 overflow-hidden relative">
                {product.imageUrl ? (
                  <Image src={product.imageUrl} alt={product.title} fill className="object-contain p-2" sizes="64px" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Store className="w-6 h-6 text-ink-600" />
                  </div>
                )}
              </div>
            </Link>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <Link href={`/products/${product.slug}`}>
                <h3 className="font-semibold text-ink-100 text-sm line-clamp-1 hover:text-signal transition-colors">
                  {product.title}
                </h3>
              </Link>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {item.bestPrice != null ? (
                  <span className="text-signal font-bold text-base">
                    {formatCurrency(Number(item.bestPrice))}
                  </span>
                ) : (
                  <span className="text-ink-500 text-sm italic">No current price</span>
                )}
                <span className="text-xs text-ink-500 flex items-center gap-1">
                  <Store className="w-3 h-3" />
                  {listingCount} store{listingCount !== 1 ? 's' : ''}
                </span>
                <span className="text-xs text-ink-600">
                  Added {formatRelativeTime(item.createdAt)}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="xs"
                leftIcon={<Bell className="w-3.5 h-3.5" />}
                onClick={() => openAlertModal(product.id)}
              >
                Alert
              </Button>
              <Button
                variant="ghost"
                size="xs"
                leftIcon={<Trash2 className="w-3.5 h-3.5 text-red-400" />}
                onClick={() => toggleWatchlist({ productId: product.id, isWatched: true })}
              >
                Remove
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
