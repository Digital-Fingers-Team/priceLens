import { assertSeedAllowed, loadSeedConfig } from '../../seed/config';

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

describe('seed config', () => {
  it('defaults to the small demo profile', () => {
    expect(loadSeedConfig(env({})).profile).toBe('demo');
  });

  it('refuses synthetic products in production', () => {
    expect(() =>
      loadSeedConfig(env({ NODE_ENV: 'production', SEED_GENERATE_PRODUCTS: 'true' })),
    ).toThrow(/SEED_GENERATE_PRODUCTS=true/);
  });

  it('refuses a reset in production', () => {
    expect(() => assertSeedAllowed(env({ NODE_ENV: 'production', SEED_RESET: 'true' }))).toThrow(
      /SEED_RESET=true/,
    );
  });

  it('allows the bootstrap-only seed in production', () => {
    expect(() => assertSeedAllowed(env({ NODE_ENV: 'production' }))).not.toThrow();
  });

  it('allows synthetic data and resets outside production', () => {
    expect(() =>
      assertSeedAllowed(env({ NODE_ENV: 'development', SEED_GENERATE_PRODUCTS: 'true', SEED_RESET: 'true' })),
    ).not.toThrow();
  });
});
