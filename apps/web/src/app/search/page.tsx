'use client';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSearch } from '@/lib/hooks/use-search';
import { parseSearchParams, searchHref, withChanges } from '@/lib/search-url';
import { SearchBar } from '@/components/search/search-bar';
import { SearchFilters } from '@/components/search/search-filters';
import { ProductList } from '@/components/product/product-list';
import { buttonClassName } from '@/components/ui/button-styles';
import { cn } from '@/lib/utils/cn';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { SearchFilters as SearchFiltersType } from '@/types/search.types';

/** Up to five page numbers, centred on the current page where possible. */
function pageWindow(page: number, totalPages: number): number[] {
  const size = Math.min(5, totalPages);
  const first = Math.min(Math.max(1, page - 2), totalPages - size + 1);
  return Array.from({ length: size }, (_, i) => first + i);
}

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // The URL is the state (FE-03): no copy in a store to drift from it.
  const filters = parseSearchParams(searchParams);

  const { data, isLoading, isFetching, isError, refetch } = useSearch(filters);

  function navigate(changes: Partial<SearchFiltersType>) {
    router.push(searchHref(withChanges(filters, changes)), { scroll: false });
  }

  function handleSearch(q: string) {
    const trimmed = q.trim();
    if (trimmed === filters.q) {
      // Same query resubmitted -- the URL would not change, so nothing would
      // normally trigger a new request. Force a fresh read from the DB.
      refetch();
      return;
    }
    navigate({ q: trimmed });
  }

  const page = filters.page ?? 1;
  const totalPages = data ? Math.ceil(data.total / (filters.limit ?? 20)) : 0;
  const pageHref = (p: number) => searchHref({ ...filters, page: p });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Search bar */}
      <SearchBar
        initialValue={filters.q}
        onSearch={handleSearch}
        className="max-w-2xl"
      />

      {/* Query summary */}
      {(filters.q || data) && (
        <div className="flex items-center gap-2 text-sm">
          {filters.q ? (
            <>
              <span className="text-ink-500">Results for</span>
              <span dir="auto" className="font-semibold text-ink-100">&quot;{filters.q}&quot;</span>
            </>
          ) : (
            <span className="font-semibold text-ink-100">All products</span>
          )}
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

      {/* Stacks below lg. The sidebar is w-full/shrink-0 by design, so leaving
          this a row on phones let it claim the entire width and push the
          results grid off the side of the screen. */}
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-stretch lg:items-start">
        {/* Sidebar filters */}
        <SearchFilters applied={filters} onApply={navigate} />

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

              {/* Pagination: real links, so a page can be opened in a new tab
                  and back/forward walks through the pages. */}
              {totalPages > 1 && (
                <nav aria-label="Pagination" className="flex items-center justify-between pt-4 border-t border-ink-800">
                  <PageLink href={pageHref(page - 1)} disabled={page <= 1}>
                    <ChevronLeft className="w-4 h-4" /> Previous
                  </PageLink>

                  <div className="flex items-center gap-1">
                    {pageWindow(page, totalPages).map((p) => (
                      <Link
                        key={p}
                        href={pageHref(p)}
                        aria-current={p === page ? 'page' : undefined}
                        className={cn(
                          'w-8 h-8 inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors',
                          p === page ? 'bg-signal text-ink-950' : 'text-ink-400 hover:bg-ink-800',
                        )}
                      >
                        {p}
                      </Link>
                    ))}
                  </div>

                  <PageLink href={pageHref(page + 1)} disabled={page >= totalPages}>
                    Next <ChevronRight className="w-4 h-4" />
                  </PageLink>
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const className = buttonClassName({ variant: 'outline', size: 'sm' });
  if (disabled) {
    return (
      <span aria-disabled="true" className={cn(className, 'opacity-40 cursor-not-allowed')}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
