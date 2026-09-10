import type { AxiosError } from 'axios';

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: string[] | string;
  };
}

/**
 * Turns an API error into a message worth showing a user.
 *
 * The API returns a generic `message` ("Validation failed") and puts the part
 * that actually tells you what to fix in `details`, so surface that when present.
 */
export function getApiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  const axiosErr = err as AxiosError<ApiErrorBody>;

  if (axiosErr?.code === 'ECONNABORTED') return 'The request timed out. Please try again.';
  if (axiosErr?.response == null && axiosErr?.request != null) {
    return 'Cannot reach the server. Check your connection and try again.';
  }

  const apiError = axiosErr?.response?.data?.error;
  const details = apiError?.details;

  if (Array.isArray(details) && details.length > 0) return details.join('. ');
  if (typeof details === 'string' && details.trim()) return details;
  if (apiError?.message) return apiError.message;

  if (axiosErr?.response?.status === 429) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (axiosErr?.response && axiosErr.response.status >= 500) {
    return 'The server ran into a problem. Please try again shortly.';
  }

  return fallback;
}
