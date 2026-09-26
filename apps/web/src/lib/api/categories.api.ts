import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type { CategoryOption } from '@/types/search.types';

export const categoriesApi = {
  /** Categories that hold products (D-24). */
  list: async (): Promise<CategoryOption[]> => {
    const res = await apiClient.get<ApiResponse<CategoryOption[]>>('/categories');
    return res.data.data;
  },
};
