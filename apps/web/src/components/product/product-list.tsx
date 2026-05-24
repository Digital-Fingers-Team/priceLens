import { ProductCard } from './product-card';
import { ProductCardSkeleton } from './product-card-skeleton';
import type { SearchHit } from '@/types/search.types';
import { PackageSearch } from 'lucide-react';

interface ProductListProps {
  products: SearchHit[];
  isLoading?: boolean;
  skeletonCount?: number;
}

export function ProductList({
  products,
  isLoading = false,
  skeletonCount = 12,
}: ProductListProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <PackageSearch className="w-12 h-12 text-ink-700 mb-4" />
        <h3 className="text-lg font-semibold text-ink-300 mb-1">No products found</h3>
        <p className="text-sm text-ink-500">Try adjusting your search or filters.</p>
      </div>
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