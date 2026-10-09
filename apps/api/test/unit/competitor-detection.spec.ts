import { Prisma } from '@prisma/client';
import { CompetitorDetectionService } from '../../src/seller/competitor-detection.service';

const HOUR = 3_600_000;

const row = (over: Record<string, unknown> = {}) => ({
  canonical_product_id: 'c1',
  platform_id: 'jumia',
  platform_name: 'Jumia',
  listing_id: 'l1',
  external_url: 'https://jumia.com.eg/x',
  current_price: new Prisma.Decimal(900),
  in_stock: true,
  previous_price: new Prisma.Decimal(1000),
  previous_in_stock: true,
  change_id: 'ph-1',
  changed_at: new Date(Date.now() - 2 * HOUR),
  first_seen_at: new Date('2026-01-01T00:00:00Z'),
  stddev: null,
  avg_price: null,
  ...over,
});

function setup(rows: unknown[], productCount = 1) {
  const products = Array.from({ length: productCount }, (_, i) => ({
    id: `sp-${String(i).padStart(4, '0')}`,
    orgId: 'o1',
    canonicalProductId: 'c1',
    name: 'Buds',
    currentPrice: new Prisma.Decimal(1200),
    organization: { platformId: null },
  }));
  const created: Array<{ type: string; dedupeKey: string }> = [];
  const prisma = {
    sellerProduct: {
      findMany: jest.fn(({ where, take }: { where: { id?: { gt: string } }; take: number }) =>
        Promise.resolve(products.filter((p) => !where.id || p.id > where.id.gt).slice(0, take)),
      ),
    },
    $queryRaw: jest.fn().mockResolvedValue(rows),
    competitorEvent: {
      create: jest.fn(({ data }: { data: { type: string; dedupeKey: string } }) => {
        created.push(data);
        return Promise.resolve(data);
      }),
    },
    competitorAlertRule: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const config = { get: (_key: string, fallback: unknown) => fallback };
  const service = new CompetitorDetectionService(prisma as never, {} as never, config as never);
  return { service, created, prisma };
}

describe('CompetitorDetectionService', () => {
  it('reports a recent price drop, keyed by the change', async () => {
    const { service, created } = setup([row()]);
    await service.detectForAllOrganizations();
    const drop = created.find((e) => e.type === 'PRICE_DROP');
    expect(drop?.dedupeKey).toBe('sp-0000:jumia:PRICE_DROP:ph-1');
  });

  it('does not re-report a change from weeks ago', async () => {
    const { service, created } = setup([row({ changed_at: new Date(Date.now() - 30 * 24 * HOUR) })]);
    await service.detectForAllOrganizations();
    expect(created.map((e) => e.type)).toEqual(['UNDERCUT']);
  });

  it('reads stock changes only when recent', async () => {
    const recent = setup([row({ in_stock: false, previous_price: new Prisma.Decimal(900) })]);
    await recent.service.detectForAllOrganizations();
    expect(recent.created.map((e) => e.type)).toContain('OUT_OF_STOCK');

    const old = setup([row({ in_stock: false, previous_price: new Prisma.Decimal(900), changed_at: new Date(Date.now() - 10 * 24 * HOUR) })]);
    await old.service.detectForAllOrganizations();
    expect(old.created.map((e) => e.type)).not.toContain('OUT_OF_STOCK');
  });

  it('a shop-wide rule alerts on each product, its cooldown is per product', async () => {
    const { service, prisma } = setup([row()], 2);
    const dispatch = jest.fn().mockResolvedValue({ notificationId: 'n1' });
    Object.assign(prisma, {
      competitorAlertRule: {
        findFirst: jest.fn().mockResolvedValue({ id: 'r1', thresholdPct: 1, cooldownHours: 12, lastFiredAt: new Date() }),
        update: jest.fn().mockResolvedValue({}),
      },
      organizationMember: { findMany: jest.fn().mockResolvedValue([{ userId: 'u1' }]) },
    });
    (service as unknown as { notifications: unknown }).notifications = { dispatch };
    await service.detectForAllOrganizations();
    const keys = dispatch.mock.calls.map(([input]) => input.dedupeKey);
    expect(keys).toContain('competitor:o1:sp-0000:UNDERCUT');
    expect(keys).toContain('competitor:o1:sp-0001:UNDERCUT');
    expect(dispatch.mock.calls[0][0].dedupeWindowMinutes).toBe(12 * 60);
  });

  it('scans every product, not only the first batch', async () => {
    const { service } = setup([], 450);
    const result = await service.detectForAllOrganizations(200);
    expect(result.productsScanned).toBe(450);
  });
});
