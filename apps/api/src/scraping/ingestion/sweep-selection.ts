export interface SweepCandidate {
  slug: string;
  rolloutWave: number;
  lastSweptAt: Date | null;
}

export interface SweepSelectionOptions {
  /** Highest rollout wave swept (CATEGORY_SWEEP_MAX_WAVE). 0 = the original categories only. */
  maxWave: number;
  /** Most wave >= 1 categories in one run (MAX_CATEGORY_SWEEPS_PER_RUN). */
  maxNewPerRun: number;
}

/**
 * The leaves one scheduled sweep covers: every wave-0 leaf (the original
 * categories, swept as they always were), then up to `maxNewPerRun` leaves
 * from waves 1..maxWave, never-swept first, then least recently swept, ties
 * by slug. The caller marks the chosen ones swept even when a store found
 * nothing, so an empty category cannot hold its place at the head of the
 * rotation.
 */
export function selectSweepCategories<T extends SweepCandidate>(leaves: T[], options: SweepSelectionOptions): T[] {
  const baseline = leaves.filter((leaf) => leaf.rolloutWave === 0);
  const rolledOut = leaves
    .filter((leaf) => leaf.rolloutWave >= 1 && leaf.rolloutWave <= options.maxWave)
    .sort(
      (a, b) =>
        (a.lastSweptAt?.getTime() ?? -Infinity) - (b.lastSweptAt?.getTime() ?? -Infinity) || a.slug.localeCompare(b.slug),
    )
    .slice(0, Math.max(0, options.maxNewPerRun));
  return [...baseline, ...rolledOut];
}
