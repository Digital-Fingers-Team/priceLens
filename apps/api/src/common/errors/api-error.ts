/**
 * The error envelope every API response uses. Defined in @pricelens/contracts
 * so the web app reads exactly what the API writes:
 *
 *   { success: false, error: { code, message, details?, requestId, timestamp, path } }
 */
export type { ApiErrorBody, ApiErrorCode, ApiErrorResponse } from '@pricelens/contracts';
