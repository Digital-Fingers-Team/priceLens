import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PriceIntelligenceService } from '../../src/intelligence/price-intelligence.service';
import { PriceAlertService } from '../../src/watchlist/price-alert.service';

/**
 * Exercises every hand-written SQL statement against a real PostgreSQL.
 *
 * These queries are invisible to the unit suite — they are strings until the
 * database parses them — and that gap shipped a real defect: ids are TEXT
 * columns (Prisma maps `String @id @default(uuid())` to text, not to a native
 * uuid), so a `::uuid` cast on the bind parameter failed with
 * "operator does not exist: text = uuid" and took out the whole intelligence
 * endpoint and the alert sweep.
 *
 * The assertions here are deliberately thin. The point is not the values, it
 * is that each statement PARSES AND RUNS against the real schema.
 *
 * Requires DATABASE_URL pointing at a migrated database.
 */
describe('raw SQL (integration)', () => {
  let prisma: PrismaClient;
  let intelligence: PriceIntelligenceService;
  let alerts: PriceAlertService;

  // Ids that are well-formed for the column type but match nothing, so the
  // queries run without depending on seeded data.
  const MISSING_ID = '00000000-0000-0000-0000-0000000000ff';

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const config = { get: (_key: string, fallback?: unknown) => fallback ?? 'EGP' } as ConfigService;
    const notifications = { dispatch: jest.fn().mockResolvedValue({ notificationId: null }) };
    const entitlements = {
      resolveHistoryWindow: jest
        .fn()
        .mockResolvedValue({ days: 90, truncated: false, maxDays: null }),
    };

    intelligence = new PriceIntelligenceService(prisma as never, entitlements as never, config);
    alerts = new PriceAlertService(prisma as never, notifications as never, config);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('PriceIntelligenceService', () => {
    it('runs the daily price series aggregation', async () => {
      const series = await intelligence.getDailySeries(MISSING_ID, 90);
      expect(Array.isArray(series)).toBe(true);
    });

    it('returns a well-formed empty market for an unknown product', async () => {
      const market = await intelligence.getCurrentMarket(MISSING_ID);
      expect(market.best).toBeNull();
      expect(market.storeCount).toBe(0);
      // Never "USD": prices are normalised to the FX base currency.
      expect(market.currency).toBe('EGP');
    });

    it('aggregates a real product without error when one exists', async () => {
      const row = await prisma.priceHistory.findFirst({ select: { canonicalProductId: true } });
      if (!row) {
        // An empty database is a legitimate state for this suite.
        return;
      }

      const series = await intelligence.getDailySeries(row.canonicalProductId, 365);
      expect(series.length).toBeGreaterThan(0);
      for (const point of series) {
        expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(Number.isFinite(point.min)).toBe(true);
        expect(point.min).toBeLessThanOrEqual(point.max);
        expect(point.count).toBeGreaterThan(0);
      }
    });
  });

  describe('PriceAlertService', () => {
    it('runs the whole evaluation sweep against the real schema', async () => {
      // Covers the market-snapshot, history-aggregate and baseline LATERAL
      // queries in one pass, whatever alerts happen to exist.
      const result = await alerts.evaluateActiveAlerts(50);
      expect(result).toEqual(
        expect.objectContaining({
          checked: expect.any(Number),
          triggered: expect.any(Number),
          notified: expect.any(Number),
        }),
      );
    });

    it('runs the market-snapshot query for ids that match nothing', async () => {
      const snapshots = await (
        alerts as unknown as {
          getMarketSnapshots: (ids: string[]) => Promise<Map<string, unknown>>;
        }
      ).getMarketSnapshots([MISSING_ID]);
      expect(snapshots.size).toBe(0);
    });

    it('runs the history-aggregate query for ids that match nothing', async () => {
      const aggregates = await (
        alerts as unknown as {
          getHistoryAggregates: (ids: string[]) => Promise<Map<string, unknown>>;
        }
      ).getHistoryAggregates([MISSING_ID]);
      expect(aggregates.size).toBe(0);
    });

    it('runs the baseline LATERAL query, including the timestamp array bind', async () => {
      const baselines = await (
        alerts as unknown as {
          getBaselines: (
            requests: Array<{ alertId: string; productId: string; createdAt: Date }>,
          ) => Promise<Map<string, number | null>>;
        }
      ).getBaselines([
        { alertId: MISSING_ID, productId: MISSING_ID, createdAt: new Date('2026-01-01T00:00:00Z') },
      ]);

      // The row is produced by UNNEST regardless of whether history matched,
      // so a missing product yields a null baseline rather than no row.
      expect(baselines.get(MISSING_ID)).toBeNull();
    });

    it('short-circuits on an empty id list without touching the database', async () => {
      const snapshots = await (
        alerts as unknown as {
          getMarketSnapshots: (ids: string[]) => Promise<Map<string, unknown>>;
        }
      ).getMarketSnapshots([]);
      expect(snapshots.size).toBe(0);
    });
  });
});
