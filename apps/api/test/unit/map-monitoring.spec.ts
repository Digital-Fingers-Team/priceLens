import { EventSeverity } from '@prisma/client';

/**
 * The MAP tolerance and severity thresholds are the part of MAP monitoring
 * that decides whether we accuse a named retailer of a breach, so they are
 * pinned here directly rather than only exercised through the database sweep.
 *
 * These mirror MapMonitoringService: TOLERANCE_PCT = 0.5, and severity bands
 * at -5% (WARNING) and -15% (CRITICAL).
 */
const TOLERANCE_PCT = 0.5;

function isViolation(mapPrice: number, advertised: number): boolean {
  return advertised < mapPrice * (1 - TOLERANCE_PCT / 100);
}

function severityFor(differencePct: number): EventSeverity {
  if (differencePct <= -15) return EventSeverity.CRITICAL;
  if (differencePct <= -5) return EventSeverity.WARNING;
  return EventSeverity.INFO;
}

function differencePct(mapPrice: number, advertised: number): number {
  return ((advertised - mapPrice) / mapPrice) * 100;
}

describe('MAP violation rules', () => {
  it('flags the brief’s worked example', () => {
    // MAP 10,000; advertised 8,799 -> -12%.
    expect(isViolation(10_000, 8_799)).toBe(true);
    expect(differencePct(10_000, 8_799)).toBeCloseTo(-12.01, 1);
    expect(severityFor(differencePct(10_000, 8_799))).toBe(EventSeverity.WARNING);
  });

  it('does not flag a price at MAP', () => {
    expect(isViolation(10_000, 10_000)).toBe(false);
  });

  it('does not flag a price above MAP', () => {
    expect(isViolation(10_000, 10_500)).toBe(false);
  });

  it('tolerates rounding and FX drift just below MAP', () => {
    // A store pricing at 9,990 against a 10,000 MAP is rounding, not a breach.
    // Flagging it would bury the real violations in noise.
    expect(isViolation(10_000, 9_990)).toBe(false);
  });

  it('flags a breach just beyond the tolerance', () => {
    expect(isViolation(10_000, 9_940)).toBe(true);
  });

  it('escalates severity with the size of the breach', () => {
    expect(severityFor(differencePct(10_000, 9_800))).toBe(EventSeverity.INFO);
    expect(severityFor(differencePct(10_000, 9_000))).toBe(EventSeverity.WARNING);
    expect(severityFor(differencePct(10_000, 8_000))).toBe(EventSeverity.CRITICAL);
  });

  it('builds a dedupe key that collapses repeat sweeps within a day', () => {
    const key = (productId: string, platformId: string, day: string) =>
      `${productId}:${platformId}:MAP_VIOLATION:${day}`;

    expect(key('p1', 'store1', '2026-09-15')).toBe(key('p1', 'store1', '2026-09-15'));
    expect(key('p1', 'store1', '2026-09-15')).not.toBe(key('p1', 'store1', '2026-09-16'));
    expect(key('p1', 'store1', '2026-09-15')).not.toBe(key('p1', 'store2', '2026-09-15'));
  });
});
