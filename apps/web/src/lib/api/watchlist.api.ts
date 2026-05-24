import { apiClient } from './client';
import type { WatchlistItem, PriceAlert, AlertType } from '@/types/product.types';
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

  createAlert: async (
    productId: string,
    alertType: AlertType,
    thresholdValue: number,
  ): Promise<PriceAlert> => {
    const res = await apiClient.post<ApiResponse<PriceAlert>>(
      `/watchlist/${productId}/alerts`,
      { alertType, thresholdValue },
    );
    return res.data.data;
  },

  deleteAlert: async (alertId: string): Promise<void> => {
    await apiClient.delete(`/watchlist/alerts/${alertId}`);
  },
};
