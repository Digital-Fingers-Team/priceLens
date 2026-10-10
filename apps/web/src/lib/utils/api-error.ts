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
  /** The API's English messages in this language, keyed by the exact message. */
  byMessage?: Record<string, string>;
  /** Shown for a plan limit (UPGRADE_REQUIRED) when this language has no word for the message itself. */
  upgradeRequired?: string;
  /** Shown instead of validation details, which the API writes in English. */
  invalidInput?: string;
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
 * The server writes English; a language's copy can word the known messages
 * (byMessage), plan limits and validation failures itself. A message it does
 * not know is shown as the server wrote it.
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

  const known = apiError?.message ? copy.byMessage?.[apiError.message] : undefined;
  if (known) return known;
  if (apiError?.code === 'UPGRADE_REQUIRED' && copy.upgradeRequired) return copy.upgradeRequired;

  const hasDetails = (Array.isArray(details) && details.length > 0) || (typeof details === 'string' && details.trim() !== '');
  if (hasDetails && copy.invalidInput) return copy.invalidInput;
  if (Array.isArray(details) && details.length > 0) return details.join('. ');
  if (typeof details === 'string' && details.trim()) return details;
  if (apiError?.message) return apiError.message;

  if (axiosErr?.response && axiosErr.response.status >= 500) {
    return copy.server;
  }

  return fallback ?? copy.generic;
}
