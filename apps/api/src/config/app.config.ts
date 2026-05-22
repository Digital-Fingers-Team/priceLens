// apps/api/src/config/app.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3001', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  throttleTtl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
  throttleLimit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
  throttleLimitAuth: parseInt(process.env.THROTTLE_LIMIT_AUTH ?? '500', 10),
  logLevel: process.env.LOG_LEVEL ?? 'debug',
  isProduction: process.env.NODE_ENV === 'production',
}));