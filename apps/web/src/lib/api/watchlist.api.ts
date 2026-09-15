import { apiClient } from './client';
import type { WatchlistItem, PriceAlert } from '@/types/product.types';
import type { AlertType } from '@/types/billing.types';

export interface CreateAlertPayload {
  alertType: AlertType;
  thresholdValue: number;
  repeatable?: boolean;
  cooldownHours?: number;
}
import type { ApiResponse } from '@/types/api.types';

export const watchlistApi = {
  getWatchlist: async (): Promise<WatchlistItem[]> => {
    const res = await apiClient.get<ApiResponse<WatchlistItem[]>>('/watchlist');
    return res.data.data;
  },

  add: async (productId: string, note?: string): Promise<WatchlistItem> => {
    const res = await apiClient.post<ApiResponse<WatchlistItem>>('/watchlist', {
      productId,
      note,
    });
    return res.data.data;
  },

  remove: async (productId: string): Promise<void> => {
    await apiClient.delete(`/watchlist/${productId}`);
  },

  getAlerts: async (): Promise<PriceAlert[]> => {
    const res = await apiClient.get<ApiResponse<PriceAlert[]>>('/watchlist/alerts');
    return res.data.data;
  },

  createAlert: async (productId: string, payload: CreateAlertPayload): Promise<PriceAlert> => {
    const res = await apiClient.post<ApiResponse<PriceAlert>>(
      `/watchlist/${productId}/alerts`,
      payload,
    );
    return res.data.data;
  },

  /** Re-arm an alert that has already fired. */
  reactivateAlert: async (alertId: string): Promise<{ id: string; status: string }> => {
    const res = await apiClient.post<ApiResponse<{ id: string; status: string }>>(
      `/watchlist/alerts/${alertId}/reactivate`,
      {},
    );
    return res.data.data;
  },

  deleteAlert: async (alertId: string): Promise<void> => {
    await apiClient.delete(`/watchlist/alerts/${alertId}`);
  },
};
