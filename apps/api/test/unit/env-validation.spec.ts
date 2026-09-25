import { validateEnv } from '../../src/config/env.validation';

const DB = 'postgresql://pricelens:pw@127.0.0.1:5432/pricelens_dev?schema=public';

describe('validateEnv', () => {
  it('accepts a minimal development environment', () => {
    const env = { NODE_ENV: 'development', DATABASE_URL: DB };
    expect(validateEnv(env)).toBe(env);
  });

  it('passes unknown variables through untouched', () => {
    const env = { DATABASE_URL: DB, SOMETHING_ELSE: 'x y z' };
    expect(validateEnv(env)).toEqual(env);
  });

  it('requires DATABASE_URL', () => {
    expect(() => validateEnv({ NODE_ENV: 'development' })).toThrow(/DATABASE_URL: is required/);
  });

  it('rejects a flag that is not exactly true/false', () => {
    // The code checks `!== 'false'`, so "False" would silently mean enabled.
    expect(() => validateEnv({ DATABASE_URL: DB, AMAZON_ENABLED: 'False' })).toThrow(
      /AMAZON_ENABLED: must be "true" or "false"/,
    );
  });

  it('rejects non-numeric numbers, malformed crons and URLs, listing every problem', () => {
    let message = '';
    try {
      validateEnv({
        DATABASE_URL: DB,
        REDIS_PORT: '63 79',
        PRICE_ALERT_CRON: '*/30 * *',
        NOON_BASE_URL: 'www.noon.com',
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/REDIS_PORT: must be a number/);
    expect(message).toMatch(/PRICE_ALERT_CRON: must be a cron expression/);
    expect(message).toMatch(/NOON_BASE_URL: must be a valid URL/);
  });

  it('reports every problem even when DATABASE_URL is missing', () => {
    expect(() => validateEnv({ AMAZON_ENABLED: 'False', REDIS_PORT: 'abc' })).toThrow(
      /DATABASE_URL: is required[\s\S]*AMAZON_ENABLED[\s\S]*REDIS_PORT/,
    );
  });

  it('requires Redis and JWT secrets in production', () => {
    expect(() => validateEnv({ NODE_ENV: 'production', DATABASE_URL: DB })).toThrow(
      /REDIS_HOST: is required in production[\s\S]*JWT_ACCESS_SECRET[\s\S]*JWT_REFRESH_SECRET/,
    );
  });

  it('never echoes values into the error', () => {
    expect(() =>
      validateEnv({ DATABASE_URL: DB, STRIPE_WEBHOOK_SECRET: 'whsec_supersecret', SMTP_SECURE: 'whsec_supersecret' }),
    ).toThrow(expect.objectContaining({ message: expect.not.stringContaining('supersecret') }));
  });
});
