import axios, {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from 'axios';
import { API_BASE_URL } from '@/config/constants';

// Token refresh queue — prevents multiple simultaneous refresh calls
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((p) => {
    if (error) p.reject(error);
    else p.resolve(token!);
  });
  failedQueue = [];
}

function getStoredTokens() {
  if (typeof window === 'undefined') return { access: null, refresh: null };
  return {
    access: localStorage.getItem('pl_access_token'),
    refresh: localStorage.getItem('pl_refresh_token'),
  };
}

function setStoredTokens(access: string, refresh: string) {
  localStorage.setItem('pl_access_token', access);
  localStorage.setItem('pl_refresh_token', refresh);
}

function clearStoredTokens() {
  localStorage.removeItem('pl_access_token');
  localStorage.removeItem('pl_refresh_token');
}

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false,
});

// ── Request interceptor: attach access token ───────────────────────────────
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const { access } = getStoredTokens();
    if (access && config.headers) {
      config.headers.Authorization = `Bearer ${access}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ── Response interceptor: refresh on 401 ──────────────────────────────────
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    const isUnauthorized = error.response?.status === 401;
    const isAuthEndpoint = original.url?.includes('/auth/');
    const hasRefreshToken = !!getStoredTokens().refresh;

    if (isUnauthorized && !original._retry && !isAuthEndpoint && hasRefreshToken) {
      original._retry = true;

      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token) => {
              original.headers.Authorization = `Bearer ${token}`;
              resolve(apiClient(original));
            },
            reject,
          });
        });
      }

      isRefreshing = true;
      const { refresh } = getStoredTokens();

      try {
        const res = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refreshToken: refresh,
        });

        const { accessToken, refreshToken } = res.data.data;
        setStoredTokens(accessToken, refreshToken);
        processQueue(null, accessToken);
        original.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(original);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearStoredTokens();
        // Redirect to login — works in client components
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export { apiClient, setStoredTokens, clearStoredTokens, getStoredTokens };