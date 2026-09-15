'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { sellerApi } from '@/lib/api/seller.api';
import { useAuthStore } from '@/lib/store/auth.store';
import { useUiStore } from '@/lib/store/ui.store';
import { getApiErrorMessage } from '@/lib/utils/api-error';
import type { CompetitorEventType, OrgType, SellerProductRow } from '@/types/seller.types';

export const sellerKeys = {
  workspaces: ['seller', 'workspaces'] as const,
  summary: (orgId: string) => ['seller', orgId, 'summary'] as const,
  products: (orgId: string, search?: string) => ['seller', orgId, 'products', search ?? ''] as const,
  product: (orgId: string, productId: string) => ['seller', orgId, 'product', productId] as const,
  events: (orgId: string, unreadOnly: boolean) => ['seller', orgId, 'events', unreadOnly] as const,
  rules: (orgId: string) => ['seller', orgId, 'rules'] as const,
};

export function useWorkspaces() {
  const isAuthenticated = useAuthStore((s) => Boolean(s.user));
  return useQuery({
    queryKey: sellerKeys.workspaces,
    queryFn: () => sellerApi.listWorkspaces(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);

  return useMutation({
    mutationFn: (input: { name: string; type: OrgType; platformId?: string }) =>
      sellerApi.createWorkspace(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sellerKeys.workspaces });
      addToast('Workspace created.', 'success');
    },
    onError: (err: AxiosError) => addToast(getApiErrorMessage(err, 'Could not create workspace'), 'error'),
  });
}

export function useWorkspaceSummary(orgId: string | undefined) {
  return useQuery({
    queryKey: sellerKeys.summary(orgId ?? ''),
    queryFn: () => sellerApi.summary(orgId!),
    enabled: Boolean(orgId),
    staleTime: 60 * 1000,
  });
}

export function useSellerProducts(orgId: string | undefined, search?: string) {
  return useQuery({
    queryKey: sellerKeys.products(orgId ?? '', search),
    queryFn: () => sellerApi.listProducts(orgId!, search),
    enabled: Boolean(orgId),
    staleTime: 60 * 1000,
  });
}

export function useSellerProduct(orgId: string | undefined, productId: string | undefined) {
  return useQuery({
    queryKey: sellerKeys.product(orgId ?? '', productId ?? ''),
    queryFn: () => sellerApi.getProduct(orgId!, productId!),
    enabled: Boolean(orgId && productId),
    staleTime: 60 * 1000,
  });
}

export function useUpsertSellerProduct(orgId: string) {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);

  return useMutation({
    mutationFn: (input: Partial<SellerProductRow> & { sku: string; name: string }) =>
      sellerApi.upsertProduct(orgId, input),
    onSuccess: () => {
      // The position and recommendation both derive from what was just saved.
      queryClient.invalidateQueries({ queryKey: ['seller', orgId] });
      addToast('Saved.', 'success');
    },
    onError: (err: AxiosError) => addToast(getApiErrorMessage(err, 'Could not save'), 'error'),
  });
}

export function useDeleteSellerProduct(orgId: string) {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);

  return useMutation({
    mutationFn: (productId: string) => sellerApi.deleteProduct(orgId, productId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller', orgId] });
      addToast('Product removed.', 'success');
    },
    onError: (err: AxiosError) => addToast(getApiErrorMessage(err, 'Could not remove'), 'error'),
  });
}

export function useMatchSuggestions(orgId: string, productId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['seller', orgId, 'matches', productId],
    queryFn: () => sellerApi.matchSuggestions(orgId, productId),
    enabled,
    staleTime: 10 * 60 * 1000,
  });
}

export function useCompetitorEvents(orgId: string | undefined, unacknowledgedOnly = false) {
  return useQuery({
    queryKey: sellerKeys.events(orgId ?? '', unacknowledgedOnly),
    queryFn: () => sellerApi.listEvents(orgId!, { unacknowledgedOnly, limit: 50 }),
    enabled: Boolean(orgId),
    staleTime: 60 * 1000,
  });
}

export function useAcknowledgeEvent(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => sellerApi.acknowledgeEvent(orgId, eventId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['seller', orgId] }),
  });
}

export function useAlertRules(orgId: string | undefined) {
  return useQuery({
    queryKey: sellerKeys.rules(orgId ?? ''),
    queryFn: () => sellerApi.listRules(orgId!),
    enabled: Boolean(orgId),
  });
}

export function useUpsertAlertRule(orgId: string) {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);

  return useMutation({
    mutationFn: (input: {
      type: CompetitorEventType;
      thresholdPct?: number;
      isActive?: boolean;
      cooldownHours?: number;
    }) => sellerApi.upsertRule(orgId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sellerKeys.rules(orgId) }),
    onError: (err: AxiosError) => addToast(getApiErrorMessage(err, 'Could not save the rule'), 'error'),
  });
}
