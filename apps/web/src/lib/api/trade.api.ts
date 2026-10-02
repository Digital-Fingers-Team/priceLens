import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type { FxHistory, FxImpact, FxLatest, ImportOpportunities, TrendRadar } from '@/types/trade.types';

export const tradeApi = {
  opportunities: async (params: { categoryId?: string; minMarginPct?: number; limit?: number; offset?: number }) =>
    (await apiClient.get<ApiResponse<ImportOpportunities>>('/trade/import-opportunities', { params })).data.data,
  fxRates: async () => (await apiClient.get<ApiResponse<FxLatest>>('/trade/fx/rates')).data.data,
  fxHistory: async (currency: string, days: number) =>
    (await apiClient.get<ApiResponse<FxHistory>>('/trade/fx/history', { params: { currency, days } })).data.data,
  fxImpact: async () => (await apiClient.get<ApiResponse<FxImpact>>('/trade/fx/impact')).data.data,
  trendRadar: async (week?: string) =>
    (await apiClient.get<ApiResponse<TrendRadar>>('/trade/trend-radar', { params: week ? { week } : {} })).data.data,
};
