import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type { Entitlements, Plan } from '@/types/billing.types';

export const billingApi = {
  /** Public: the pricing page renders before anyone signs in. */
  getPlans: async (): Promise<{ plans: Plan[]; checkoutEnabled: boolean }> => {
    const res = await apiClient.get<ApiResponse<{ plans: Plan[]; checkoutEnabled: boolean }>>(
      '/billing/plans',
    );
    return res.data.data;
  },

  getMyBilling: async (): Promise<Entitlements> => {
    const res = await apiClient.get<ApiResponse<Entitlements>>('/billing/me');
    return res.data.data;
  },

  createCheckout: async (planKey: string): Promise<{ url: string; sessionId: string }> => {
    const res = await apiClient.post<ApiResponse<{ url: string; sessionId: string }>>(
      '/billing/checkout',
      { planKey },
    );
    return res.data.data;
  },

  openPortal: async (): Promise<{ url: string }> => {
    const res = await apiClient.post<ApiResponse<{ url: string }>>('/billing/portal', {});
    return res.data.data;
  },

  cancel: async (immediately = false) => {
    const res = await apiClient.post<
      ApiResponse<{ status: string; cancelAtPeriodEnd: boolean; currentPeriodEnd: string | null }>
    >('/billing/cancel', { immediately });
    return res.data.data;
  },
};
