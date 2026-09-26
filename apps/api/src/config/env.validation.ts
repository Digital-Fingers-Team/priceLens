import { z } from 'zod';

/**
 * Startup validation of the process environment.
 *
 * The config factories in this folder read process.env directly and fall back
 * to defaults, which hides mistakes: a missing DATABASE_URL surfaces as a
 * Prisma error on the first query, `AMAZON_ENABLED=False` quietly means
 * "enabled" (the code checks `!== 'false'`), and `REDIS_PORT=63 79` parses to
 * 63. This schema turns all of those into one clear error at boot.
 *
 * It validates shape only. Defaults stay where they are (the config
 * factories), and variables not listed here pass through untouched.
 */

const BOOLEAN_FLAG = /(_ENABLED|_DRY_RUN|^SMTP_SECURE|^BROWSER_HEADLESS)$/;
const CRON = /_CRON$/;

const NUMERIC = [
  'PORT',
  'REDIS_PORT',
  'REDIS_DB',
  'SMTP_PORT',
  'THROTTLE_TTL',
  'THROTTLE_LIMIT',
  'THROTTLE_LIMIT_AUTH',
  'TRUST_PROXY_HOPS',
  'LIVE_INGESTION_LIMIT',
  'MIN_STORES_PER_PRODUCT',
  'CONNECTOR_COOLDOWN_MINUTES',
  'CONNECTOR_FAILURE_THRESHOLD',
  'CROSS_STORE_BACKFILL_LIMIT_PER_QUERY',
  'CROSS_STORE_BACKFILL_MAX_PRODUCTS',
  'STORE_COVERAGE_SWEEP_BATCH_SIZE',
  'STORE_COVERAGE_RETRY_COOLDOWN_HOURS',
  'FX_RATES_CACHE_TTL_MS',
  'OFFER_MAX_AGE_DAYS',
  'NOTIFICATIONS_MAX_ATTEMPTS',
  'NOTIFICATIONS_MAX_PER_USER_PER_HOUR',
  'RECONCILIATION_MAX_PAIRS',
  'RECONCILIATION_NEIGHBORS_PER_PRODUCT',
  'RECONCILIATION_SIMILARITY_THRESHOLD',
] as const;

const URLS = [
  'DATABASE_URL',
  'REDIS_URL',
  'FX_RATES_API_URL',
  'OPENROUTER_BASE_URL',
  'IMPACT_API_BASE_URL',
  'TELEGRAM_API_BASE',
  'AMAZON_BASE_URL',
  'ALIBABA_BASE_URL',
  'ALIEXPRESS_BASE_URL',
  'NOON_BASE_URL',
  'JUMIA_BASE_URL',
  'TWOB_BASE_URL',
  'ELARABY_BASE_URL',
  'CARREFOUR_BASE_URL',
] as const;

const isUrl = (value: string) => {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

// Every check lives in one refinement (not partly in an object shape) so that
// a single run reports all problems: zod skips refinements once the base
// shape fails, which would hide everything behind one missing variable.
const schema = z
  .record(z.string().optional())
  .superRefine((vars, ctx) => {
    const issue = (key: string, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message });

    if (!vars.DATABASE_URL) issue('DATABASE_URL', 'is required');
    if (vars.NODE_ENV && !['development', 'test', 'production'].includes(vars.NODE_ENV)) {
      issue('NODE_ENV', 'must be development, test or production');
    }

    for (const [key, raw] of Object.entries(vars)) {
      if (raw === undefined || raw === '') continue;
      const value = raw.trim();
      if (BOOLEAN_FLAG.test(key) && value !== 'true' && value !== 'false') {
        issue(key, 'must be "true" or "false"');
      }
      if (CRON.test(key)) {
        const fields = value.split(/\s+/).length;
        if (fields < 5 || fields > 6) issue(key, 'must be a cron expression with 5 or 6 fields');
      }
    }

    for (const key of NUMERIC) {
      const value = vars[key];
      if (value !== undefined && value !== '' && !Number.isFinite(Number(value))) {
        issue(key, 'must be a number');
      }
    }

    for (const key of URLS) {
      const value = vars[key];
      if (value !== undefined && value !== '' && !isUrl(value)) {
        issue(key, 'must be a valid URL');
      }
    }

    if (vars.NODE_ENV === 'production') {
      for (const key of ['REDIS_HOST', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
        if (!vars[key]) issue(key, 'is required in production');
      }
    }
  });

/**
 * ConfigModule `validate` hook. Throws one error listing every problem --
 * variable names only, never values, since many of these are secrets.
 */
export function validateEnv(env: Record<string, unknown>): Record<string, unknown> {
  const result = schema.safeParse(env);
  if (result.success) return env;

  const problems = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
}
