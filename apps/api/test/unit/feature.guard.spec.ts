import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlanTier } from '@prisma/client';
import { FeatureGuard } from '../../src/billing/feature.guard';
import { FEATURES } from '../../src/billing/plan-limits';
import { UpgradeRequiredException } from '../../src/billing/billing.errors';
import { REQUIRES_FEATURE_KEY } from '../../src/billing/requires-feature.decorator';
import { REQUIRES_FLAG_KEY } from '../../src/feature-flags/requires-flag.decorator';
import { FeatureDisabledException } from '../../src/feature-flags/feature-flags.errors';

function contextFor(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function buildGuard(
  required: string[] | undefined,
  features: string[],
  options: { switches?: string[]; disabled?: string[] } = {},
) {
  const metadata: Record<string, string[] | undefined> = {
    [REQUIRES_FEATURE_KEY]: required,
    [REQUIRES_FLAG_KEY]: options.switches,
  };
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => metadata[key]),
  } as unknown as Reflector;
  const entitlements = {
    getEntitlements: jest.fn().mockResolvedValue({ limits: { features }, tier: PlanTier.FREE }),
  };
  const flags = {
    isEnabled: jest.fn(async (flag: string) => !(options.disabled ?? []).includes(flag)),
  };
  return new FeatureGuard(reflector, entitlements as never, flags as never);
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

  it('answers 404 FEATURE_DISABLED for a switched-off feature, even to a paying user', async () => {
    const guard = buildGuard([FEATURES.DEAL_HUNTER], [FEATURES.DEAL_HUNTER], { disabled: [FEATURES.DEAL_HUNTER] });
    await expect(guard.canActivate(contextFor({ id: 'user-1' }))).rejects.toBeInstanceOf(FeatureDisabledException);
  });

  it('checks a switched-off flag before asking an anonymous caller to sign in', async () => {
    const guard = buildGuard([FEATURES.DEAL_HUNTER], [], { disabled: [FEATURES.DEAL_HUNTER] });
    await expect(guard.canActivate(contextFor(undefined))).rejects.toBeInstanceOf(FeatureDisabledException);
  });

  it('lets an anonymous caller through a route gated only on an operational flag that is on', async () => {
    const guard = buildGuard(undefined, [], { switches: ['org_invites'] });
    await expect(guard.canActivate(contextFor(undefined))).resolves.toBe(true);
  });

  it('refuses a route gated on an operational flag that is off', async () => {
    const guard = buildGuard(undefined, [], { switches: ['paymob_checkout'], disabled: ['paymob_checkout'] });
    await expect(guard.canActivate(contextFor(undefined))).rejects.toBeInstanceOf(FeatureDisabledException);
  });
});
