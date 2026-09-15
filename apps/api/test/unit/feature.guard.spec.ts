import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlanTier } from '@prisma/client';
import { FeatureGuard } from '../../src/billing/feature.guard';
import { FEATURES } from '../../src/billing/plan-limits';
import { UpgradeRequiredException } from '../../src/billing/billing.errors';

function contextFor(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function buildGuard(required: string[] | undefined, features: string[]) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(required) } as unknown as Reflector;
  const entitlements = {
    getEntitlements: jest.fn().mockResolvedValue({ limits: { features }, tier: PlanTier.FREE }),
  };
  return new FeatureGuard(reflector, entitlements as never);
}

describe('FeatureGuard', () => {
  it('lets an ungated route through untouched', async () => {
    const guard = buildGuard(undefined, []);
    await expect(guard.canActivate(contextFor(undefined))).resolves.toBe(true);
  });

  it('lets a route through when the plan includes the feature', async () => {
    const guard = buildGuard([FEATURES.DEAL_HUNTER], [FEATURES.DEAL_HUNTER]);
    await expect(guard.canActivate(contextFor({ id: 'user-1' }))).resolves.toBe(true);
  });

  it('offers an upgrade — not a login — to a signed-in user without the feature', async () => {
    // The regression this exists for: FeatureGuard was registered so that it
    // ran BEFORE JwtAuthGuard, so request.user was always undefined and every
    // paying-feature route answered 401 "sign in" to users who were already
    // signed in. That dead-ends the upgrade path the whole funnel depends on.
    const guard = buildGuard([FEATURES.DEAL_HUNTER], []);

    await expect(guard.canActivate(contextFor({ id: 'user-1' }))).rejects.toBeInstanceOf(
      UpgradeRequiredException,
    );
  });

  it('carries the missing feature in the error so the client can prompt precisely', async () => {
    const guard = buildGuard([FEATURES.MAP_MONITORING], [FEATURES.DEAL_HUNTER]);

    await expect(guard.canActivate(contextFor({ id: 'user-1' }))).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'UPGRADE_REQUIRED',
        feature: FEATURES.MAP_MONITORING,
      }),
    });
  });

  it('still rejects a genuinely anonymous caller with 401', async () => {
    const guard = buildGuard([FEATURES.DEAL_HUNTER], []);
    await expect(guard.canActivate(contextFor(undefined))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('requires every listed feature, not just one', async () => {
    const guard = buildGuard([FEATURES.DEAL_HUNTER, FEATURES.MAP_MONITORING], [FEATURES.DEAL_HUNTER]);
    await expect(guard.canActivate(contextFor({ id: 'user-1' }))).rejects.toBeInstanceOf(
      UpgradeRequiredException,
    );
  });
});
