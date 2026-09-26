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
