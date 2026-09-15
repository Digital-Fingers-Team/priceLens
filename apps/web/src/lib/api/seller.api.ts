import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type {
  CompetitorEvent,
  CompetitorEventType,
  MatchSuggestion,
  OrgRole,
  OrgType,
  SellerProductDetail,
  SellerProductRow,
  Workspace,
  WorkspaceSummary,
} from '@/types/seller.types';

const base = (orgId: string) => `/seller/workspaces/${orgId}`;

export const sellerApi = {
  listWorkspaces: async (): Promise<Workspace[]> => {
    const res = await apiClient.get<ApiResponse<Workspace[]>>('/seller/workspaces');
    return res.data.data;
  },

  createWorkspace: async (input: { name: string; type: OrgType; platformId?: string }) => {
    const res = await apiClient.post<ApiResponse<{ id: string; slug: string }>>(
      '/seller/workspaces',
      input,
    );
    return res.data.data;
  },

  summary: async (orgId: string): Promise<WorkspaceSummary> => {
    const res = await apiClient.get<ApiResponse<WorkspaceSummary>>(`${base(orgId)}/summary`);
    return res.data.data;
  },

  listProducts: async (orgId: string, search?: string): Promise<SellerProductRow[]> => {
    const res = await apiClient.get<ApiResponse<SellerProductRow[]>>(`${base(orgId)}/products`, {
      params: search ? { search } : undefined,
    });
    return res.data.data;
  },

  getProduct: async (orgId: string, productId: string): Promise<SellerProductDetail> => {
    const res = await apiClient.get<ApiResponse<SellerProductDetail>>(
      `${base(orgId)}/products/${productId}`,
    );
    return res.data.data;
  },

  upsertProduct: async (
    orgId: string,
    input: Partial<SellerProductRow> & { sku: string; name: string },
  ) => {
    const res = await apiClient.put<ApiResponse<{ id: string; sku: string }>>(
      `${base(orgId)}/products`,
      input,
    );
    return res.data.data;
  },

  deleteProduct: async (orgId: string, productId: string): Promise<void> => {
    await apiClient.delete(`${base(orgId)}/products/${productId}`);
  },

  matchSuggestions: async (orgId: string, productId: string): Promise<MatchSuggestion[]> => {
    const res = await apiClient.get<ApiResponse<MatchSuggestion[]>>(
      `${base(orgId)}/products/${productId}/match-suggestions`,
    );
    return res.data.data;
  },

  listEvents: async (
    orgId: string,
    params: { type?: CompetitorEventType; unacknowledgedOnly?: boolean; limit?: number } = {},
  ) => {
    const res = await apiClient.get<ApiResponse<{ items: CompetitorEvent[]; nextCursor: string | null }>>(
      `${base(orgId)}/events`,
      { params },
    );
    return res.data.data;
  },

  acknowledgeEvent: async (orgId: string, eventId: string): Promise<void> => {
    await apiClient.post(`${base(orgId)}/events/${eventId}/acknowledge`, {});
  },

  acknowledgeAll: async (orgId: string) => {
    const res = await apiClient.post<ApiResponse<{ count: number }>>(
      `${base(orgId)}/events/acknowledge-all`,
      {},
    );
    return res.data.data;
  },

  listRules: async (orgId: string) => {
    const res = await apiClient.get<ApiResponse<Array<{
      id: string;
      type: CompetitorEventType;
      thresholdPct: number;
      sellerProductId: string | null;
      isActive: boolean;
      cooldownHours: number;
      lastFiredAt: string | null;
    }>>>(`${base(orgId)}/alert-rules`);
    return res.data.data;
  },

  upsertRule: async (
    orgId: string,
    input: { type: CompetitorEventType; thresholdPct?: number; isActive?: boolean; cooldownHours?: number },
  ) => {
    const res = await apiClient.put<ApiResponse<{ id: string }>>(`${base(orgId)}/alert-rules`, input);
    return res.data.data;
  },

  addMember: async (orgId: string, email: string, role: OrgRole) => {
    const res = await apiClient.post<ApiResponse<{ id: string }>>(`${base(orgId)}/members`, {
      email,
      role,
    });
    return res.data.data;
  },
};
