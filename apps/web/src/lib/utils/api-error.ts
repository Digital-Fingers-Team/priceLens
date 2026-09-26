import type { AxiosError } from 'axios';

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: string[] | string;
  };
}

/** The generic messages, per UI language (dictionary errors.api). */
export interface ApiErrorCopy {
  timeout: string;
  offline: string;
  rateLimited: string;
  server: string;
  generic: string;
}

const ENGLISH: ApiErrorCopy = {
  timeout: 'The request timed out. Please try again.',
  offline: 'Cannot reach the server. Check your connection and try again.',
  rateLimited: 'Too many attempts. Please wait a minute and try again.',
  server: 'The server ran into a problem. Please try again shortly.',
  generic: 'Something went wrong',
};

/**
 * Turns an API error into a message worth showing a user.
 *
 * The API returns a generic `message` ("Validation failed") and puts the part
 * that actually tells you what to fix in `details`, so surface that when present.
 * Those server texts are English in both UIs (handoff → phase 11: map error
 * codes to dictionary messages).
 */
export function getApiErrorMessage(err: unknown, fallback?: string, copy: ApiErrorCopy = ENGLISH): string {
  const axiosErr = err as AxiosError<ApiErrorBody>;

  if (axiosErr?.code === 'ECONNABORTED') return copy.timeout;
  if (axiosErr?.response == null && axiosErr?.request != null) {
    return copy.offline;
  }

  const apiError = axiosErr?.response?.data?.error;
  const details = apiError?.details;

  // Checked before the server's message: the rate limiter's message is the
  // framework's ("ThrottlerException: Too Many Requests"), not user copy.
  if (axiosErr?.response?.status === 429 || apiError?.code === 'RATE_LIMITED') {
    return copy.rateLimited;
  }

  if (Array.isArray(details) && details.length > 0) return details.join('. ');
  if (typeof details === 'string' && details.trim()) return details;
  if (apiError?.message) return apiError.message;

  if (axiosErr?.response && axiosErr.response.status >= 500) {
    return copy.server;
  }

  return fallback ?? copy.generic;
}
