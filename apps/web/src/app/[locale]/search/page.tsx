'use client';
import { useSearchParams } from 'next/navigation';
import { ProductList } from '@/components/product/product-list';
import { SearchBar } from '@/components/search/search-bar';
import { SearchFilters } from '@/components/search/search-filters';
import { SortSelect } from '@/components/search/sort-select';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { ErrorState } from '@/components/ui/state';
import { useSearch } from '@/lib/hooks/use-search';
import { useRouter } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { parseSearchParams, searchHref, withChanges } from '@/lib/search-url';
import { cn } from '@/lib/utils/cn';
import type { SearchFilters as SearchFiltersType } from '@/types/search.types';

export default function SearchPage() {
  const { t, tp } = useI18n();
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

  return (
    <div className="mx-auto flex max-w-page flex-col gap-6 px-4 py-8 sm:px-6">
      <SearchBar initialValue={filters.q} onSearch={handleSearch} className="max-w-2xl" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex flex-wrap items-baseline gap-2 text-base">
          {filters.q ? (
            <>
              <span className="text-muted">{t.search.resultsFor}</span>
              <span dir="auto" className="font-semibold text-fg">
                “{filters.q}”
              </span>
            </>
          ) : (
            <span className="font-semibold text-fg">{t.search.allProducts}</span>
          )}
          {data && !isLoading && <span className="text-sm text-muted">{tp(t.search.productCount, data.total)}</span>}
        </h1>
        <SortSelect value={filters} onChange={navigate} />
      </div>

      {/* Stacks below lg (the filters open as a sheet there). */}
      <div className="flex flex-col items-stretch gap-6 lg:flex-row lg:items-start lg:gap-8">
        <SearchFilters applied={filters} onApply={navigate} />

        <div className="flex min-w-0 flex-1 flex-col gap-8">
          {isError ? (
            <ErrorState
              title={t.search.loadFailed}
              action={
                <Button variant="secondary" onClick={() => refetch()}>
                  {t.common.retry}
                </Button>
              }
            />
          ) : (
            <>
              <div
                aria-busy={isFetching || undefined}
                className={cn(isFetching && !isLoading && 'pointer-events-none opacity-60 transition-opacity')}
              >
                <ProductList products={data?.hits ?? []} isLoading={isLoading} skeletonCount={filters.limit ?? 20} />
              </div>
              {/* Real links, so a page can be opened in a new tab and
                  back/forward walks through the pages. */}
              <Pagination
                page={page}
                totalPages={totalPages}
                hrefFor={(p) => searchHref({ ...filters, page: p })}
                className="border-t border-border pt-6"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
