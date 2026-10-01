/**
 * The Egyptian sale calendar the buy/wait estimate knows about. Plain dates,
 * no model: when a big sale is close, "fair price" leans to "wait", and the
 * reason says which sale and how far away, so the buyer can judge.
 *
 * Ramadan moves with the Hijri calendar, so its starts are listed per year
 * (astronomical estimates; off by a day at most). Extend the table yearly.
 */
export type SaleEventCode = 'WHITE_FRIDAY' | 'RAMADAN' | 'BACK_TO_SCHOOL';

export interface SaleWindow {
  event: SaleEventCode;
  start: Date;
  end: Date;
}

const RAMADAN_STARTS: Record<number, string> = {
  2026: '2026-02-18',
  2027: '2027-02-08',
  2028: '2028-01-28',
  2029: '2029-01-16',
  2030: '2030-01-06',
};

const DAY_MS = 24 * 60 * 60 * 1000;
const utc = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day));

export function saleWindowsFor(year: number): SaleWindow[] {
  const windows: SaleWindow[] = [
    // Amazon.eg, Noon and the chains run White Friday through most of November.
    { event: 'WHITE_FRIDAY', start: utc(year, 11, 10), end: utc(year, 11, 30) },
    // School starts in late September; the sales run from mid-August.
    { event: 'BACK_TO_SCHOOL', start: utc(year, 8, 15), end: utc(year, 9, 25) },
  ];
  const ramadan = RAMADAN_STARTS[year];
  if (ramadan) {
    const start = new Date(`${ramadan}T00:00:00Z`);
    // The offers start the week before Ramadan and run to Eid.
    windows.push({ event: 'RAMADAN', start: new Date(start.getTime() - 7 * DAY_MS), end: new Date(start.getTime() + 30 * DAY_MS) });
  }
  return windows;
}

/** How close a sale is: days until it starts, or 0 while it is on. */
export function nearestSale(now: Date, horizonDays: number): { event: SaleEventCode; daysAway: number } | null {
  const year = now.getUTCFullYear();
  const windows = [...saleWindowsFor(year), ...saleWindowsFor(year + 1)];
  let best: { event: SaleEventCode; daysAway: number } | null = null;
  for (const window of windows) {
    if (now >= window.start && now <= window.end) return { event: window.event, daysAway: 0 };
    const away = Math.ceil((window.start.getTime() - now.getTime()) / DAY_MS);
    if (away > 0 && away <= horizonDays && (!best || away < best.daysAway)) best = { event: window.event, daysAway: away };
  }
  return best;
}
