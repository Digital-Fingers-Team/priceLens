'use client';

import { useQuery } from '@tanstack/react-query';
import { intelligenceApi } from '@/lib/api/intelligence.api';

export function useProductIntelligence(productId: string | undefined, days = 90) {
  return useQuery({
    queryKey: ['intelligence', productId, days],
    queryFn: () => intelligenceApi.getProductIntelligence(productId!, days),
    enabled: Boolean(productId),
    // Prices move on a scrape cycle, not per second.
    staleTime: 5 * 60 * 1000,
    // A product with no history is a legitimate answer, not a transient
    // failure — retrying would just repeat the same "insufficient data".
    retry: 1,
  });
}
