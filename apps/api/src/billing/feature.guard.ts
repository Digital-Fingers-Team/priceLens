import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EntitlementsService } from './entitlements.service';
import { FeatureKey } from './plan-limits';
import { REQUIRES_FEATURE_KEY } from './requires-feature.decorator';
import { UpgradeRequiredException } from './billing.errors';

/**
 * Enforces @RequiresFeature. Registered as a global APP_GUARD so the gate is
 * declarative and lives next to the route it protects.
 *
 * Runs after JwtAuthGuard, so `request.user` is populated for any route that
 * is not @Public.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<FeatureKey[]>(REQUIRES_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // A feature-gated route is inherently per-user; an anonymous caller cannot
    // hold an entitlement, so this is 401 rather than a silent free-tier pass.
    if (!user?.id) {
      throw new UnauthorizedException('Sign in to use this feature');
    }

    const { limits, tier } = await this.entitlements.getEntitlements(user.id);
    const missing = required.filter((feature) => !limits.features.includes(feature));

    if (missing.length > 0) {
      throw new UpgradeRequiredException(
        'This feature is not included in your current plan.',
        { feature: missing[0], requiredTier: tier },
      );
    }

    return true;
  }
}
