import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getI18n, resolveLocale } from '@/lib/i18n/server';
import { localizedAlternates, NOINDEX } from '@/lib/seo';
import { searchApi } from '@/lib/api/search.api';
import { parseSearchParams } from '@/lib/search-url';
import { SearchPageClient, type InitialSearch } from './_search-client';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function filtersFrom(raw: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first != null) params.set(key, first);
  }
  return parseSearchParams(params);
}

/**
 * Only the plain browse page is indexable. A query, a filter, a sort or a
 * later page is one of endless near-duplicate URLs: `noindex, follow`, with
 * the clean /search as canonical (audit 09, SEO-05). Category listings have
 * their own indexable pages (/categories/...).
 */
export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const { t, tf } = getI18n(locale);
  const filters = filtersFrom(await searchParams);
  const plain =
    !filters.q && !filters.brand && !filters.categoryId && !filters.tier &&
    filters.minPrice == null && filters.maxPrice == null &&
    filters.sortBy === 'relevance' && filters.sortDir === 'desc' && (filters.page ?? 1) === 1;
  return {
    title: filters.q ? tf(t.seo.searchResultsTitle, { q: filters.q }) : t.seo.searchTitle,
    description: t.seo.searchDescription,
    alternates: localizedAlternates(locale, '/search'),
    ...(plain ? {} : { robots: NOINDEX }),
  };
}

/**
 * The first page of results is fetched here, so it arrives in the HTML with
 * its images, instead of after the bundle loads, hydrates and asks the API
 * (audit 08, P-18: that chain put search LCP at 4-6 s on mobile). The page is
 * rendered per request (the results depend on the query string).
 *
 * The visitor's address goes with the call (nginx's X-Real-IP), so the API
 * rate-limits the search -- which can start live scrapes -- per visitor, not
 * per web server (OPS-14). Best effort: on any failure or a slow API the page
 * renders as before and the browser fetches.
 *
 * Client navigations (a new search, a filter, a sort, the next page) land
 * here too, as RSC requests. This used to skip them by checking the "rsc"
 * request header, but Next does not pass that header to headers(), so the
 * check never fired (audit 11). They are fetched here like a document load;
 * the client keeps the previous results dimmed while the navigation runs.
 */
export default async function SearchPage({ searchParams }: PageProps) {
  const filters = filtersFrom(await searchParams);

  let initial: InitialSearch | null = null;
  const visitor = (await headers()).get('x-real-ip');
  try {
    const data = await searchApi.search(filters, {
      timeout: SERVER_FETCH_TIMEOUT_MS,
      headers: visitor ? { 'X-PriceLens-Client-IP': visitor } : undefined,
    });
    initial = { filters, data, fetchedAt: Date.now() };
  } catch {
    initial = null;
  }

  return <SearchPageClient initial={initial} />;
}

/** Longer than a normal search (p95 ~300 ms), short enough not to hold the page. */
const SERVER_FETCH_TIMEOUT_MS = 2500;
