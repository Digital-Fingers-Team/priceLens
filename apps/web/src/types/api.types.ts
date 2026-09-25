// The response envelope is defined once, in @pricelens/contracts, and shared
// with the API.
import type { ApiResponse, PaginatedData } from '@pricelens/contracts';

export type {
  ApiResponse,
  ApiErrorResponse as ApiError,
  ApiErrorBody,
  ApiErrorCode,
  PaginatedData,
} from '@pricelens/contracts';

export type PaginatedResponse<T> = ApiResponse<PaginatedData<T>>;
