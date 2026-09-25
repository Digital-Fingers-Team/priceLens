import { useQuery } from '@tanstack/react-query';
import { pricesApi, PriceHistoryParams } from '@/lib/api/prices.api';
import { QUERY_KEYS } from '@/config/constants';

export function usePriceHistory(productId: string, params: PriceHistoryParams = {}) {
  return useQuery({
    queryKey: QUERY_KEYS.priceHistory(productId, params),
    queryFn: () => pricesApi.getHistory(productId, params),
    enabled: !!productId,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePriceStats(productId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.priceStats(productId),
    queryFn: () => pricesApi.getStats(productId),
    enabled: !!productId,
    staleTime: 10 * 60 * 1000,
  });
}
