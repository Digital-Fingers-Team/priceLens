import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api/auth.api';
import { useAuthStore } from '@/lib/store/auth.store';
import { useUiStore } from '@/lib/store/ui.store';
import type { LoginCredentials, RegisterCredentials } from '@/types/auth.types';

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
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message ?? 'Login failed';
      addToast(msg, 'error');
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
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message ?? 'Registration failed';
      addToast(msg, 'error');
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