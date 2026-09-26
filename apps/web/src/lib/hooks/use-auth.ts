import { useMutation } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useRouter } from '@/lib/i18n/navigation';
import { authApi } from '@/lib/api/auth.api';
import { useAuthStore } from '@/lib/store/auth.store';
import { useUiStore } from '@/lib/store/ui.store';
import { useI18n } from '@/lib/i18n/provider';
import { useApiErrorMessage } from '@/lib/hooks/use-api-error';
import type { LoginCredentials, RegisterCredentials } from '@/types/auth.types';
import { nextFromLocation } from '@/lib/utils/next-path';

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const addToast = useUiStore((s) => s.addToast);
  const { t, tf } = useI18n();
  const apiError = useApiErrorMessage();
  const router = useRouter();

  return useMutation({
    mutationFn: (creds: LoginCredentials) => authApi.login(creds),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken, data.refreshToken);
      addToast(tf(t.toast.welcomeBack, { name: data.user.displayName ?? data.user.username }), 'success');
      // Back to the page that asked for sign-in (?next=), else home.
      router.push(nextFromLocation());
    },
    onError: (err: AxiosError<{ error?: { message?: string } }>) => {
      addToast(apiError(err, t.toast.loginFailed), 'error');
    },
  });
}

export function useRegister() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const addToast = useUiStore((s) => s.addToast);
  const { t } = useI18n();
  const apiError = useApiErrorMessage();
  const router = useRouter();

  return useMutation({
    mutationFn: (creds: RegisterCredentials) => authApi.register(creds),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken, data.refreshToken);
      addToast(t.toast.accountCreated, 'success');
      // Back to the page that asked for sign-in (?next=), else home.
      router.push(nextFromLocation());
    },
    onError: (err: AxiosError<{ error?: { message?: string } }>) => {
      addToast(apiError(err, t.toast.registrationFailed), 'error');
    },
  });
}

export function useLogout() {
  const { refreshToken, clearAuth } = useAuthStore();
  const addToast = useUiStore((s) => s.addToast);
  const { t } = useI18n();
  const router = useRouter();

  return useMutation({
    mutationFn: () => authApi.logout(refreshToken ?? ''),
    onSettled: () => {
      clearAuth();
      addToast(t.toast.signedOut, 'info');
      router.push('/');
    },
  });
}
