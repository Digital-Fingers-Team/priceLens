import { apiClient } from './client';
import type { PriceHistory, CurrentPrices } from '@/types/product.types';
import type { ApiResponse } from '@/types/api.types';

export interface PriceHistoryParams {
  days?: number;
  granularity?: 'day' | 'week' | 'month';
  platformId?: string;
}

export interface AllTimePriceStats {
  allTime: {
    min: number | null;
    max: number | null;
    avg: number | null;
    dataPoints: number;
  };
  week52: {
    low: number | null;
    high: number | null;
  };
}

export const pricesApi = {
  getHistory: async (
    productId: string,
    params: PriceHistoryParams = {},
  ): Promise<PriceHistory> => {
    const res = await apiClient.get<ApiResponse<PriceHistory>>(
      `/prices/${productId}/history`,
      { params },
    );
    return res.data.data;
  },

  getCurrent: async (productId: string): Promise<CurrentPrices> => {
    const res = await apiClient.get<ApiResponse<CurrentPrices>>(
      `/prices/${productId}/current`,
    );
    return res.data.data;
  },

  getStats: async (productId: string): Promise<AllTimePriceStats> => {
    const res = await apiClient.get<ApiResponse<AllTimePriceStats>>(
      `/prices/${productId}/stats`,
    );
    return res.data.data;
  },
};
