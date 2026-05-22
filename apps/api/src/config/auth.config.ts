// apps/api/src/config/auth.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? 'INSECURE_DEFAULT_CHANGE_ME',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? 'INSECURE_DEFAULT_CHANGE_ME_REFRESH',
  jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
  jwtRefreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  bcryptRounds: 12,
}));