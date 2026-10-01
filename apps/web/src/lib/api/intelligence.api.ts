import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type { LandedCostResponse, ProductIntelligence } from '@/types/intelligence.types';

export const intelligenceApi = {
  getProductIntelligence: async (productId: string, days = 90): Promise<ProductIntelligence> => {
    const res = await apiClient.get<ApiResponse<ProductIntelligence>>(
      `/intelligence/products/${productId}`,
      { params: { days } },
    );
    return res.data.data;
  },

  getLandedCost: async (productId: string): Promise<LandedCostResponse> => {
    const res = await apiClient.get<ApiResponse<LandedCostResponse>>(`/intelligence/products/${productId}/landed-cost`);
    return res.data.data;
  },
};
