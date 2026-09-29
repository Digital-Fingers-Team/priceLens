import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type {
  AdminManualPayment,
  Entitlements,
  ManualPayment,
  ManualPaymentMethod,
  ManualPaymentStatus,
  PaymentDestinations,
  PlansResponse,
} from '@/types/billing.types';

export const billingApi = {
  /** Public: the pricing page renders before anyone signs in. */
  getPlans: async (): Promise<PlansResponse> => {
    const res = await apiClient.get<ApiResponse<PlansResponse>>('/billing/plans');
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

  // ─── Wallet / InstaPay payments ───────────────────────────────────────

  startPayment: async (planKey: string) => {
    const res = await apiClient.post<ApiResponse<{ payment: ManualPayment; destinations: PaymentDestinations | null }>>(
      '/billing/payments',
      { planKey },
    );
    return res.data.data;
  },

  myPayments: async () => {
    const res = await apiClient.get<ApiResponse<{ payments: ManualPayment[]; destinations: PaymentDestinations | null }>>(
      '/billing/payments/mine',
    );
    return res.data.data;
  },

  submitPayment: async (id: string, body: { method: ManualPaymentMethod; reference: string; payerAccount?: string }) => {
    const res = await apiClient.post<ApiResponse<ManualPayment>>(`/billing/payments/${id}/submit`, body);
    return res.data.data;
  },

  cancelPayment: async (id: string) => {
    const res = await apiClient.post<ApiResponse<ManualPayment>>(`/billing/payments/${id}/cancel`, {});
    return res.data.data;
  },

  adminPayments: async (status?: ManualPaymentStatus) => {
    const res = await apiClient.get<ApiResponse<{ payments: AdminManualPayment[] }>>('/billing/payments/admin', {
      params: status ? { status } : {},
    });
    return res.data.data;
  },

  approvePayment: async (id: string) => {
    const res = await apiClient.post<ApiResponse<ManualPayment>>(`/billing/payments/admin/${id}/approve`, {});
    return res.data.data;
  },

  rejectPayment: async (id: string, reason?: string) => {
    const res = await apiClient.post<ApiResponse<ManualPayment>>(`/billing/payments/admin/${id}/reject`, { reason });
    return res.data.data;
  },
};
