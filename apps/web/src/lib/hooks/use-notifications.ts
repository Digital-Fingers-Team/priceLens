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

/** VAPID public keys travel base64url-encoded; PushManager wants bytes. */
function keyBytes(base64url: string): Uint8Array {
  const padded = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export class WebPushUnavailable extends Error {
  constructor(readonly reason: 'unsupported' | 'blocked') {
    super(reason);
  }
}

/**
 * Asks for permission, registers the service worker, subscribes this browser
 * and hands the subscription to the API. Each step can fail for a reason the
 * user can act on, so those come back as WebPushUnavailable.
 */
export function useEnableWebPush() {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);
  const { t } = useI18n();
  const apiError = useApiErrorMessage();

  return useMutation({
    mutationFn: async (publicKey: string) => {
      if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        throw new WebPushUnavailable('unsupported');
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new WebPushUnavailable('blocked');

      const registration = await navigator.serviceWorker.register('/push-sw.js');
      await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(publicKey) as BufferSource,
        }));
      return notificationsApi.subscribeWebPush(subscription.toJSON());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.channels });
      addToast(t.toast.channelVerified, 'success');
    },
    onError: (err: Error) => {
      if (err instanceof WebPushUnavailable) {
        addToast(err.reason === 'blocked' ? t.channels.browserBlocked : t.channels.browserUnsupported, 'error');
        return;
      }
      addToast(apiError(err, t.toast.verifyFailed), 'error');
    },
  });
}
