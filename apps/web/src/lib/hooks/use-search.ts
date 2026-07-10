import { useQuery } from '@tanstack/react-query';
import { searchApi } from '@/lib/api/search.api';
import { QUERY_KEYS } from '@/config/constants';
import type { SearchFilters } from '@/types/search.types';

export function useSearch(filters: SearchFilters) {
  return useQuery({
    queryKey: QUERY_KEYS.search(filters),
    queryFn: () => searchApi.search(filters),
    enabled: filters.q.trim().length > 0,
    placeholderData: (prev) => prev, // keep previous data while fetching new page
    staleTime: 30 * 1000,
    // A zero-result search kicks off a background live-fetch job (see products.service.ts)
    // instead of blocking the request. Poll briefly so results appear once it lands.
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.liveFetchTriggered && data.hits.length === 0 ? 4000 : false;
    },
  });
}

export function useSuggest(q: string) {
  return useQuery({
    queryKey: QUERY_KEYS.suggest(q),
    queryFn: () => searchApi.suggest(q),
    enabled: q.trim().length >= 2,
    staleTime: 10 * 1000,
  });
}
