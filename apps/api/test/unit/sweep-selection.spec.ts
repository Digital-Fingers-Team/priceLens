import { selectSweepCategories } from '../../src/scraping/ingestion/sweep-selection';

const leaf = (slug: string, rolloutWave: number, lastSweptAt: Date | null = null) => ({ slug, rolloutWave, lastSweptAt });

describe('selectSweepCategories', () => {
  const leaves = [
    leaf('phones', 0),
    leaf('laptops', 0),
    leaf('fridges', 1, new Date('2026-09-28T03:00:00Z')),
    leaf('washers', 1, null),
    leaf('acs', 1, new Date('2026-09-28T00:00:00Z')),
    leaf('sofas', 2),
  ];

  it('always sweeps wave 0, and only wave 0 while no wave is enabled', () => {
    expect(selectSweepCategories(leaves, { maxWave: 0, maxNewPerRun: 15 }).map((l) => l.slug)).toEqual(['phones', 'laptops']);
  });

  it('adds enabled waves up to the cap, never-swept first, then least recently swept', () => {
    expect(selectSweepCategories(leaves, { maxWave: 1, maxNewPerRun: 2 }).map((l) => l.slug)).toEqual([
      'phones',
      'laptops',
      'washers',
      'acs',
    ]);
  });

  it('leaves out waves above maxWave', () => {
    expect(selectSweepCategories(leaves, { maxWave: 1, maxNewPerRun: 15 }).some((l) => l.slug === 'sofas')).toBe(false);
    expect(selectSweepCategories(leaves, { maxWave: 2, maxNewPerRun: 15 }).some((l) => l.slug === 'sofas')).toBe(true);
  });

  it('orders ties by slug, so a run is reproducible', () => {
    const tied = [leaf('b', 1), leaf('a', 1)];
    expect(selectSweepCategories(tied, { maxWave: 1, maxNewPerRun: 5 }).map((l) => l.slug)).toEqual(['a', 'b']);
  });

  it('treats a cap of 0 or less as "no new categories"', () => {
    expect(selectSweepCategories(leaves, { maxWave: 2, maxNewPerRun: 0 }).map((l) => l.slug)).toEqual(['phones', 'laptops']);
  });

  it('rotates: after the selected leaves are marked swept, the next run picks the others', () => {
    const now = new Date('2026-09-28T06:00:00Z');
    const first = selectSweepCategories(leaves, { maxWave: 2, maxNewPerRun: 2 });
    const after = leaves.map((l) => (first.includes(l) && l.rolloutWave > 0 ? { ...l, lastSweptAt: now } : l));
    const second = selectSweepCategories(after, { maxWave: 2, maxNewPerRun: 2 }).filter((l) => l.rolloutWave > 0);
    expect(second.map((l) => l.slug)).toEqual(['acs', 'fridges']);
  });
});
