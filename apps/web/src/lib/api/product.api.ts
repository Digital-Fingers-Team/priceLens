import { apiClient } from './client';
import type {
  CanonicalProduct,
  SourceListing,
} from '@/types/product.types';
import type { ApiResponse, PaginatedData } from '@/types/api.types';

export const productApi = {
  getBySlug: async (slug: string): Promise<CanonicalProduct> => {
    const res = await apiClient.get<ApiResponse<CanonicalProduct>>(
      `/products/${slug}`,
    );
    return res.data.data;
  },

  getListings: async (
    productId: string,
    page = 1,
    limit = 50,
  ): Promise<PaginatedData<SourceListing>> => {
    const res = await apiClient.get<ApiResponse<PaginatedData<SourceListing>>>(
      `/products/${productId}/listings`,
      { params: { page, limit } },
    );
    return res.data.data;
  },
};
