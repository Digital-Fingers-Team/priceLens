/**
 * The one error shape every API response uses:
 *
 *   { success: false, error: { code, message, details?, requestId, timestamp, path } }
 *
 * `code` is stable and machine-readable (the client branches on it);
 * `message` is for people; `details` carries whatever a client needs to act
 * (validation messages, the plan a feature needs, a quota's numbers).
 */
export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE_ENTITY'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'UNKNOWN_ERROR'
  // Domain codes
  | 'UPGRADE_REQUIRED'
  | 'QUOTA_EXCEEDED'
  | 'CORS_ORIGIN_NOT_ALLOWED'
  // Database codes (Prisma)
  | 'DUPLICATE_RECORD'
  | 'INVALID_REFERENCE'
  | 'RELATION_VIOLATION'
  | 'QUERY_VALIDATION_ERROR'
  | 'DATABASE_ERROR';

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  details?: unknown;
  requestId: string;
  timestamp: string;
  path: string;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorBody;
}
