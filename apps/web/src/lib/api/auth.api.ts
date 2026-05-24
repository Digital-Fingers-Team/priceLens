import { apiClient } from './client';
import type { AuthTokens, LoginCredentials, RegisterCredentials } from '@/types/auth.types';
import type { ApiResponse } from '@/types/api.types';

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthTokens> => {
    const res = await apiClient.post<ApiResponse<AuthTokens>>(
      '/auth/login',
      credentials,
    );
    return res.data.data;
  },

  register: async (credentials: RegisterCredentials): Promise<AuthTokens> => {
    const res = await apiClient.post<ApiResponse<AuthTokens>>(
      '/auth/register',
      credentials,
    );
    return res.data.data;
  },

  refresh: async (refreshToken: string): Promise<AuthTokens> => {
    const res = await apiClient.post<ApiResponse<AuthTokens>>('/auth/refresh', {
      refreshToken,
    });
    return res.data.data;
  },

  logout: async (refreshToken: string): Promise<void> => {
    await apiClient.post('/auth/logout', { refreshToken });
  },

  me: async () => {
    const res = await apiClient.get('/auth/me');
    return res.data.data;
  },
};