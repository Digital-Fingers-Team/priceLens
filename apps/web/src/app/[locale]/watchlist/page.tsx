'use client';
import Image from 'next/image';
import { useEffect } from 'react';
import { Bell, Heart, ImageOff, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buttonClassName } from '@/components/ui/button-styles';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/state';
import { useToggleWatchlist, useWatchlist } from '@/lib/hooks/use-watchlist';
import { Link, useRouter } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { useAuthStore } from '@/lib/store/auth.store';
import { useUiStore } from '@/lib/store/ui.store';
import { loginHref } from '@/lib/utils/next-path';
import { AlertsSection } from './_components/alerts-section';

export default function WatchlistPage() {
  const { t } = useI18n();
  const { isAuthenticated, hasHydrated } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (hasHydrated && !isAuthenticated) {
      router.replace(loginHref('/watchlist'));
    }
  }, [hasHydrated, isAuthenticated, router]);

  if (!hasHydrated || !isAuthenticated) return null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6">
      <h1 className="text-xl font-semibold text-fg">{t.watchlist.title}</h1>
      <AlertsSection />
      <WatchlistContent />
    </div>
  );
}

function WatchlistContent() {
  const { t, tf, tp, fmt } = useI18n();
  const { data: items, isLoading, isError } = useWatchlist();
  const { mutate: toggleWatchlist } = useToggleWatchlist();
  const openAlertModal = useUiStore((s) => s.openAlertModal);

  if (isError) {
    return <ErrorState title={t.watchlist.unavailable} description={t.watchlist.unavailableBody} />;
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <EmptyState
        icon={<Heart className="h-5 w-5" />}
        title={t.watchlist.emptyTitle}
        description={t.watchlist.emptyBody}
        action={
          <Link href="/search" className={buttonClassName()}>
            {t.watchlist.browse}
          </Link>
        }
      />
    );
  }

  return (
    <section aria-labelledby="watched-heading" className="flex flex-col gap-3">
      <h2 id="watched-heading" className="label-mono text-muted">
        {tp(t.watchlist.count, items.length)}
      </h2>
      <ul className="divide-y divide-border rounded border border-border bg-surface">
        {items.map((item) => {
          const product = item.canonicalProduct;
          const storeCount = product.storeCount ?? product._count?.sourceListings ?? 0;
          return (
            <li key={item.id} className="flex flex-wrap items-center gap-4 p-4 sm:flex-nowrap">
              <Link href={`/products/${product.slug}`} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-sm border border-border bg-media" tabIndex={-1} aria-hidden>
                {product.imageUrl ? (
                  <Image src={product.imageUrl} alt="" fill className="object-contain p-2" sizes="64px" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-muted">
                    <ImageOff className="h-4 w-4" />
                  </span>
                )}
              </Link>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Link href={`/products/${product.slug}`} dir="auto" className="line-clamp-1 text-sm font-medium text-fg hover:text-brand">
                  {product.title}
                </Link>
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  {item.bestPrice != null ? (
                    <span className="text-base font-semibold tabular-nums text-brand">{fmt.currency(Number(item.bestPrice))}</span>
                  ) : (
                    <span className="text-sm text-muted">{t.product.noCurrentPrice}</span>
                  )}
                  <span className="text-xs text-muted">{tp(t.watchlist.stores, storeCount)}</span>
                  <span className="text-xs text-muted">{tf(t.watchlist.added, { when: fmt.relative(item.createdAt) })}</span>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="sm" leftIcon={<Bell className="h-4 w-4" aria-hidden />} onClick={() => openAlertModal(product.id)}>
                  {t.watchlist.alert}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<Trash2 className="h-4 w-4" aria-hidden />}
                  aria-label={tf(t.product.removeFromWatchlist, { title: product.title })}
                  onClick={() => toggleWatchlist({ productId: product.id, isWatched: true })}
                >
                  {t.watchlist.remove}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
