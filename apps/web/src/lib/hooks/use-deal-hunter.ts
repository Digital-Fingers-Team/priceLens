'use client';

import { useQuery } from '@tanstack/react-query';
import { dealHunterApi } from '@/lib/api/deal-hunter.api';
import { useDebounce } from '@/lib/hooks/use-debounce';

/**
 * Live feedback on what the parser understood, as the user types.
 *
 * This is what stops a natural-language box feeling like a black box: the
 * user can see a misread budget or a missed spec before they run the search.
 */
export function useQueryInterpretation(query: string) {
  const debounced = useDebounce(query, 350);

  return useQuery({
    queryKey: ['deal-hunter', 'interpret', debounced],
    queryFn: () => dealHunterApi.interpret(debounced),
    enabled: debounced.trim().length >= 3,
    staleTime: 5 * 60 * 1000,
  });
}

/** Runs only when explicitly submitted — the search itself is expensive. */
export function useDealHunt(query: string, enabled: boolean) {
  return useQuery({
    queryKey: ['deal-hunter', 'hunt', query],
    queryFn: () => dealHunterApi.hunt(query),
    enabled: enabled && query.trim().length >= 3,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}
