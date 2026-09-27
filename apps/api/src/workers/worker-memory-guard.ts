import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as v8 from 'v8';

/**
 * Recycles the worker before its heap runs out (phase 10).
 *
 * The worker's heap still grows by a few hundred MB an hour after the service
 * worker fix (audit/10-devops.md, OPS-01), and a V8 out-of-memory abort kills
 * running jobs mid-write. Instead, once the heap passes WORKER_MAX_HEAP_MB this
 * asks the process to shut down gracefully (SIGTERM: Bull stops taking jobs
 * and lets the running ones finish) and the container's restart policy starts
 * a fresh one. If shutdown takes longer than the grace period, it exits anyway;
 * Bull re-runs a job that stalled.
 *
 * With WORKER_HEAP_SNAPSHOT_DIR set, it first writes one heap snapshot there
 * (replacing the previous one) so the retainer can be found offline. That
 * blocks the process for tens of seconds, which a worker can afford.
 *
 * Off unless WORKER_MAX_HEAP_MB is set (production sets it for the worker).
 */
@Injectable()
export class WorkerMemoryGuard implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WorkerMemoryGuard.name);
  private timer?: NodeJS.Timeout;
  private tripped = false;

  /** Overridable in tests. */
  heapUsed: () => number = () => process.memoryUsage().heapUsed;
  shutdown: () => void = () => process.kill(process.pid, 'SIGTERM');
  forceExit: () => void = () => process.exit(1);

  constructor(private readonly config: ConfigService) {}

  get limitMb(): number {
    return Math.max(0, Number(this.config.get<string>('WORKER_MAX_HEAP_MB') ?? 0) || 0);
  }

  onApplicationBootstrap(): void {
    if (this.limitMb === 0) return;
    this.logger.log(`Recycling this worker when its heap passes ${this.limitMb} MB`);
    this.timer = setInterval(() => this.check(), 60_000);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One check; public for tests. Returns true when it started a recycle. */
  check(): boolean {
    const limit = this.limitMb;
    if (this.tripped || limit === 0) return false;
    const usedMb = Math.round(this.heapUsed() / 1048576);
    if (usedMb < limit) return false;

    this.tripped = true;
    this.logger.warn(`Heap at ${usedMb} MB (limit ${limit} MB): recycling this worker`);
    this.writeSnapshot();
    const graceMs = Math.max(1, Number(this.config.get<string>('WORKER_RECYCLE_GRACE_MS') ?? 120_000) || 120_000);
    setTimeout(() => {
      this.logger.error(`Graceful shutdown took over ${graceMs} ms; exiting`);
      this.forceExit();
    }, graceMs).unref();
    this.shutdown();
    return true;
  }

  private writeSnapshot(): void {
    const dir = this.config.get<string>('WORKER_HEAP_SNAPSHOT_DIR');
    if (!dir) return;
    try {
      fs.mkdirSync(dir, { recursive: true });
      for (const old of fs.readdirSync(dir).filter((name) => name.endsWith('.heapsnapshot'))) {
        fs.rmSync(path.join(dir, old), { force: true });
      }
      const file = path.join(dir, `worker-${new Date().toISOString().replace(/[:.]/g, '-')}.heapsnapshot`);
      const started = Date.now();
      v8.writeHeapSnapshot(file);
      this.logger.warn(`Heap snapshot written to ${file} in ${Date.now() - started} ms`);
    } catch (error) {
      this.logger.error(`Heap snapshot failed: ${(error as Error).message}`);
    }
  }
}
