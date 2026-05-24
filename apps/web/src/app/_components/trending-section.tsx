// Server component — no 'use client' needed
import { searchApi } from '@/lib/api/search.api';
import { ProductCard } from '@/components/product/product-card';
import type { SearchHit } from '@/types/search.types';

export async function TrendingSection() {
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
    // Silently degrade — trending is non-critical
    return (
      <p className="text-sm text-ink-500 py-8 text-center">
        Trending products unavailable right now.
      </p>
    );
  }

  if (products.length === 0) {
    return (
      <p className="text-sm text-ink-500 py-8 text-center">
        No products indexed yet. Try a search above.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}