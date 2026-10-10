import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type { PriceDropsPage } from '@/types/deals.types';

export const dealsApi = {
  /** Live prices below their own 30-day median (the API caches it for an hour). */
  priceDrops: async (limit = 60): Promise<PriceDropsPage> => {
    const res = await apiClient.get<ApiResponse<PriceDropsPage>>('/deals/price-drops', { params: { limit } });
    return res.data.data;
  },
};
