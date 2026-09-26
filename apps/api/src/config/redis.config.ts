// apps/api/src/config/redis.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB ?? '0', 10),
  // Bull's queues live in their own database, apart from the cache (B-14).
  queueDb: parseInt(process.env.REDIS_QUEUE_DB ?? '1', 10),
  url: process.env.REDIS_URL,
}));