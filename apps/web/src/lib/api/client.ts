import axios, {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from 'axios';
import { API_BASE_URL } from '@/config/constants';
import { localizePath, splitLocale } from '@/lib/i18n/config';
import { loginHref } from '@/lib/utils/next-path';

/**
 * The session lives in httpOnly cookies the API sets (D-17): script on the
 * page cannot read the tokens, so an injected script cannot steal them. The
 * browser sends them by itself; this client only
 *   - asks for cookie mode (X-Auth-Mode) on every call,
 *   - copies the readable pl_csrf cookie into X-CSRF-Token (double submit),
 *   - on a 401, refreshes once through the refresh cookie and retries.
 * Tokens used to be kept in localStorage; moveLegacySession() converts such a
 * session to cookies once and removes the stored tokens.
 */

const CSRF_COOKIE = 'pl_csrf';
const LEGACY_ACCESS = 'pl_access_token';
const LEGACY_REFRESH = 'pl_refresh_token';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  for (const part of document.cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/** True while the API's session cookies exist (pl_csrf lives as long as the refresh cookie). */
export function hasSessionCookie(): boolean {
  return readCookie(CSRF_COOKIE) != null;
}

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json', 'X-Auth-Mode': 'cookie' },
  // Same origin in production; in development the API is on another port.
  withCredentials: true,
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const csrf = readCookie(CSRF_COOKIE);
  if (csrf && config.headers) config.headers['X-CSRF-Token'] = csrf;
  // Server rendering only (a server-only variable, never in the bundle): tells
  // the API this is the website's own render, which it rate-limits by the
  // visitor the page forwards, or not at all for cached pages (OPS-14).
  const webToken = typeof window === 'undefined' ? process.env.WEB_INTERNAL_TOKEN : undefined;
  if (webToken && config.headers) config.headers['X-PriceLens-Web'] = webToken;
  return config;
});

/** One refresh at a time; concurrent 401s wait for it. */
let refreshing: Promise<void> | null = null;

function refreshSession(): Promise<void> {
  refreshing ??= apiClient
    .post('/auth/refresh', {})
    .then(() => undefined)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isUnauthorized = error.response?.status === 401;
    const isAuthEndpoint = original?.url?.includes('/auth/');

    if (!original || !isUnauthorized || original._retry || isAuthEndpoint || !hasSessionCookie()) {
      return Promise.reject(error);
    }
    original._retry = true;
    try {
      await refreshSession();
      return apiClient(original);
    } catch (refreshError) {
      // Session over: sign in again, then come back to this page.
      if (typeof window !== 'undefined') {
        const { locale, path } = splitLocale(window.location.pathname);
        window.location.href = localizePath(locale, loginHref(path + window.location.search));
      }
      return Promise.reject(refreshError);
    }
  },
);

/**
 * Before D-17 the tokens were in localStorage. If they still are, trade the
 * refresh token for session cookies once and delete both, so nobody who was
 * signed in is signed out by the change. Returns whether a session now exists.
 */
export async function moveLegacySession(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  let refreshToken: string | null = null;
  try {
    refreshToken = localStorage.getItem(LEGACY_REFRESH);
    localStorage.removeItem(LEGACY_ACCESS);
    localStorage.removeItem(LEGACY_REFRESH);
  } catch {
    return hasSessionCookie();
  }
  if (!refreshToken) return hasSessionCookie();
  try {
    await apiClient.post('/auth/refresh', { refreshToken });
    return true;
  } catch {
    return hasSessionCookie();
  }
}

export { apiClient };
