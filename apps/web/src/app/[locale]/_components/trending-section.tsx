// Server component — no 'use client' needed
import { searchApi } from '@/lib/api/search.api';
import { ProductCard } from '@/components/product/product-card';
import { EmptyState } from '@/components/ui/state';
import type { Locale } from '@/lib/i18n/config';
import { getI18n } from '@/lib/i18n/server';
import type { SearchHit } from '@/types/search.types';

export async function TrendingSection({ locale }: { locale: Locale }) {
  const { t } = getI18n(locale);
  let products: SearchHit[] = [];

  try {
    const result = await searchApi.search({
      q: '',
      sortBy: 'listingCount',
      sortDir: 'desc',
      limit: 8,
      page: 1,
    });
    products = result.hits;
  } catch {
    // Non-critical: say so and keep the page.
    return <EmptyState title={t.home.trendingUnavailable} />;
  }

  if (products.length === 0) {
    return <EmptyState title={t.home.trendingEmpty} />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product, i) => (
        <ProductCard key={product.id} product={product} priority={i < 4} />
      ))}
    </div>
  );
}
