import { headers } from 'next/headers';
import { searchApi } from '@/lib/api/search.api';
import { parseSearchParams } from '@/lib/search-url';
import { SearchPageClient, type InitialSearch } from './_search-client';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The first page of results is fetched here, so it arrives in the HTML with
 * its images, instead of after the bundle loads, hydrates and asks the API
 * (audit 08, P-18: that chain put search LCP at 4-6 s on mobile). The page is
 * rendered per request (the results depend on the query string).
 *
 * Best effort: the server's calls share one API rate-limit bucket, so on any
 * failure or a slow API the page renders as before and the browser fetches.
 * Only for a document load: a client navigation (a filter, a sort, the next
 * page) carries the RSC header and keeps fetching in the browser, which
 * shows the previous results dimmed meanwhile instead of waiting on the server.
 */
export default async function SearchPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first != null) params.set(key, first);
  }
  const filters = parseSearchParams(params);

  let initial: InitialSearch | null = null;
  const clientNavigation = (await headers()).get('rsc') === '1';
  if (!clientNavigation) {
    try {
      const data = await searchApi.search(filters, { timeout: SERVER_FETCH_TIMEOUT_MS });
      initial = { filters, data, fetchedAt: Date.now() };
    } catch {
      initial = null;
    }
  }

  return <SearchPageClient initial={initial} />;
}

/** Longer than a normal search (p95 ~300 ms), short enough not to hold the page. */
const SERVER_FETCH_TIMEOUT_MS = 2500;
