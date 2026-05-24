import { apiClient } from './client';
import type {
  ReviewQueueItem,
  DashboardStats,
  ResolveDecision,
} from '@/types/admin.types';
import type { ApiResponse, PaginatedData } from '@/types/api.types';

export const adminApi = {
  getDashboardStats: async (): Promise<DashboardStats> => {
    const res = await apiClient.get<ApiResponse<DashboardStats>>('/admin/dashboard');
    return res.data.data;
  },

  getReviewQueue: async (
    page = 1,
    limit = 20,
  ): Promise<PaginatedData<ReviewQueueItem>> => {
    const res = await apiClient.get<ApiResponse<PaginatedData<ReviewQueueItem>>>(
      '/admin/review-queue',
      { params: { page, limit } },
    );
    return res.data.data;
  },

  resolveQueueItem: async (
    queueItemId: string,
    body: ResolveDecision,
  ): Promise<{ resolved: boolean; status: string }> => {
    const res = await apiClient.patch(
      `/admin/review-queue/${queueItemId}/resolve`,
      body,
    );
    return res.data.data;
  },

  getPlatforms: async () => {
    const res = await apiClient.get('/admin/platforms');
    return res.data.data;
  },

  triggerRematch: async (batchSize = 100) => {
    const res = await apiClient.post('/admin/rematch', null, {
      params: { batchSize },
    });
    return res.data.data;
  },

  triggerScrape: async (query: string) => {
    const res = await apiClient.post('/scraping/trigger', { query });
    return res.data.data;
  },
};