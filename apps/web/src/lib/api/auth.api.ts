import { apiClient } from './client';
import type { AuthSession, LoginCredentials, RegisterCredentials } from '@/types/auth.types';
import type { ApiResponse } from '@/types/api.types';

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthSession> => {
    const res = await apiClient.post<ApiResponse<AuthSession>>(
      '/auth/login',
      credentials,
    );
    return res.data.data;
  },

  register: async (credentials: RegisterCredentials): Promise<AuthSession> => {
    const res = await apiClient.post<ApiResponse<AuthSession>>(
      '/auth/register',
      credentials,
    );
    return res.data.data;
  },

  // The refresh token is an httpOnly cookie the browser sends itself (D-17).
  refresh: async (): Promise<AuthSession> => {
    const res = await apiClient.post<ApiResponse<AuthSession>>('/auth/refresh', {});
    return res.data.data;
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout', {});
  },

  me: async () => {
    const res = await apiClient.get('/auth/me');
    return res.data.data;
  },
};