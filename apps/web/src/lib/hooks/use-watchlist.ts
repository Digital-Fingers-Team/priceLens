import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { watchlistApi } from '@/lib/api/watchlist.api';
import { QUERY_KEYS } from '@/config/constants';
import { useUiStore } from '@/lib/store/ui.store';
import type { AlertType } from '@/types/product.types';

export function useWatchlist() {
  return useQuery({
    queryKey: QUERY_KEYS.watchlist(),
    queryFn: watchlistApi.getWatchlist,
    staleTime: 2 * 60 * 1000,
  });
}

export function useIsWatched(productId: string) {
  const { data: watchlist } = useWatchlist();
  return watchlist?.some((item) => item.canonicalProductId === productId) ?? false;
}

export function useToggleWatchlist() {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);
  const { data: watchlist } = useWatchlist();

  return useMutation({
    mutationFn: async ({
      productId,
      isWatched,
    }: {
      productId: string;
      isWatched: boolean;
    }) => {
      if (isWatched) {
        await watchlistApi.remove(productId);
      } else {
        await watchlistApi.add(productId);
      }
    },

    // Optimistic update
    onMutate: async ({ productId, isWatched }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.watchlist() });
      const previous = queryClient.getQueryData(QUERY_KEYS.watchlist());

      if (isWatched) {
        queryClient.setQueryData(QUERY_KEYS.watchlist(), (old: any[]) =>
          old?.filter((item) => item.canonicalProductId !== productId),
        );
      }

      return { previous };
    },

    onError: (_err, _vars, context) => {
      queryClient.setQueryData(QUERY_KEYS.watchlist(), context?.previous);
      addToast('Failed to update watchlist', 'error');
    },

    onSuccess: (_data, { isWatched }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.watchlist() });
      addToast(
        isWatched ? 'Removed from watchlist' : 'Added to watchlist',
        'success',
      );
    },
  });
}

export function useCreateAlert() {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);

  return useMutation({
    mutationFn: ({
      productId,
      alertType,
      thresholdValue,
    }: {
      productId: string;
      alertType: AlertType;
      thresholdValue: number;
    }) => watchlistApi.createAlert(productId, alertType, thresholdValue),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.alerts() });
      addToast('Price alert created', 'success');
    },

    onError: () => addToast('Failed to create alert', 'error'),
  });
}

export function useDeleteAlert() {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);

  return useMutation({
    mutationFn: (alertId: string) => watchlistApi.deleteAlert(alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.alerts() });
      addToast('Alert deleted', 'success');
    },
    onError: () => addToast('Failed to delete alert', 'error'),
  });
}