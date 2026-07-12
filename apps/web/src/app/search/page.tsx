'use client';
import { useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSearch } from '@/lib/hooks/use-search';
import { useSearchStore } from '@/lib/store/search.store';
import { SearchBar } from '@/components/search/search-bar';
import { SearchFilters } from '@/components/search/search-filters';
import { ProductList } from '@/components/product/product-list';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { filters, setFilters, setFilter } = useSearchStore();
  const isFirstRender = useRef(true);

  // Sync URL params → store on initial load
  useEffect(() => {
    if (!isFirstRender.current) return;
    isFirstRender.current = false;

    const q = searchParams.get('q') ?? '';
    const page = Number(searchParams.get('page') ?? 1);
    const brand = searchParams.get('brand') ?? undefined;
    const minPrice = searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined;
    const maxPrice = searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined;

    setFilters({ q, page, brand, minPrice, maxPrice });
  }, [searchParams, setFilters]);

  // Sync store → URL whenever filters change
  useEffect(() => {
    if (isFirstRender.current) return;
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.page && filters.page > 1) params.set('page', String(filters.page));
    if (filters.brand) params.set('brand', filters.brand);
    if (filters.minPrice) params.set('minPrice', String(filters.minPrice));
    if (filters.maxPrice) params.set('maxPrice', String(filters.maxPrice));
    router.replace(`/search?${params.toString()}`, { scroll: false });
  }, [filters, router]);

  const { data, isLoading, isFetching, isError, refetch } = useSearch(filters);

  function handleSearch(q: string) {
    const trimmed = q.trim();
    if (trimmed === filters.q.trim()) {
      // Same query resubmitted — filters won't change, so nothing would
      // normally trigger a new request. Force a fresh read from the DB.
      refetch();
      return;
    }
    setFilters({ q: trimmed, page: 1 });
  }

  const page = filters.page ?? 1;
  const totalPages = data ? Math.ceil(data.total / (filters.limit ?? 20)) : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Search bar */}
      <SearchBar
        initialValue={filters.q}
        onSearch={handleSearch}
        className="max-w-2xl"
      />

      {/* Query summary */}
      {filters.q && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-ink-500">Results for</span>
          <span className="font-semibold text-ink-100">&quot;{filters.q}&quot;</span>
          {data && !isLoading && (
            <span className="text-ink-500">
              — {data.total.toLocaleString()} product{data.total !== 1 ? 's' : ''}
              {data.processingTimeMs > 0 && (
                <span> in {data.processingTimeMs}ms</span>
              )}
            </span>
          )}
        </div>
      )}

      <div className="flex gap-8 items-start">
        {/* Sidebar filters */}
        <SearchFilters />

        {/* Results */}
        <div className="flex-1 min-w-0 space-y-6">
          {isError ? (
            <div className="text-center py-16">
              <p className="text-ink-500">Search failed. Please try again.</p>
            </div>
          ) : (
            <>
              <div className={isFetching && !isLoading ? 'opacity-60 pointer-events-none transition-opacity' : ''}>
                <ProductList
                  products={data?.hits ?? []}
                  isLoading={isLoading}
                  skeletonCount={filters.limit ?? 20}
                />
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-ink-800">
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<ChevronLeft className="w-4 h-4" />}
                    disabled={page <= 1}
                    onClick={() => setFilter('page', page - 1)}
                  >
                    Previous
                  </Button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      const p = i + 1;
                      return (
                        <button
                          key={p}
                          onClick={() => setFilter('page', p)}
                          className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                            p === page
                              ? 'bg-signal text-ink-950'
                              : 'text-ink-400 hover:bg-ink-800'
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                    {totalPages > 5 && (
                      <span className="text-ink-600 px-1">…</span>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    rightIcon={<ChevronRight className="w-4 h-4" />}
                    disabled={page >= totalPages}
                    onClick={() => setFilter('page', page + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
