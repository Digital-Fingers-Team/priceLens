import { FeatureFlagsService } from '../../src/feature-flags/feature-flags.service';
import { FLAG_REGISTRY, envOverride, isFlagKey } from '../../src/feature-flags/feature-flags.registry';
import { FEATURES } from '../../src/billing/plan-limits';

function serviceWith(rows: Array<{ key: string; enabled: boolean }>, fail = false) {
  const prisma = {
    featureFlag: {
      findMany: jest.fn(async () => {
        if (fail) throw new Error('db down');
        return rows.map((row) => ({ ...row, updatedAt: new Date('2026-10-01T00:00:00Z') }));
      }),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  return { service: new FeatureFlagsService(prisma as never), prisma };
}

describe('feature flags', () => {
  const ENV_KEY = 'FEATURE_CART_WATCH';
  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it('registers every plan feature', () => {
    for (const feature of Object.values(FEATURES)) expect(isFlagKey(feature)).toBe(true);
  });

  it('keeps features that shipped before v2 on, and unbuilt v2 features off', () => {
    expect(FLAG_REGISTRY[FEATURES.DEAL_HUNTER].defaultOn).toBe(true);
    expect(FLAG_REGISTRY[FEATURES.MAP_MONITORING].defaultOn).toBe(true);
    expect(FLAG_REGISTRY.mock_checkout.defaultOn).toBe(false);
  });

  it('reads FEATURE_<KEY> leniently and ignores nonsense', () => {
    expect(envOverride('cart_watch', { [ENV_KEY]: 'ON' })).toBe(true);
    expect(envOverride('cart_watch', { [ENV_KEY]: '0' })).toBe(false);
    expect(envOverride('cart_watch', { [ENV_KEY]: 'maybe' })).toBeUndefined();
    expect(envOverride('cart_watch', {})).toBeUndefined();
  });

  it('resolves database over environment over default', async () => {
    process.env[ENV_KEY] = 'true';
    const { service } = serviceWith([{ key: 'deal_hunter', enabled: false }]);

    const states = await service.list();
    const byKey = Object.fromEntries(states.map((state) => [state.key, state]));
    expect(byKey.deal_hunter).toMatchObject({ enabled: false, source: 'database' });
    expect(byKey.cart_watch).toMatchObject({ enabled: true, source: 'environment' });
    expect(byKey.mock_checkout).toMatchObject({ enabled: false, source: 'default' });
  });

  it('falls back to environment and defaults when the table cannot be read', async () => {
    const { service } = serviceWith([], true);
    await expect(service.isEnabled('deal_hunter')).resolves.toBe(true);
    await expect(service.isEnabled('mock_checkout')).resolves.toBe(false);
  });

  it('caches the table between reads', async () => {
    const { service, prisma } = serviceWith([]);
    await service.isEnabled('deal_hunter');
    await service.snapshot();
    expect(prisma.featureFlag.findMany).toHaveBeenCalledTimes(1);
  });
});
