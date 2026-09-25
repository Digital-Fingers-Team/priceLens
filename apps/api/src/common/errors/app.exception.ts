import { HttpException } from '@nestjs/common';
import type { ApiErrorCode } from './api-error';

/**
 * A domain error with a stable code. Throw one (or a subclass) when the
 * client must be able to tell this failure apart from others with the same
 * HTTP status; ApiExceptionFilter puts `code` and `details` in the envelope.
 */
export class AppException extends HttpException {
  constructor(status: number, code: ApiErrorCode, message: string, details?: Record<string, unknown>) {
    super({ statusCode: status, code, message, ...(details ?? {}) }, status);
  }
}
