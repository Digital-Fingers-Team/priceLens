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
 */
export function useProduct(slug: string, initialData?: CanonicalProduct) {
  return useQuery({
    queryKey: QUERY_KEYS.product(slug),
    queryFn: () => productApi.getBySlug(slug),
    enabled: !!slug,
    staleTime: 2 * 60 * 1000, // 2 minutes
    initialData,
  });
}

export function useProductListings(productId: string, page = 1) {
  return useQuery({
    queryKey: QUERY_KEYS.productListings(productId),
    queryFn: () => productApi.getListings(productId, page),
    enabled: !!productId,
    staleTime: 60 * 1000,
  });
}