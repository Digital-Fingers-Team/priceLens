import { JUNK_LISTING_PATTERNS } from '../thresholds';

/**
 * Step 2 -- junk filter.
 *
 * Returns why the title is never a real single-unit offer (sponsored card,
 * wholesale lot), or null when it may be one.
 */
export function detectJunkListing(title: string): string | null {
  const junk = JUNK_LISTING_PATTERNS.find(([pattern]) => pattern.test(title));
  return junk ? junk[1] : null;
}
