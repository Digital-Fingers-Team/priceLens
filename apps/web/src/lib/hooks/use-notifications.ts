'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { notificationsApi } from '@/lib/api/notifications.api';
import { useAuthStore } from '@/lib/store/auth.store';
import { useUiStore } from '@/lib/store/ui.store';
import { useI18n } from '@/lib/i18n/provider';
import { useApiErrorMessage } from '@/lib/hooks/use-api-error';
import type { NotificationChannelType } from '@/types/billing.types';

const notificationKeys = {
  list: ['notifications', 'list'] as const,
  unread: ['notifications', 'unread'] as const,
  channels: ['notifications', 'channels'] as const,
};

export function useNotifications(unreadOnly = false) {
  const isAuthenticated = useAuthStore((s) => Boolean(s.user));

  return useQuery({
    queryKey: [...notificationKeys.list, unreadOnly],
    queryFn: () => notificationsApi.list({ limit: 20, unreadOnly }),
    enabled: isAuthenticated,
  });
}

export function useUnreadCount() {
  const isAuthenticated = useAuthStore((s) => Boolean(s.user));

  return useQuery({
    queryKey: notificationKeys.unread,
    queryFn: () => notificationsApi.unreadCount(),
    enabled: isAuthenticated,
    // Alerts are evaluated every 30 minutes server-side, so polling harder
    // than this would only add load without surfacing anything sooner.
    refetchInterval: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.unread });
      queryClient.invalidateQueries({ queryKey: notificationKeys.list });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.unread });
      queryClient.invalidateQueries({ queryKey: notificationKeys.list });
    },
  });
}

export function useNotificationChannels() {
  const isAuthenticated = useAuthStore((s) => Boolean(s.user));

  return useQuery({
    queryKey: notificationKeys.channels,
    queryFn: () => notificationsApi.getChannels(),
    enabled: isAuthenticated,
  });
}

export function useUpsertChannel() {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);
  const { t } = useI18n();
  const apiError = useApiErrorMessage();

  return useMutation({
    mutationFn: ({ type, destination }: { type: NotificationChannelType; destination: string }) =>
      notificationsApi.upsertChannel(type, destination),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.channels });
      addToast(data.instructions, 'info');
    },
    onError: (err: AxiosError) => {
      addToast(apiError(err, t.toast.channelSaveFailed), 'error');
    },
  });
}

export function useVerifyChannel() {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);
  const { t } = useI18n();
  const apiError = useApiErrorMessage();

  return useMutation({
    mutationFn: ({ type, code }: { type: NotificationChannelType; code?: string }) =>
      notificationsApi.verifyChannel(type, code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.channels });
      addToast(t.toast.channelVerified, 'success');
    },
    onError: (err: AxiosError) => {
      addToast(apiError(err, t.toast.verifyFailed), 'error');
    },
  });
}

export function useSetChannelActive() {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);
  const { t } = useI18n();
  const apiError = useApiErrorMessage();

  return useMutation({
    mutationFn: ({ type, isActive }: { type: NotificationChannelType; isActive: boolean }) =>
      notificationsApi.setChannelActive(type, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.channels });
    },
    onError: (err: AxiosError) => {
      addToast(apiError(err, t.toast.channelUpdateFailed), 'error');
    },
  });
}
