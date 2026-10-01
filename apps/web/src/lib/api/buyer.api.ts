import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type { BuyerExtras, CartWatch } from '@/types/buyer.types';

export const buyerApi = {
  extras: async (productId: string) => (await apiClient.get<ApiResponse<BuyerExtras>>(`/buyer/products/${productId}/extras`)).data.data,

  banks: async () => (await apiClient.get<ApiResponse<{ mine: string[]; known: string[] }>>('/buyer/banks')).data.data,
  setBanks: async (banks: string[]) => (await apiClient.put<ApiResponse<{ mine: string[] }>>('/buyer/banks', { banks })).data.data,

  reportCoupon: async (id: string, worked: boolean) =>
    (await apiClient.post<ApiResponse<{ worked: boolean }>>(`/buyer/coupons/${id}/report`, { worked })).data.data,

  carts: async () => (await apiClient.get<ApiResponse<CartWatch[]>>('/buyer/carts')).data.data,
  createCart: async (input: { name: string; targetTotal: number; acrossStores?: boolean; items: Array<{ productId: string; qty?: number }> }) =>
    (await apiClient.post<ApiResponse<CartWatch>>('/buyer/carts', input)).data.data,
  updateCart: async (
    id: string,
    input: Partial<{ name: string; targetTotal: number; acrossStores: boolean; isActive: boolean; items: Array<{ productId: string; qty?: number }> }>,
  ) => (await apiClient.patch<ApiResponse<CartWatch>>(`/buyer/carts/${id}`, input)).data.data,
  deleteCart: async (id: string) => {
    await apiClient.delete(`/buyer/carts/${id}`);
  },
};
