'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { billingApi } from '@/lib/api/billing.api';
import { useAuthStore } from '@/lib/store/auth.store';
import { useUiStore } from '@/lib/store/ui.store';
import { useI18n } from '@/lib/i18n/provider';
import { useApiErrorMessage } from '@/lib/hooks/use-api-error';
import type { AdminPlanPatch, Entitlements, ManualPaymentMethod, ManualPaymentStatus, OnlineProvider } from '@/types/billing.types';

const billingKeys = {
  plans: ['billing', 'plans'] as const,
  me: ['billing', 'me'] as const,
  payments: ['billing', 'payments'] as const,
  adminPayments: (status?: ManualPaymentStatus) => ['billing', 'admin-payments', status ?? 'all'] as const,
  invoices: ['billing', 'invoices'] as const,
  invoice: (id: string) => ['billing', 'invoice', id] as const,
  adminPlans: ['billing', 'admin-plans'] as const,
  flags: ['flags'] as const,
  adminFlags: ['admin', 'flags'] as const,
};

export function usePlans() {
  return useQuery({
    queryKey: billingKeys.plans,
    queryFn: () => billingApi.getPlans(),
    // Plans change when an operator edits them, not per-render.
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * The signed-in user's plan, limits and live usage.
 *
 * Disabled when signed out so the UI does not fire a guaranteed 401 on every
 * anonymous page view; callers fall back to free-tier behaviour via
 * {@link useEntitlements}.
 */
export function useMyBilling() {
  const isAuthenticated = useAuthStore((s) => Boolean(s.user));

  return useQuery({
    queryKey: billingKeys.me,
    queryFn: () => billingApi.getMyBilling(),
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
  });
}

/**
 * Convenience wrapper that answers "can this user do X?" without every caller
 * re-deriving the signed-out case.
 *
 * Note this is a *UI affordance only*. Every gate is independently enforced
 * server-side; hiding a button is never the security boundary.
 */
export function useEntitlements() {
  const { data, isLoading } = useMyBilling();

  const hasFeature = (feature: string): boolean => Boolean(data?.limits.features.includes(feature));

  const limitFor = (key: keyof Entitlements['limits']): number | null => {
    const value = data?.limits[key];
    return typeof value === 'number' ? value : null;
  };

  return {
    entitlements: data,
    isLoading,
    hasFeature,
    limitFor,
    isPaid: Boolean(data && data.tier !== 'FREE'),
    usage: data?.usage ?? { trackedProducts: 0, activeAlerts: 0 },
  };
}

export function useCheckout() {
  const addToast = useUiStore((s) => s.addToast);
  const { t } = useI18n();
  const apiError = useApiErrorMessage();

  return useMutation({
    mutationFn: (planKey: string) => billingApi.createCheckout(planKey),
    onSuccess: (data) => {
      // Full navigation, not router.push — Stripe Checkout is off-origin.
      window.location.href = data.url;
    },
    onError: (err: AxiosError) => {
      addToast(apiError(err, t.toast.checkoutFailed), 'error');
    },
  });
}

export function useBillingPortal() {
  const addToast = useUiStore((s) => s.addToast);
  const { t } = useI18n();
  const apiError = useApiErrorMessage();

  return useMutation({
    mutationFn: () => billingApi.openPortal(),
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err: AxiosError) => {
      addToast(apiError(err, t.toast.portalFailed), 'error');
    },
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);
  const { t } = useI18n();
  const apiError = useApiErrorMessage();

  return useMutation({
    mutationFn: (immediately?: boolean) => billingApi.cancel(immediately),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: billingKeys.me });
      addToast(
        data.cancelAtPeriodEnd
          ? t.toast.planWillNotRenew
          : t.toast.planCancelled,
        'success',
      );
    },
    onError: (err: AxiosError) => {
      addToast(apiError(err, t.toast.cancelFailed), 'error');
    },
  });
}

// ─── Wallet / InstaPay payments ─────────────────────────────────────────

/** Opens (or reuses) the order for a plan; the API makes it idempotent. */
export function useStartPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planKey: string) => billingApi.startPayment(planKey),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: billingKeys.payments }),
  });
}

/**
 * The signed-in user's orders. Polls while one waits for the owner, so the
 * page turns to "active" by itself once it is approved.
 */
export function useMyPayments() {
  const isAuthenticated = useAuthStore((s) => Boolean(s.user));
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: billingKeys.payments,
    queryFn: async () => {
      const data = await billingApi.myPayments();
      // An approval changes the plan: refresh it along with the orders.
      if (data.payments.some((p) => p.status === 'APPROVED')) {
        queryClient.invalidateQueries({ queryKey: billingKeys.me });
      }
      return data;
    },
    enabled: isAuthenticated,
    refetchInterval: (query) =>
      query.state.data?.payments.some((p) => p.status === 'SUBMITTED') ? 20_000 : false,
  });
}

export function useSubmitPayment() {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);
  const { t } = useI18n();
  const apiError = useApiErrorMessage();
  return useMutation({
    mutationFn: (input: { id: string; method: ManualPaymentMethod; reference: string; payerAccount?: string }) =>
      billingApi.submitPayment(input.id, {
        method: input.method,
        reference: input.reference,
        ...(input.payerAccount ? { payerAccount: input.payerAccount } : {}),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: billingKeys.payments }),
    onError: (err: AxiosError) => addToast(apiError(err, t.toast.paymentSubmitFailed), 'error'),
  });
}

export function useCancelPayment() {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);
  const { t } = useI18n();
  const apiError = useApiErrorMessage();
  return useMutation({
    mutationFn: (id: string) => billingApi.cancelPayment(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: billingKeys.payments }),
    onError: (err: AxiosError) => addToast(apiError(err, t.toast.cancelFailed), 'error'),
  });
}

export function useAdminPayments(status?: ManualPaymentStatus) {
  return useQuery({
    queryKey: billingKeys.adminPayments(status),
    queryFn: () => billingApi.adminPayments(status),
    refetchInterval: 30_000,
  });
}

export function useReviewPayment() {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);
  const apiError = useApiErrorMessage();
  return useMutation({
    mutationFn: (input: { id: string; decision: 'approve' | 'reject'; reason?: string }) =>
      input.decision === 'approve' ? billingApi.approvePayment(input.id) : billingApi.rejectPayment(input.id, input.reason),
    onSuccess: (payment, input) => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'admin-payments'] });
      addToast(`${payment.code} ${input.decision === 'approve' ? 'approved' : 'rejected'}`, 'success');
    },
    onError: (err: AxiosError) => addToast(apiError(err, 'Could not update the payment'), 'error'),
  });
}

// ─── Online invoices (Paymob, test double) ──────────────────────────────

export function useOnlineCheckout() {
  const addToast = useUiStore((s) => s.addToast);
  const { t } = useI18n();
  const apiError = useApiErrorMessage();
  return useMutation({
    mutationFn: (input: { planKey: string; provider: OnlineProvider }) =>
      billingApi.startOnlineCheckout(input.planKey, input.provider),
    onSuccess: (data) => {
      // Full navigation: Paymob's page is off-origin.
      window.location.href = data.redirectUrl;
    },
    onError: (err: AxiosError) => addToast(apiError(err, t.toast.checkoutFailed), 'error'),
  });
}

export function useInvoices() {
  const isAuthenticated = useAuthStore((s) => Boolean(s.user));
  return useQuery({ queryKey: billingKeys.invoices, queryFn: () => billingApi.invoices(), enabled: isAuthenticated });
}

/** Polls a pending invoice: the gateway's callback, not the redirect, settles it. */
export function useInvoice(id: string | null) {
  return useQuery({
    queryKey: billingKeys.invoice(id ?? ''),
    queryFn: () => billingApi.invoice(id!),
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data?.status === 'PENDING' ? 3000 : false),
  });
}

export function useTestPay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; outcome: 'PAID' | 'FAILED' }) => billingApi.testPay(input.id, input.outcome),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.me });
      queryClient.invalidateQueries({ queryKey: ['billing', 'invoice'] });
      queryClient.invalidateQueries({ queryKey: billingKeys.invoices });
    },
  });
}

// ─── Feature flags ──────────────────────────────────────────────────────

/**
 * Which features exist right now. A switched-off feature is hidden; a
 * switched-on one the plan lacks is shown locked with an upgrade prompt.
 * While loading, everything reads as off, so nothing flashes in and out.
 */
export function useFlags() {
  const { data, isLoading } = useQuery({
    queryKey: billingKeys.flags,
    queryFn: () => billingApi.flags(),
    staleTime: 60 * 1000,
  });
  return { isOn: (key: string) => Boolean(data?.[key]), isLoading };
}

/**
 * One feature's state for the UI: 'hidden' (switched off), 'locked' (on, not
 * in the plan) or 'available'. The server enforces the same rule.
 */
export function useEntitlement(feature: string): 'hidden' | 'locked' | 'available' | 'loading' {
  const flags = useFlags();
  const { hasFeature, isLoading } = useEntitlements();
  if (flags.isLoading) return 'loading';
  if (!flags.isOn(feature)) return 'hidden';
  if (isLoading) return 'loading';
  return hasFeature(feature) ? 'available' : 'locked';
}

// ─── Admin: plans and flags ─────────────────────────────────────────────

export function useAdminPlans() {
  return useQuery({ queryKey: billingKeys.adminPlans, queryFn: () => billingApi.adminPlans() });
}

export function useUpdatePlan() {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);
  const apiError = useApiErrorMessage();
  return useMutation({
    mutationFn: (input: { key: string; patch: AdminPlanPatch }) => billingApi.updatePlan(input.key, input.patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.adminPlans });
      queryClient.invalidateQueries({ queryKey: billingKeys.plans });
      addToast('Plan saved', 'success');
    },
    onError: (err: AxiosError) => addToast(apiError(err), 'error'),
  });
}

export function useAdminFlags() {
  return useQuery({ queryKey: billingKeys.adminFlags, queryFn: () => billingApi.adminFlags() });
}

export function useSetFlag() {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);
  const apiError = useApiErrorMessage();
  return useMutation({
    mutationFn: (input: { key: string; enabled: boolean | null }) =>
      input.enabled === null ? billingApi.resetFlag(input.key) : billingApi.setFlag(input.key, input.enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.adminFlags });
      queryClient.invalidateQueries({ queryKey: billingKeys.flags });
    },
    onError: (err: AxiosError) => addToast(apiError(err), 'error'),
  });
}
