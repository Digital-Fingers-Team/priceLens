// apps/api/src/config/auth.config.ts
import { registerAs } from '@nestjs/config';

const INSECURE_ACCESS_DEFAULT = 'INSECURE_DEFAULT_CHANGE_ME';
const INSECURE_REFRESH_DEFAULT = 'INSECURE_DEFAULT_CHANGE_ME_REFRESH';

/**
 * Falling back to a hardcoded secret in production means anyone who can read
 * this file can mint an admin token, so a real deployment must fail to boot
 * rather than start in that state.
 */
function requireSecret(value: string | undefined, fallback: string, envVar: string): string {
  const secret = value ?? fallback;

  if (process.env.NODE_ENV === 'production') {
    if (secret === fallback) {
      throw new Error(
        `${envVar} must be set in production — refusing to start with the built-in default secret.`,
      );
    }
    if (secret.length < 32) {
      throw new Error(`${envVar} must be at least 32 characters in production.`);
    }
  }

  return secret;
}

export default registerAs('auth', () => ({
  jwtAccessSecret: requireSecret(
    process.env.JWT_ACCESS_SECRET,
    INSECURE_ACCESS_DEFAULT,
    'JWT_ACCESS_SECRET',
  ),
  jwtRefreshSecret: requireSecret(
    process.env.JWT_REFRESH_SECRET,
    INSECURE_REFRESH_DEFAULT,
    'JWT_REFRESH_SECRET',
  ),
  jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
  jwtRefreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  bcryptRounds: 12,
}));
