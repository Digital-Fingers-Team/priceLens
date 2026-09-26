import { ConfigService } from '@nestjs/config';
import { AlertStatus, AlertType, PrismaClient } from '@prisma/client';
import type { CanonicalProduct, Platform, User } from '@prisma/client';
import { PriceAlertService } from '../../src/watchlist/price-alert.service';

/**
 * Price alerts against a real Postgres (audit 02, L-17): the market price is
 * the product page's best live offer, a trigger fires exactly once even when
 * two sweeps overlap, and a drop is measured from the best price when the
 * alert was created.
 */
describe('price alerts (integration)', () => {
  const run = `alert-${Date.now().toString(36)}`;
  const DAY = 86_400_000;
  let prisma: PrismaClient;
  let alerts: PriceAlertService;
  let dispatch: jest.Mock;
  let user: User;
  let product: CanonicalProduct;
  let stores: Platform[];

  async function listing(store: Platform, id: string, price: number, extra: Record<string, unknown> = {}) {
    return prisma.sourceListing.create({
      data: {
        platformId: store.id,
        canonicalProductId: product.id,
        externalId: `${run}-${id}`,
        externalUrl: `https://example.test/${id}`,
        rawTitle: `Zentrofon Z77 ${id}`,
        rawCurrency: 'EGP',
        priceUsd: price.toFixed(2),
        inStock: true,
        matchStatus: 'ACCEPTED',
        lastSeenAt: new Date(),
        ...extra,
      },
    });
  }

  async function point(listingId: string, price: number, at: Date) {
    await prisma.priceHistory.create({
      data: { sourceListingId: listingId, canonicalProductId: product.id, priceUsd: price.toFixed(2), currency: 'EGP', recordedAt: at },
    });
  }

  async function alert(alertType: AlertType, threshold: number, createdAt = new Date()) {
    return prisma.priceAlert.create({
      data: { userId: user.id, canonicalProductId: product.id, alertType, thresholdValue: threshold.toFixed(2), createdAt },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    dispatch = jest.fn().mockResolvedValue({ notificationId: 'n1' });
    const config = { get: (_key: string, fallback?: unknown) => fallback } as ConfigService;
    alerts = new PriceAlertService(prisma as never, { dispatch } as never, config);

    user = await prisma.user.create({ data: { email: `${run}@example.test`, username: run.slice(0, 32), passwordHash: 'x' } });
    const category = await prisma.category.create({ data: { slug: `${run}-cat`, name: run, level: 1, searchTerms: [] } });
    product = await prisma.canonicalProduct.create({
      data: { categoryId: category.id, slug: `${run}-z77`, title: 'Zentrofon Z77', normalizedTitle: 'zentrofon z77' },
    });
    stores = await Promise.all(
      ['a', 'b', 'c', 'd'].map((suffix) =>
        prisma.platform.create({ data: { slug: `${run}-${suffix}`, name: suffix, baseUrl: 'https://example.test', connectorType: 'HTTP_API' } }),
      ),
    );
  });

  beforeEach(async () => {
    dispatch.mockClear();
    await prisma.priceAlert.deleteMany({ where: { userId: user.id } });
    await prisma.priceHistory.deleteMany({ where: { canonicalProductId: product.id } });
    await prisma.sourceListing.deleteMany({ where: { canonicalProductId: product.id } });
  });

  afterAll(async () => {
    await prisma.priceAlert.deleteMany({ where: { userId: user.id } });
    await prisma.priceHistory.deleteMany({ where: { canonicalProductId: product.id } });
    await prisma.sourceListing.deleteMany({ where: { canonicalProductId: product.id } });
    await prisma.platform.deleteMany({ where: { id: { in: stores.map((store) => store.id) } } });
    await prisma.canonicalProduct.delete({ where: { id: product.id } });
    await prisma.category.delete({ where: { id: product.categoryId } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  });

  it('ignores sold-out, stale and rejected prices when deciding the market price', async () => {
    await listing(stores[0], 'live', 20000);
    await listing(stores[1], 'soldout', 15000, { inStock: false });
    await listing(stores[2], 'stale', 15500, { lastSeenAt: new Date(Date.now() - 30 * DAY) });
    await listing(stores[3], 'rejected', 15800, { matchStatus: 'REJECTED' });
    const target = await alert(AlertType.PRICE_TARGET, 16000);

    await alerts.evaluateActiveAlerts();

    expect(dispatch).not.toHaveBeenCalled();
    expect((await prisma.priceAlert.findUniqueOrThrow({ where: { id: target.id } })).status).toBe(AlertStatus.ACTIVE);
  });

  it('fires exactly once when two sweeps overlap', async () => {
    await listing(stores[0], 'live', 15000);
    const target = await alert(AlertType.PRICE_TARGET, 16000);

    const results = await Promise.all([alerts.evaluateActiveAlerts(), alerts.evaluateActiveAlerts(), alerts.evaluateActiveAlerts()]);

    expect(results.reduce((sum, result) => sum + result.triggered, 0)).toBe(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const stored = await prisma.priceAlert.findUniqueOrThrow({ where: { id: target.id } });
    expect(stored.status).toBe(AlertStatus.TRIGGERED);
    expect(Number(stored.triggeredPrice)).toBe(15000);

    // And a later sweep does not fire it again.
    await alerts.evaluateActiveAlerts();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('measures a drop from the best price when the alert was created, not from a dearer store', async () => {
    const created = new Date(Date.now() - 2 * DAY);
    const cheap = await listing(stores[0], 'cheap', 19800);
    const dear = await listing(stores[1], 'dear', 24000);
    await point(cheap.id, 20000, new Date(created.getTime() - DAY));
    await point(dear.id, 25000, new Date(created.getTime() - DAY));
    // After the alert: the dear store moves first (to 24,000), then the cheap one dips to 19,800.
    await point(dear.id, 24000, new Date(created.getTime() + 60_000));
    await point(cheap.id, 19800, new Date(created.getTime() + 120_000));
    await alert(AlertType.PRICE_DROP_ABSOLUTE, 1000, created);

    await alerts.evaluateActiveAlerts();

    // Best was 20,000 at creation and is 19,800 now: a 200 drop, not 4,200.
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('fires a real drop measured the same way', async () => {
    const created = new Date(Date.now() - 2 * DAY);
    const cheap = await listing(stores[0], 'cheap', 18500);
    await point(cheap.id, 20000, new Date(created.getTime() - DAY));
    await point(cheap.id, 18500, new Date(created.getTime() + 60_000));
    await alert(AlertType.PRICE_DROP_ABSOLUTE, 1000, created);

    await alerts.evaluateActiveAlerts();

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0].title).toContain('dropped by 1,500');
  });

  it('LOWEST_EVER compares with the whole history, not the last 90 days', async () => {
    const live = await listing(stores[0], 'live', 17000);
    await point(live.id, 15000, new Date(Date.now() - 200 * DAY));
    await point(live.id, 17000, new Date(Date.now() - 20 * DAY));
    await alert(AlertType.LOWEST_EVER, 0);

    await alerts.evaluateActiveAlerts();

    // 17,000 is the lowest of the last 90 days, but 15,000 was recorded before.
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('RESTOCK sees a product come back after selling out everywhere', async () => {
    const only = await listing(stores[0], 'only', 17000, { inStock: false });
    const restock = await alert(AlertType.RESTOCK, 0);

    await alerts.evaluateActiveAlerts();
    expect((await prisma.priceAlert.findUniqueOrThrow({ where: { id: restock.id } })).lastSeenInStock).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();

    await prisma.sourceListing.update({ where: { id: only.id }, data: { inStock: true } });
    await alerts.evaluateActiveAlerts();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
