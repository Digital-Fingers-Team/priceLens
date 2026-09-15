import { PlanTier, SubscriptionStatus } from '@prisma/client';
import { EntitlementsService } from '../../src/billing/entitlements.service';
import { FEATURES, FREE_LIMITS, isWithinLimit, parsePlanLimits } from '../../src/billing/plan-limits';

function buildService(subscription: unknown) {
  const prisma = {
    subscription: { findFirst: jest.fn().mockResolvedValue(subscription) },
  };
  // A no-op cache: caching is an optimisation, and the resolution rules are
  // what these tests are about.
  const cache = {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
  const service = new EntitlementsService(prisma as never, cache as never);
  return { service, prisma, cache };
}

const plusPlan = {
  key: 'plus_monthly',
  name: 'PriceLens Plus',
  tier: PlanTier.PLUS,
  isActive: true,
  limits: {
    trackedProducts: 500,
    activeAlerts: null,
    priceHistoryDays: null,
    alertTypes: ['PRICE_TARGET', 'RESTOCK'],
    notificationChannels: ['IN_APP', 'EMAIL', 'TELEGRAM'],
    features: [FEATURES.BUY_VERDICT, FEATURES.FAKE_SALE_DETECTION],
    monitoredSkus: 0,
    apiCallsPerDay: 0,
    seats: 1,
  },
};

function activeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    status: SubscriptionStatus.ACTIVE,
    currentPeriodEnd: new Date(Date.now() + 7 * 86_400_000),
    cancelAtPeriodEnd: false,
    trialEndsAt: null,
    limitOverrides: {},
    plan: plusPlan,
    ...overrides,
  };
}

describe('plan limit helpers', () => {
  it('treats a null limit as unlimited, never as zero', () => {
    expect(isWithinLimit(0, 0)).toBe(false);
    expect(isWithinLimit(9_999_999, null)).toBe(true);
    expect(isWithinLimit(9, 10)).toBe(true);
    expect(isWithinLimit(10, 10)).toBe(false);
  });

  it('falls back to free-tier values for malformed stored limits', () => {
    // Plan rows are operator-editable, so hand-broken JSON must not read as
    // "unlimited" and hand out the paid product.
    const parsed = parsePlanLimits({ trackedProducts: 'lots', activeAlerts: -5, features: 'all' });
    expect(parsed.trackedProducts).toBe(FREE_LIMITS.trackedProducts);
    expect(parsed.activeAlerts).toBe(FREE_LIMITS.activeAlerts);
    expect(parsed.features).toEqual([]);
  });

  it('keeps an explicit null as unlimited', () => {
    expect(parsePlanLimits({ activeAlerts: null }).activeAlerts).toBeNull();
  });

  it('discards feature strings it does not recognise', () => {
    const parsed = parsePlanLimits({ features: [FEATURES.BUY_VERDICT, 'god_mode'] });
    expect(parsed.features).toEqual([FEATURES.BUY_VERDICT]);
  });

  it('never reports an unlimited API quota', () => {
    // "Unlimited" is meaningless for a rate limit and would disable it.
    expect(parsePlanLimits({ apiCallsPerDay: null }).apiCallsPerDay).toBe(0);
  });
});

describe('EntitlementsService', () => {
  it('serves free-tier entitlements with no subscription', async () => {
    const { service } = buildService(null);
    const result = await service.getEntitlements('user-1');
    expect(result.tier).toBe(PlanTier.FREE);
    expect(result.limits.features).toEqual([]);
  });

  it('serves free-tier entitlements for an anonymous caller', async () => {
    const { service, prisma } = buildService(null);
    const result = await service.getEntitlements(null);
    expect(result.tier).toBe(PlanTier.FREE);
    expect(prisma.subscription.findFirst).not.toHaveBeenCalled();
  });

  it('grants the plan limits for an active subscription', async () => {
    const { service } = buildService(activeSubscription());
    const result = await service.getEntitlements('user-1');
    expect(result.tier).toBe(PlanTier.PLUS);
    expect(result.limits.trackedProducts).toBe(500);
    expect(result.limits.activeAlerts).toBeNull();
  });

  it('refuses to honour a subscription whose period has elapsed', async () => {
    // Guards against a lost or delayed provider webhook leaving a lapsed
    // customer entitled indefinitely.
    const { service } = buildService(
      activeSubscription({ currentPeriodEnd: new Date(Date.now() - 86_400_000) }),
    );
    const result = await service.getEntitlements('user-1');
    expect(result.tier).toBe(PlanTier.FREE);
  });

  it('keeps access while a payment is being retried', async () => {
    const { service } = buildService(activeSubscription({ status: SubscriptionStatus.PAST_DUE }));
    const result = await service.getEntitlements('user-1');
    expect(result.tier).toBe(PlanTier.PLUS);
  });

  it('drops to free when the plan itself has been deactivated', async () => {
    const { service } = buildService(
      activeSubscription({ plan: { ...plusPlan, isActive: false } }),
    );
    expect((await service.getEntitlements('user-1')).tier).toBe(PlanTier.FREE);
  });

  it('lets a per-customer override widen a single limit only', async () => {
    const { service } = buildService(
      activeSubscription({ limitOverrides: { trackedProducts: 10_000 } }),
    );
    const result = await service.getEntitlements('user-1');
    expect(result.limits.trackedProducts).toBe(10_000);
    // Untouched keys still come from the plan, not from the free tier.
    expect(result.limits.features).toContain(FEATURES.BUY_VERDICT);
  });

  it('degrades to the free tier instead of failing when the database errors', async () => {
    const prisma = {
      subscription: { findFirst: jest.fn().mockRejectedValue(new Error('connection refused')) },
    };
    const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
    const service = new EntitlementsService(prisma as never, cache as never);

    const result = await service.getEntitlements('user-1');
    expect(result.tier).toBe(PlanTier.FREE);
  });

  describe('history window', () => {
    it('clamps a free user to their window and says so', async () => {
      const { service } = buildService(null);
      const window = await service.resolveHistoryWindow('user-1', 365);
      expect(window.days).toBe(FREE_LIMITS.priceHistoryDays);
      expect(window.truncated).toBe(true);
    });

    it('does not inflate a request smaller than the cap', async () => {
      const { service } = buildService(null);
      const window = await service.resolveHistoryWindow('user-1', 7);
      expect(window.days).toBe(7);
      expect(window.truncated).toBe(false);
    });

    it('leaves a paid user unclamped', async () => {
      const { service } = buildService(activeSubscription());
      const window = await service.resolveHistoryWindow('user-1', 365);
      expect(window.days).toBe(365);
      expect(window.truncated).toBe(false);
      expect(window.maxDays).toBeNull();
    });

    it('falls back to a sane default for a nonsense request', async () => {
      const { service } = buildService(null);
      const window = await service.resolveHistoryWindow('user-1', Number.NaN);
      expect(window.days).toBeGreaterThan(0);
    });
  });

  describe('feature checks', () => {
    it('reports a feature the plan includes', async () => {
      const { service } = buildService(activeSubscription());
      expect(await service.hasFeature('user-1', FEATURES.BUY_VERDICT)).toBe(true);
    });

    it('refuses a feature the plan does not include', async () => {
      const { service } = buildService(activeSubscription());
      expect(await service.hasFeature('user-1', FEATURES.MAP_MONITORING)).toBe(false);
    });

    it('gates alert types by plan', async () => {
      const { service } = buildService(activeSubscription());
      expect(await service.canUseAlertType('user-1', 'RESTOCK' as never)).toBe(true);
      expect(await service.canUseAlertType('user-1', 'MAJOR_DISCOUNT' as never)).toBe(false);
    });
  });
});
