import type { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WorkerMemoryGuard } from '../../src/workers/worker-memory-guard';

function guard(values: Record<string, string | undefined>) {
  const config = { get: (key: string) => values[key] } as unknown as ConfigService;
  const g = new WorkerMemoryGuard(config);
  g.shutdown = jest.fn();
  g.forceExit = jest.fn();
  return g;
}
const MB = 1048576;

describe('WorkerMemoryGuard', () => {
  it('does nothing when no limit is set', () => {
    const g = guard({});
    g.heapUsed = () => 5000 * MB;
    expect(g.check()).toBe(false);
    expect(g.shutdown).not.toHaveBeenCalled();
  });

  it('stays quiet below the limit', () => {
    const g = guard({ WORKER_MAX_HEAP_MB: '1200' });
    g.heapUsed = () => 1100 * MB;
    expect(g.check()).toBe(false);
  });

  it('above the limit shuts down gracefully once, and exits if that hangs', () => {
    jest.useFakeTimers();
    try {
      const g = guard({ WORKER_MAX_HEAP_MB: '1200', WORKER_RECYCLE_GRACE_MS: '5000' });
      g.heapUsed = () => 1300 * MB;
      expect(g.check()).toBe(true);
      expect(g.check()).toBe(false);
      expect(g.shutdown).toHaveBeenCalledTimes(1);
      expect(g.forceExit).not.toHaveBeenCalled();
      jest.advanceTimersByTime(5000);
      expect(g.forceExit).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('writes one heap snapshot, replacing the previous one', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heap-guard-'));
    fs.writeFileSync(path.join(dir, 'old.heapsnapshot'), 'x');
    const g = guard({ WORKER_MAX_HEAP_MB: '1', WORKER_HEAP_SNAPSHOT_DIR: dir });
    g.heapUsed = () => 2 * MB;
    expect(g.check()).toBe(true);
    const files = fs.readdirSync(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^worker-.*\.heapsnapshot$/);
    expect(fs.statSync(path.join(dir, files[0])).size).toBeGreaterThan(1000);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
