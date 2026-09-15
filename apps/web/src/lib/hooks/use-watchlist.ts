import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { watchlistApi } from '@/lib/api/watchlist.api';
import { QUERY_KEYS } from '@/config/constants';
import { useUiStore } from '@/lib/store/ui.store';
import { useAuthStore } from '@/lib/store/auth.store';
import { getStoredTokens } from '@/lib/api/client';
import { getApiErrorMessage } from '@/lib/utils/api-error';
import type { CreateAlertPayload } from '@/lib/api/watchlist.api';
import { isGuestWatched, toggleGuestWatchlist } from '@/lib/utils/guest-watchlist';

export function useWatchlist() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hasAccessToken = !!getStoredTokens().access;

  return useQuery({
    queryKey: QUERY_KEYS.watchlist(),
    queryFn: watchlistApi.getWatchlist,
    enabled: isAuthenticated && hasAccessToken,
    staleTime: 2 * 60 * 1000,
  });
}

export function useIsWatched(productId: string) {
  const { data: watchlist } = useWatchlist();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (isAuthenticated) {
    return watchlist?.some((item) => item.canonicalProductId === productId) ?? false;
  }
  return isGuestWatched(productId);
}

export function useToggleWatchlist() {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);

  return useMutation({
    mutationFn: async ({
      productId,
      isWatched,
    }: {
      productId: string;
      isWatched: boolean;
    }) => {
      const isAuthenticated = useAuthStore.getState().isAuthenticated;
      if (!isAuthenticated) {
        toggleGuestWatchlist(productId);
        return;
      }
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
      const isAuthenticated = useAuthStore.getState().isAuthenticated;

      if (!isAuthenticated) {
        toggleGuestWatchlist(productId);
      } else if (isWatched) {
        queryClient.setQueryData(QUERY_KEYS.watchlist(), (old: { canonicalProductId: string }[] | undefined) =>
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
      if (useAuthStore.getState().isAuthenticated) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.watchlist() });
      }
      addToast(
        isWatched ? 'Removed from watchlist' : 'Added to watchlist',
        'success',
      );
    },
  });
}

/**
 * The user's price alerts. Alerts were previously write-only — they could be
 * created but never listed back, so a triggered alert was invisible.
 */
export function useAlerts() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hasAccessToken = !!getStoredTokens().access;

  return useQuery({
    queryKey: QUERY_KEYS.alerts(),
    queryFn: () => watchlistApi.getAlerts(),
    enabled: isAuthenticated && hasAccessToken,
    staleTime: 30 * 1000,
  });
}

export function useCreateAlert() {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);

  return useMutation({
    mutationFn: ({ productId, ...payload }: { productId: string } & CreateAlertPayload) =>
      watchlistApi.createAlert(productId, payload),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.alerts() });
      // The plan's usage counters move when an alert is created.
      queryClient.invalidateQueries({ queryKey: ['billing', 'me'] });
      addToast('Alert set. We will tell you when it fires.', 'success');
    },

    // Surface the server's message rather than a generic failure: a plan-limit
    // or upgrade-required response carries the only text that tells the user
    // what to actually do about it.
    onError: (err) => addToast(getApiErrorMessage(err, 'Failed to create alert'), 'error'),
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
