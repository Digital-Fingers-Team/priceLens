'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { billingApi } from '@/lib/api/billing.api';
import { useAuthStore } from '@/lib/store/auth.store';
import { useUiStore } from '@/lib/store/ui.store';
import { useI18n } from '@/lib/i18n/provider';
import { useApiErrorMessage } from '@/lib/hooks/use-api-error';
import type { Entitlements } from '@/types/billing.types';

const billingKeys = {
  plans: ['billing', 'plans'] as const,
  me: ['billing', 'me'] as const,
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
