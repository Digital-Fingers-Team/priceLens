import Redis from 'ioredis';
import type { TestingModuleBuilder } from '@nestjs/testing';
import { CONNECTOR_CLASSES } from '../../src/scraping/connectors/connector.registry';
import type { RetailerConnector } from '../../src/scraping/interfaces/retailer-connector.interface';
import { unsafeTestDatabaseReason } from '../setup/test-database-guard';
import { SemanticService } from '../../src/matching/semantic.service';

/** Each connector's slug, so a switched-off stand-in keeps its store's name. */
const SLUG_BY_CLASS: Record<string, string> = {
  AmazonConnector: 'amazon',
  AlibabaConnector: 'alibaba',
  AliExpressConnector: 'aliexpress',
  NoonConnector: 'noon',
  JumiaConnector: 'jumia',
  CarrefourConnector: 'carrefour',
  TwoBConnector: '2b',
  ElarabyConnector: 'elaraby',
  Dream2000Connector: 'dream2000',
  BtechConnector: 'btech',
  TradelineConnector: 'tradeline',
  CompumartsConnector: 'compumarts',
};

/**
 * Replaces every store connector and the AI judge (agreeingJudge, below): the fakes given by slug, and a switched-off
 * stand-in for each other store. An e2e suite must never reach a real store;
 * overriding only some connectors let stores added later (B.TECH, Dream 2000)
 * scrape their live sites in the middle of a test run.
 */
export function offlineStores(
  builder: TestingModuleBuilder,
  fakes: Record<string, RetailerConnector>,
): TestingModuleBuilder {
  for (const Class of CONNECTOR_CLASSES) {
    const slug = SLUG_BY_CLASS[Class.name];
    if (!slug) throw new Error(`offlineStores: add ${Class.name} to SLUG_BY_CLASS`);
    const fake = fakes[slug] ?? { slug, isEnabled: false, searchListings: async () => [] };
    builder = builder.overrideProvider(Class).useValue(fake);
  }
  return builder.overrideProvider(SemanticService).useValue(agreeingJudge);
}

/**
 * Stands in for the Gemini judge, which CI has no key for. Since only the
 * judge may merge products (2026-09-29), a suite without one would merge
 * nothing. This judge agrees to every pair it is asked about, so the
 * pipeline's own steps (identifiers, model and variant guards, scores)
 * decide what is proposed, as they did before the judge was required.
 */
export const agreeingJudge = {
  isAvailable: () => true,
  judgeSameProduct: async () => true,
  judgeMany: async (_anchor: string, others: string[]) => others.map(() => true),
  translateToArabic: async (titles: string[]) => titles.map(() => null),
};

/**
 * Empties the test Redis databases (cache and queues). The suites truncate
 * the database but not Redis, so jobs one run queued (backfills, coverage
 * sweeps) were picked up by the next run's workers and changed what the
 * characterization suite saw. Refuses anything but local, non-zero test DBs.
 */
export async function clearTestRedis(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const reason = unsafeTestDatabaseReason(env);
  const host = env.REDIS_HOST ?? '127.0.0.1';
  const dbs = [Number(env.REDIS_DB ?? 0), Number(env.REDIS_QUEUE_DB ?? 0)];
  if (reason || !['localhost', '127.0.0.1', '::1'].includes(host) || dbs.some((db) => !(db > 0))) {
    throw new Error(`clearTestRedis: refusing (${reason ?? `redis ${host} db ${dbs.join(',')}`})`);
  }
  for (const db of new Set(dbs)) {
    const redis = new Redis({ host, port: Number(env.REDIS_PORT ?? 6379), password: env.REDIS_PASSWORD, db });
    try {
      await redis.flushdb();
    } finally {
      redis.disconnect();
    }
  }
}
