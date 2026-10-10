'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ProductList } from '@/components/product/product-list';
import { SearchBar } from '@/components/search/search-bar';
import { SearchFilters } from '@/components/search/search-filters';
import { SortSelect } from '@/components/search/sort-select';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { ErrorState } from '@/components/ui/state';
import { useSearch } from '@/lib/hooks/use-search';
import { localizePath } from '@/lib/i18n/config';
import { useRouter } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { useSearchStore } from '@/lib/store/search.store';
import { parseSearchParams, searchHref, withChanges } from '@/lib/search-url';
import { cn } from '@/lib/utils/cn';
import type { SearchFilters as SearchFiltersType, SearchResponse } from '@/types/search.types';

/** How long a search navigation may take before it is redone as a full page load (QA-18). */
const NAVIGATION_FALLBACK_MS = 6_000;

/** The first page, fetched while the server rendered this page (page.tsx). */
export interface InitialSearch {
  filters: SearchFiltersType;
  data: SearchResponse;
  fetchedAt: number;
}

export function SearchPageClient({ initial }: { initial: InitialSearch | null }) {
  const { t, tp, locale } = useI18n();
  const filtersOpen = useSearchStore((state) => state.isFilterPanelOpen);
  const router = useRouter();
  const searchParams = useSearchParams();
  // The URL is the state (FE-03): no copy in a store to drift from it.
  const filters = parseSearchParams(searchParams);

  const { data, isLoading, isFetching, isError, isPlaceholderData, refetch } = useSearch(filters, initial);
  // The error replaces the results only when there are none for this search:
  // a failed refresh of the same search (focus, live-fetch polling, a
  // resubmit) keeps what is on screen. Placeholder data belongs to the
  // previous search, so a failed new search still says so.
  const failed = isError && (!data || isPlaceholderData);

  // A new search, filter, sort or page is a navigation: the server renders
  // the results (page.tsx) and the page swaps them in when they arrive. Until
  // the URL changes, the current results stay, dimmed and marked busy
  // (audit 11).
  //
  // On phones Next sometimes aborts that request and the URL never changes,
  // so a sort did nothing (QA-18). A navigation that has not arrived after a
  // few seconds is therefore finished as a full page load of the same URL.
  const currentQuery = searchParams.toString();
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => setPending(null), [currentQuery]);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => window.location.assign(pending), NAVIGATION_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [pending]);
  function navigate(changes: Partial<SearchFiltersType>) {
    const href = searchHref(withChanges(filters, changes));
    if (new URLSearchParams(href.split('?')[1] ?? '').toString() !== currentQuery) setPending(localizePath(locale, href));
    router.push(href, { scroll: false });
  }
  const navigating = pending != null;
  const busy = isFetching || navigating;

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
          {/* Always rendered, so the heading keeps its height when the count
              arrives: on a phone the count wrapped the heading onto a second
              line and pushed the results down (CLS 0.16, audit 08). */}
          <span
            className="inline-block min-w-32 text-sm text-muted"
            aria-hidden={!data || isLoading}
            // Read by the analytics tracker (components/analytics/page-tracker.tsx).
            data-search-total={data && !isLoading ? data.total : undefined}
          >
            {data && !isLoading ? tp(t.search.productCount, data.total) : '\u00a0'}
          </span>
        </h1>
        <SortSelect value={filters} onChange={navigate} />
      </div>

      {/* Side by side only while the sidebar is open: collapsed, the Filters
          button sits above the results and they use the full width. Below lg
          the filters open as a sheet. */}
      <div className={cn('flex flex-col items-stretch gap-6', filtersOpen && 'lg:flex-row lg:items-start lg:gap-8')}>
        <SearchFilters applied={filters} onApply={navigate} />

        <div className="flex min-w-0 flex-1 flex-col gap-8">
          {failed ? (
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
                aria-busy={busy || undefined}
                className={cn(
                  busy && !isLoading && 'opacity-60 transition-opacity',
                  isFetching && !isLoading && 'pointer-events-none',
                )}
              >
                <ProductList
                  products={data?.hits ?? []}
                  isLoading={isLoading}
                  skeletonCount={filters.limit ?? 20}
                  heading={t.search.productsHeading}
                />
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
