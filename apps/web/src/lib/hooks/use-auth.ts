import { useMutation } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api/auth.api';
import { useAuthStore } from '@/lib/store/auth.store';
import { useUiStore } from '@/lib/store/ui.store';
import type { LoginCredentials, RegisterCredentials } from '@/types/auth.types';
import { getApiErrorMessage } from '@/lib/utils/api-error';

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const addToast = useUiStore((s) => s.addToast);
  const router = useRouter();

  return useMutation({
    mutationFn: (creds: LoginCredentials) => authApi.login(creds),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken, data.refreshToken);
      addToast(`Welcome back, ${data.user.displayName ?? data.user.username}!`, 'success');
      router.push('/');
    },
    onError: (err: AxiosError<{ error?: { message?: string } }>) => {
      addToast(getApiErrorMessage(err, 'Login failed'), 'error');
    },
  });
}

export function useRegister() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const addToast = useUiStore((s) => s.addToast);
  const router = useRouter();

  return useMutation({
    mutationFn: (creds: RegisterCredentials) => authApi.register(creds),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken, data.refreshToken);
      addToast('Account created!', 'success');
      router.push('/');
    },
    onError: (err: AxiosError<{ error?: { message?: string } }>) => {
      addToast(getApiErrorMessage(err, 'Registration failed'), 'error');
    },
  });
}

export function useLogout() {
  const { refreshToken, clearAuth } = useAuthStore();
  const addToast = useUiStore((s) => s.addToast);
  const router = useRouter();

  return useMutation({
    mutationFn: () => authApi.logout(refreshToken ?? ''),
    onSettled: () => {
      clearAuth();
      addToast('Logged out', 'info');
      router.push('/');
    },
  });
}
