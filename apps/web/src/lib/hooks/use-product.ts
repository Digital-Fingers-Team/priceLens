import { useQuery } from '@tanstack/react-query';
import { productApi } from '@/lib/api/product.api';
import { QUERY_KEYS } from '@/config/constants';
import type { CanonicalProduct } from '@/types/product.types';

/**
 * `initialData` is the product the server already fetched to build the page's
 * metadata. Handing it to the query means the first render -- the HTML a
 * crawler receives -- carries the title, the prices and the listings, instead
 * of a skeleton that only fills in once the browser has run the bundle and
 * made a second request for data the server had all along.
 *
 * The page is cached (ISR), so that data can be minutes old: `fetchedAt`
 * tells the query when it was fetched, and it refetches on mount once it is
 * older than the stale time instead of treating it as brand new.
 */
export function useProduct(slug: string, initialData?: CanonicalProduct, fetchedAt?: number) {
  return useQuery({
    queryKey: QUERY_KEYS.product(slug),
    queryFn: () => productApi.getBySlug(slug),
    enabled: !!slug,
    staleTime: 2 * 60 * 1000, // 2 minutes
    initialData,
    initialDataUpdatedAt: fetchedAt,
  });
}
