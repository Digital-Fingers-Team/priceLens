'use client';
import { PackageSearch } from 'lucide-react';
import { EmptyState } from '@/components/ui/state';
import { useI18n } from '@/lib/i18n/provider';
import type { SearchHit } from '@/types/search.types';
import { ProductCard } from './product-card';
import { ProductCardSkeleton } from './product-card-skeleton';

interface ProductListProps {
  products: SearchHit[];
  isLoading?: boolean;
  skeletonCount?: number;
  /**
   * A heading for screen readers. Cards use h3, so a page that puts the grid
   * straight under its h1 passes one to keep the heading order (WCAG 1.3.1).
   */
  heading?: string;
}

const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

export function ProductList({ products, isLoading = false, skeletonCount = 12, heading }: ProductListProps) {
  const { t } = useI18n();

  if (isLoading) {
    return (
      <div className={GRID}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <EmptyState icon={<PackageSearch className="h-5 w-5" />} title={t.search.noProducts} description={t.search.noProductsHint} />
    );
  }

  return (
    <>
      {heading && <h2 className="sr-only">{heading}</h2>}
      <div className={GRID}>
        {products.map((product, i) => (
          // The widest grid shows four per row.
          <ProductCard key={product.id} product={product} priority={i < 4} />
        ))}
      </div>
    </>
  );
}
