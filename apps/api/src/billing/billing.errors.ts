import { ForbiddenException, HttpStatus } from '@nestjs/common';
import type { ApiErrorCode } from '../common/errors/api-error';
import { FeatureKey } from './plan-limits';

/**
 * Upgrade-shaped errors.
 *
 * These are 403s, but the client has to be able to tell "you may not do this,
 * ever" apart from "you may not do this on your current plan" so it can show
 * an upgrade prompt instead of a dead end. Everything a paywall modal needs
 * travels in the response body.
 */
export class UpgradeRequiredException extends ForbiddenException {
  constructor(
    reason: string,
    details: {
      feature?: FeatureKey;
      limit?: number | null;
      current?: number;
      requiredTier?: string;
    } = {},
  ) {
    super({
      statusCode: HttpStatus.FORBIDDEN,
      error: 'UpgradeRequired',
      code: 'UPGRADE_REQUIRED' satisfies ApiErrorCode,
      message: reason,
      ...details,
    });
  }
}

export class PlanLimitExceededException extends UpgradeRequiredException {
  constructor(resource: string, current: number, limit: number) {
    super(
      `You have reached your plan's limit of ${limit} ${resource}. Upgrade to add more.`,
      { limit, current },
    );
  }
}
