'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { buyerApi } from '@/lib/api/buyer.api';
import { useApiErrorMessage } from '@/lib/hooks/use-api-error';
import { useAuthStore } from '@/lib/store/auth.store';
import { useUiStore } from '@/lib/store/ui.store';

const keys = {
  extras: (productId: string, signedIn: boolean) => ['buyer', 'extras', productId, signedIn] as const,
  banks: ['buyer', 'banks'] as const,
  carts: ['buyer', 'carts'] as const,
};

/** Keyed on sign-in too: the Pro sections change when someone signs in. */
export function useBuyerExtras(productId: string | undefined) {
  const signedIn = useAuthStore((s) => Boolean(s.user));
  return useQuery({
    queryKey: keys.extras(productId ?? '', signedIn),
    queryFn: () => buyerApi.extras(productId!),
    enabled: Boolean(productId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useBanks() {
  const signedIn = useAuthStore((s) => Boolean(s.user));
  return useQuery({ queryKey: keys.banks, queryFn: () => buyerApi.banks(), enabled: signedIn });
}

function useErrorToast() {
  const addToast = useUiStore((s) => s.addToast);
  const apiError = useApiErrorMessage();
  return (error: AxiosError) => addToast(apiError(error), 'error');
}

export function useSetBanks() {
  const queryClient = useQueryClient();
  const onError = useErrorToast();
  return useMutation({
    mutationFn: (banks: string[]) => buyerApi.setBanks(banks),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.banks });
      queryClient.invalidateQueries({ queryKey: ['buyer', 'extras'] });
    },
    onError,
  });
}

export function useReportCoupon() {
  const queryClient = useQueryClient();
  const onError = useErrorToast();
  return useMutation({
    mutationFn: (input: { id: string; worked: boolean }) => buyerApi.reportCoupon(input.id, input.worked),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['buyer', 'extras'] }),
    onError,
  });
}

export function useCarts(enabled = true) {
  return useQuery({ queryKey: keys.carts, queryFn: () => buyerApi.carts(), enabled, retry: false });
}

export function useCreateCart() {
  const queryClient = useQueryClient();
  const onError = useErrorToast();
  return useMutation({
    mutationFn: buyerApi.createCart,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.carts }),
    onError,
  });
}

export function useUpdateCart() {
  const queryClient = useQueryClient();
  const onError = useErrorToast();
  return useMutation({
    mutationFn: (input: { id: string } & Parameters<typeof buyerApi.updateCart>[1]) => {
      const { id, ...rest } = input;
      return buyerApi.updateCart(id, rest);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.carts }),
    onError,
  });
}

export function useDeleteCart() {
  const queryClient = useQueryClient();
  const onError = useErrorToast();
  return useMutation({
    mutationFn: (id: string) => buyerApi.deleteCart(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.carts }),
    onError,
  });
}
