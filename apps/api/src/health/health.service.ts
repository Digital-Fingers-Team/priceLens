import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import type { RedisCache } from 'cache-manager-ioredis-yet';
import { PrismaService } from '../database/prisma.service';
import { INGESTION_QUEUE } from '../workers/ingestion.jobs';
import { withTimeout } from '../common/redis-resilience';

export interface DependencyCheck {
  status: 'ok' | 'down';
  latencyMs: number;
  error?: string;
}

export interface ReadinessReport {
  status: 'ok' | 'down';
  checks: { database: DependencyCheck; cache: DependencyCheck; queue: DependencyCheck };
}

const CHECK_TIMEOUT_MS = 2_000;

export interface StoreOps {
  slug: string;
  /** Listings with a price, and how many a scrape confirmed in the last 24 h. */
  pricedListings: number;
  refreshed24h: number;
  lastSeenAt: string | null;
  /** Category sweeps (scraping_jobs) in the last 24 h. */
  sweeps24h: { completed: number; failed: number };
}

export interface OpsReport {
  generatedAt: string;
  queue: { waiting: number; active: number; delayed: number; failed: number; completed: number };
  stores: StoreOps[];
  process: { role: string; rssMb: number; heapUsedMb: number; uptimeS: number };
}

interface StoreOpsRow {
  slug: string;
  priced: bigint;
  refreshed: bigint;
  last_seen: Date | null;
  completed: bigint;
  failed: bigint;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: RedisCache,
    @InjectQueue(INGESTION_QUEUE) private readonly queue: Queue,
  ) {}

  async check(): Promise<ReadinessReport> {
    const [database, cache, queue] = await Promise.all([
      this.probe('database', () => this.prisma.$queryRaw`SELECT 1`),
      this.probe('cache', () => this.cache.store.client.ping()),
      this.probe('queue', () => this.queue.client.ping()),
    ]);
    const checks = { database, cache, queue };
    const status = Object.values(checks).every((check) => check.status === 'ok') ? 'ok' : 'down';
    return { status, checks };
  }

  /**
   * What the host monitor (scripts/monitor.sh) alerts on: queue backlog, and
   * per store whether prices are still being refreshed. Read-only, two
   * aggregate queries; served on /health/ops, which nginx does not route.
   */
  async ops(role: string): Promise<OpsReport> {
    const [counts, stores] = await Promise.all([
      withTimeout(this.queue.getJobCounts(), CHECK_TIMEOUT_MS, 'queue counts'),
      this.prisma.$queryRaw<StoreOpsRow[]>`
        SELECT p.slug,
               coalesce(l.priced, 0) AS priced,
               coalesce(l.refreshed, 0) AS refreshed,
               l.last_seen,
               coalesce(j.completed, 0) AS completed,
               coalesce(j.failed, 0) AS failed
          FROM platforms p
          LEFT JOIN (
            SELECT platform_id,
                   count(*) AS priced,
                   count(*) FILTER (WHERE last_seen_at > now() - interval '24 hours') AS refreshed,
                   max(last_seen_at) AS last_seen
              FROM source_listings
             WHERE price_usd > 0
             GROUP BY platform_id
          ) l ON l.platform_id = p.id
          LEFT JOIN (
            SELECT platform_id,
                   count(*) FILTER (WHERE status = 'COMPLETED') AS completed,
                   count(*) FILTER (WHERE status = 'FAILED') AS failed
              FROM scraping_jobs
             WHERE created_at > now() - interval '24 hours'
             GROUP BY platform_id
          ) j ON j.platform_id = p.id
         WHERE p.is_active
         ORDER BY p.slug`,
    ]);
    const memory = process.memoryUsage();
    const mb = (bytes: number) => Math.round(bytes / 1048576);
    return {
      generatedAt: new Date().toISOString(),
      queue: {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        failed: counts.failed ?? 0,
        completed: counts.completed ?? 0,
      },
      stores: stores.map((row) => ({
        slug: row.slug,
        pricedListings: Number(row.priced),
        refreshed24h: Number(row.refreshed),
        lastSeenAt: row.last_seen ? row.last_seen.toISOString() : null,
        sweeps24h: { completed: Number(row.completed), failed: Number(row.failed) },
      })),
      process: { role, rssMb: mb(memory.rss), heapUsedMb: mb(memory.heapUsed), uptimeS: Math.round(process.uptime()) },
    };
  }

  private async probe(name: string, call: () => Promise<unknown>): Promise<DependencyCheck> {
    const started = Date.now();
    try {
      await withTimeout(call(), CHECK_TIMEOUT_MS, `${name} check`);
      return { status: 'ok', latencyMs: Date.now() - started };
    } catch (error) {
      return { status: 'down', latencyMs: Date.now() - started, error: (error as Error).message };
    }
  }
}
