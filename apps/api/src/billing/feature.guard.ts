import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EntitlementsService } from './entitlements.service';
import { FeatureKey } from './plan-limits';
import { REQUIRES_FEATURE_KEY } from './requires-feature.decorator';
import { UpgradeRequiredException } from './billing.errors';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { FlagKey } from '../feature-flags/feature-flags.registry';
import { REQUIRES_FLAG_KEY } from '../feature-flags/requires-flag.decorator';
import { FeatureDisabledException } from '../feature-flags/feature-flags.errors';

/**
 * Enforces @RequiresFeature and @RequiresFlag. Registered as a global
 * APP_GUARD so the gate is declarative and lives next to the route it protects.
 *
 * Order of checks: a switched-off flag is a 404 for everyone (the feature does
 * not exist right now), before any sign-in or plan question. Then a plan
 * feature needs a signed-in user whose plan includes it.
 *
 * Runs after JwtAuthGuard, so `request.user` is populated for any route that
 * is not @Public.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementsService,
    private readonly flags: FeatureFlagsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const required = this.reflector.getAllAndOverride<FeatureKey[]>(REQUIRES_FEATURE_KEY, targets) ?? [];
    const switches = this.reflector.getAllAndOverride<FlagKey[]>(REQUIRES_FLAG_KEY, targets) ?? [];

    if (required.length === 0 && switches.length === 0) return true;

    for (const flag of [...switches, ...required]) {
      if (!(await this.flags.isEnabled(flag))) throw new FeatureDisabledException(flag);
    }

    if (required.length === 0) return true;

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
