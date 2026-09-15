import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type { DealHunterResult, ParsedQuery } from '@/types/deal-hunter.types';

export const dealHunterApi = {
  hunt: async (q: string, limit = 10): Promise<DealHunterResult> => {
    const res = await apiClient.get<ApiResponse<DealHunterResult>>('/deal-hunter', {
      params: { q, limit },
    });
    return res.data.data;
  },

  /** Cheap, public: powers the live "we read this as ..." feedback. */
  interpret: async (q: string): Promise<ParsedQuery> => {
    const res = await apiClient.get<ApiResponse<{ parsed: ParsedQuery }>>('/deal-hunter/interpret', {
      params: { q },
    });
    return res.data.data.parsed;
  },
};
