import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type { NotificationChannelType } from '@/types/billing.types';
import type { NotificationChannelsResponse, NotificationPage } from '@/types/notification.types';

export const notificationsApi = {
  list: async (params: { limit?: number; cursor?: string; unreadOnly?: boolean } = {}) => {
    const res = await apiClient.get<ApiResponse<NotificationPage>>('/notifications', { params });
    return res.data.data;
  },

  unreadCount: async (): Promise<number> => {
    const res = await apiClient.get<ApiResponse<{ count: number }>>('/notifications/unread-count');
    return res.data.data.count;
  },

  markRead: async (id: string): Promise<void> => {
    await apiClient.post(`/notifications/${id}/read`, {});
  },

  markAllRead: async (): Promise<number> => {
    const res = await apiClient.post<ApiResponse<{ count: number }>>('/notifications/read-all', {});
    return res.data.data.count;
  },

  getChannels: async (): Promise<NotificationChannelsResponse> => {
    const res = await apiClient.get<ApiResponse<NotificationChannelsResponse>>(
      '/notifications/channels',
    );
    return res.data.data;
  },

  upsertChannel: async (type: NotificationChannelType, destination: string) => {
    const res = await apiClient.post<
      ApiResponse<{ id: string; type: NotificationChannelType; destination: string | null; verified: boolean; instructions: string }>
    >('/notifications/channels', { type, destination });
    return res.data.data;
  },

  verifyChannel: async (type: NotificationChannelType, code?: string) => {
    const res = await apiClient.post<ApiResponse<{ verified: boolean }>>(
      '/notifications/channels/verify',
      { type, code },
    );
    return res.data.data;
  },

  setChannelActive: async (type: NotificationChannelType, isActive: boolean) => {
    const res = await apiClient.post<ApiResponse<{ type: NotificationChannelType; isActive: boolean }>>(
      '/notifications/channels/active',
      { type, isActive },
    );
    return res.data.data;
  },

  removeChannel: async (type: NotificationChannelType): Promise<void> => {
    await apiClient.delete(`/notifications/channels/${type}`);
  },
};
