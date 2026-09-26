import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { watchlistApi } from '@/lib/api/watchlist.api';
import { QUERY_KEYS } from '@/config/constants';
import { useUiStore } from '@/lib/store/ui.store';
import { useI18n } from '@/lib/i18n/provider';
import { useApiErrorMessage } from '@/lib/hooks/use-api-error';
import { useAuthStore } from '@/lib/store/auth.store';
import { getStoredTokens } from '@/lib/api/client';
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
  const { t } = useI18n();

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
      addToast(t.toast.watchlistFailed, 'error');
    },

    onSuccess: (_data, { isWatched }) => {
      if (useAuthStore.getState().isAuthenticated) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.watchlist() });
      }
      addToast(
        isWatched ? t.toast.watchlistRemoved : t.toast.watchlistAdded,
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
  const { t } = useI18n();
  const apiError = useApiErrorMessage();

  return useMutation({
    mutationFn: ({ productId, ...payload }: { productId: string } & CreateAlertPayload) =>
      watchlistApi.createAlert(productId, payload),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.alerts() });
      // The plan's usage counters move when an alert is created.
      queryClient.invalidateQueries({ queryKey: ['billing', 'me'] });
      addToast(t.toast.alertSet, 'success');
    },

    // Surface the server's message rather than a generic failure: a plan-limit
    // or upgrade-required response carries the only text that tells the user
    // what to actually do about it.
    onError: (err) => addToast(apiError(err, t.toast.alertCreateFailed), 'error'),
  });
}

export function useDeleteAlert() {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);
  const { t } = useI18n();

  return useMutation({
    mutationFn: (alertId: string) => watchlistApi.deleteAlert(alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.alerts() });
      addToast(t.toast.alertDeleted, 'success');
    },
    onError: () => addToast(t.toast.alertDeleteFailed, 'error'),
  });
}
