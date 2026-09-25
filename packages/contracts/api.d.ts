/** Every successful API response. */
export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

/**
 * Stable, machine-readable error codes. The web app branches on these, so a
 * code is never renamed; add a new one instead.
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
  // Domain
  | 'UPGRADE_REQUIRED'
  | 'QUOTA_EXCEEDED'
  | 'CORS_ORIGIN_NOT_ALLOWED'
  // Database (Prisma)
  | 'DUPLICATE_RECORD'
  | 'INVALID_REFERENCE'
  | 'RELATION_VIOLATION'
  | 'QUERY_VALIDATION_ERROR'
  | 'DATABASE_ERROR';

export interface ApiErrorBody {
  code: ApiErrorCode;
  /** For people. */
  message: string;
  /**
   * What a client needs to act on the error: validation messages (string[]),
   * or the fields of a domain error (e.g. UPGRADE_REQUIRED carries
   * `feature`, `requiredTier`, `limit`, `current`).
   */
  details?: unknown;
  requestId: string;
  timestamp: string;
  path: string;
}

/** Every failed API response. */
export interface ApiErrorResponse {
  success: false;
  error: ApiErrorBody;
}

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
