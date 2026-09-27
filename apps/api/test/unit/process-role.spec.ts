import { MODULE_METADATA } from '@nestjs/common/constants';
import { processRole, runsWorkers } from '../../src/config/process-role';
import { validateEnv } from '../../src/config/env.validation';
import { ScrapeSlots } from '../../src/workers/scrape-slots';

describe('processRole', () => {
  it('defaults to all and accepts api/worker in any case', () => {
    expect(processRole({})).toBe('all');
    expect(processRole({ PROCESS_ROLE: '' })).toBe('all');
    expect(processRole({ PROCESS_ROLE: ' API ' })).toBe('api');
    expect(processRole({ PROCESS_ROLE: 'worker' })).toBe('worker');
  });

  it('rejects anything else, at boot', () => {
    expect(() => processRole({ PROCESS_ROLE: 'workers' })).toThrow(/all, api, worker/);
    expect(() => validateEnv({ DATABASE_URL: 'postgresql://x@localhost/db', PROCESS_ROLE: 'both' })).toThrow(
      /PROCESS_ROLE: must be all, api or worker/,
    );
  });

  it('only the api role skips the job workers', () => {
    expect(runsWorkers('api')).toBe(false);
    expect(runsWorkers('worker')).toBe(true);
    expect(runsWorkers('all')).toBe(true);
  });
});

describe('AppModule by role', () => {
  const importsFor = (role: string): unknown[] => {
    const previous = process.env.PROCESS_ROLE;
    process.env.PROCESS_ROLE = role;
    try {
      let imports: unknown[] = [];
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires -- isolateModules needs require
        const { AppModule } = require('../../src/app.module');
        imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule);
      });
      return imports;
    } finally {
      if (previous === undefined) delete process.env.PROCESS_ROLE;
      else process.env.PROCESS_ROLE = previous;
    }
  };
  const hasWorkers = (imports: unknown[]) =>
    imports.some((entry) => typeof entry === 'function' && entry.name === 'WorkersModule');

  it('the api role runs no processors, schedulers or browsers', () => {
    expect(hasWorkers(importsFor('api'))).toBe(false);
  });

  it('worker and all run them', () => {
    expect(hasWorkers(importsFor('worker'))).toBe(true);
    expect(hasWorkers(importsFor('all'))).toBe(true);
  });
});

describe('ScrapeSlots', () => {
  const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    return { promise, resolve };
  };
  const tick = () => new Promise((resolve) => setImmediate(resolve));

  it('runs at most `limit` jobs at once', async () => {
    const slots = new ScrapeSlots(2);
    const gates = [deferred(), deferred(), deferred()];
    const started: number[] = [];
    const runs = gates.map((gate, i) =>
      slots.run(10, async () => {
        started.push(i);
        await gate.promise;
      }),
    );
    await tick();
    expect(started).toEqual([0, 1]);
    expect(slots.stats).toEqual({ running: 2, waiting: 1 });

    gates[0].resolve();
    await tick();
    expect(started).toEqual([0, 1, 2]);

    gates[1].resolve();
    gates[2].resolve();
    await Promise.all(runs);
    expect(slots.stats).toEqual({ running: 0, waiting: 0 });
  });

  it('gives a free slot to the most urgent waiter first (a shopper before background expansions)', async () => {
    const slots = new ScrapeSlots(1);
    const first = deferred();
    const order: string[] = [];
    const runs = [
      slots.run(10, () => first.promise),
      slots.run(10, async () => void order.push('expansion-1')),
      slots.run(10, async () => void order.push('expansion-2')),
      slots.run(1, async () => void order.push('user-search')),
    ];
    await tick();
    first.resolve();
    await Promise.all(runs);
    expect(order).toEqual(['user-search', 'expansion-1', 'expansion-2']);
  });

  it('frees the slot when a job throws', async () => {
    const slots = new ScrapeSlots(1);
    await expect(slots.run(10, async () => Promise.reject(new Error('store down')))).rejects.toThrow('store down');
    await expect(slots.run(10, async () => 'next')).resolves.toBe('next');
  });
});
