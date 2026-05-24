import { apiClient } from './client';
import { searchDemoCatalog, suggestDemoProducts } from '@/lib/mock/demo-catalog';
import type { SearchFilters, SearchResponse, SuggestionItem } from '@/types/search.types';
import type { ApiResponse } from '@/types/api.types';

export const searchApi = {
  search: async (filters: SearchFilters): Promise<SearchResponse> => {
    if (!filters.q?.trim()) {
      return searchDemoCatalog(filters);
    }

    try {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== undefined && v !== ''),
      );
      const res = await apiClient.get<ApiResponse<SearchResponse>>('/search', { params });
      return res.data.data;
    } catch {
      return searchDemoCatalog(filters);
    }
  },

  suggest: async (q: string): Promise<SuggestionItem[]> => {
    if (!q || q.trim().length < 2) return [];
    try {
      const res = await apiClient.get<ApiResponse<SuggestionItem[]>>('/search/suggest', {
        params: { q: q.trim(), limit: 6 },
      });
      return res.data.data;
    } catch {
      return suggestDemoProducts(q, 6);
    }
  },
};
