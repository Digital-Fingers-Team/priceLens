import type { Job } from 'bull';
import { IngestionProcessor, MAX_PARKED_EXPANSIONS } from '../../src/workers/ingestion.processor';
import { ScrapeSlots } from '../../src/workers/scrape-slots';

/** The processor with only what a store expansion uses; its other services are not needed here. */
function processor(slots: ScrapeSlots, expand: jest.Mock) {
  const instance = Object.create(IngestionProcessor.prototype) as IngestionProcessor;
  Object.assign(instance, {
    scrapeSlots: slots,
    storeCoverageService: { expandProductStores: expand },
    logger: { log: () => undefined, warn: () => undefined, error: () => undefined },
  });
  return instance;
}

const job = { id: 'store-expansion:p1', data: { productId: 'p1', targetStores: 4 }, opts: { priority: 10 } } as unknown as Job;

describe('store expansion and the scrape slots', () => {
  it('runs while few jobs wait for a slot', async () => {
    const expand = jest.fn(async () => undefined);
    await processor(new ScrapeSlots(2), expand).handleRunStoreExpansion(job as never);
    expect(expand).toHaveBeenCalledWith('p1', 4);
  });

  it('is skipped instead of holding a Bull worker loop when slots are backed up (2026-10-09)', async () => {
    const slots = new ScrapeSlots(1);
    let release!: () => void;
    const busy = slots.run(1, () => new Promise<void>((resolve) => (release = resolve)));
    const parked = Array.from({ length: MAX_PARKED_EXPANSIONS }, () => slots.run(10, async () => undefined));
    expect(slots.stats.waiting).toBe(MAX_PARKED_EXPANSIONS);

    const expand = jest.fn(async () => undefined);
    const result = await processor(slots, expand).handleRunStoreExpansion(job as never);

    expect(result).toEqual({ skipped: 'scrape slots busy' });
    expect(expand).not.toHaveBeenCalled();
    release();
    await Promise.all([busy, ...parked]);
  });
});
