import { apiClient } from './client';
import {
  getDemoListings,
  getDemoProductBySlug,
} from '@/lib/mock/demo-catalog';
import type {
  CanonicalProduct,
  SourceListing,
  PriceHistory,
  CurrentPrices,
} from '@/types/product.types';
import type { ApiResponse, PaginatedData } from '@/types/api.types';

export const productApi = {
  getBySlug: async (slug: string): Promise<CanonicalProduct> => {
    try {
      const res = await apiClient.get<ApiResponse<CanonicalProduct>>(
        `/products/${slug}`,
      );
      return res.data.data;
    } catch (error) {
      const fallback = getDemoProductBySlug(slug);
      if (fallback) return fallback;
      throw error;
    }
  },

  getListings: async (
    productId: string,
    page = 1,
    limit = 50,
  ): Promise<PaginatedData<SourceListing>> => {
    try {
      const res = await apiClient.get<ApiResponse<PaginatedData<SourceListing>>>(
        `/products/${productId}/listings`,
        { params: { page, limit } },
      );
      return res.data.data;
    } catch (error) {
      const fallback = getDemoListings(productId, page, limit);
      if (fallback.items.length > 0) return fallback;
      throw error;
    }
  },
};
