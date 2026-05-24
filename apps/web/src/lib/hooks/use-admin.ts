import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin.api';
import { QUERY_KEYS } from '@/config/constants';
import { useUiStore } from '@/lib/store/ui.store';
import type { ResolveDecision } from '@/types/admin.types';

export function useDashboardStats() {
  return useQuery({
    queryKey: QUERY_KEYS.dashboardStats(),
    queryFn: adminApi.getDashboardStats,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function useReviewQueue(page = 1) {
  return useQuery({
    queryKey: QUERY_KEYS.reviewQueue(page),
    queryFn: () => adminApi.getReviewQueue(page),
    placeholderData: (prev) => prev,
  });
}

export function useResolveQueueItem() {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);

  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: ResolveDecision;
    }) => adminApi.resolveQueueItem(id, body),

    onSuccess: (_data, { body }) => {
      queryClient.invalidateQueries({ queryKey: ['review-queue'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardStats() });
      addToast(
        body.decision === 'ACCEPT' ? 'Match accepted ✓' : 'Match rejected ✗',
        body.decision === 'ACCEPT' ? 'success' : 'info',
      );
    },

    onError: () => addToast('Failed to resolve item', 'error'),
  });
}