import { useQuery } from '@tanstack/react-query';
import { productApi } from '@/lib/api/product.api';
import { QUERY_KEYS } from '@/config/constants';

export function useProduct(slug: string) {
  return useQuery({
    queryKey: QUERY_KEYS.product(slug),
    queryFn: () => productApi.getBySlug(slug),
    enabled: !!slug,
    staleTime: 2 * 60 * 1000, // 2 minutes
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