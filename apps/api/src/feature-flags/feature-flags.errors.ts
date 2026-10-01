import { HttpStatus, NotFoundException } from '@nestjs/common';
import type { ApiErrorCode } from '../common/errors/api-error';

/**
 * A switched-off feature answers 404: to the caller it does not exist, which
 * is different from "your plan does not include it" (UPGRADE_REQUIRED).
 */
export class FeatureDisabledException extends NotFoundException {
  constructor(flag: string) {
    super({
      statusCode: HttpStatus.NOT_FOUND,
      code: 'FEATURE_DISABLED' satisfies ApiErrorCode,
      message: 'This feature is not available right now.',
      flag,
    });
  }
}
