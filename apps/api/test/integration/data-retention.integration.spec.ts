import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { DataRetentionService } from '../../src/analytics/data-retention.service';

/**
 * The retention job's SQL against a real PostgreSQL: old rows go, recent
 * rows and live sessions stay. Requires DATABASE_URL at a migrated _test
 * database (test-database-guard.ts).
 */
describe('DataRetentionService (integration)', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = new Date();
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const suffix = randomUUID().slice(0, 8);

  let prisma: PrismaClient;
  let service: DataRetentionService;
  let userId: string;

  const view = (id: string, createdAt: Date) => ({
    id,
    visitorId: randomUUID(),
    sessionId: randomUUID(),
    path: '/retention-test',
    route: 'other',
    locale: 'en',
    device: 'desktop',
    createdAt,
  });

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    const config = { get: (_key: string, fallback?: unknown) => fallback } as ConfigService;
    service = new DataRetentionService(prisma as never, config);
    const user = await prisma.user.create({
      data: { email: `retention_${suffix}@example.com`, username: `ret${suffix}`, passwordHash: 'x' },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.pageView.deleteMany({ where: { path: '/retention-test' } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('deletes page views past 395 days and keeps recent ones', async () => {
    const oldId = randomUUID();
    const newId = randomUUID();
    await prisma.pageView.createMany({ data: [view(oldId, ago(400)), view(newId, ago(10))] });

    await service.run(now);

    const left = await prisma.pageView.findMany({ where: { id: { in: [oldId, newId] } }, select: { id: true } });
    expect(left.map((v) => v.id)).toEqual([newId]);
  });

  it('deletes sessions that ended over 90 days ago and keeps live or recent ones', async () => {
    const make = (expiresAt: Date, revokedAt: Date | null = null) =>
      prisma.session.create({ data: { userId, refreshToken: randomUUID(), expiresAt, revokedAt } });
    const expiredLongAgo = await make(ago(100));
    const revokedLongAgo = await make(new Date(now.getTime() + DAY), ago(95));
    const expiredRecently = await make(ago(5));
    const live = await make(new Date(now.getTime() + 7 * DAY));

    await service.run(now);

    const left = await prisma.session.findMany({ where: { userId }, select: { id: true } });
    expect(left.map((s) => s.id).sort()).toEqual([expiredRecently.id, live.id].sort());
    expect(left.map((s) => s.id)).not.toContain(expiredLongAgo.id);
    expect(left.map((s) => s.id)).not.toContain(revokedLongAgo.id);
  });

  it('deletes old store clicks, but keeps and anonymises those that earned a commission', async () => {
    const platform = await prisma.platform.create({
      data: { slug: `ret-${suffix}`, name: `ret-${suffix}`, baseUrl: 'https://example.test', connectorType: 'HTTP_API' },
    });
    const listing = await prisma.sourceListing.create({
      data: {
        platformId: platform.id,
        externalId: `ret-${suffix}`,
        externalUrl: 'https://example.test/ret',
        rawTitle: 'Retention test listing',
        rawCurrency: 'EGP',
        priceUsd: '1.00',
        inStock: true,
        lastSeenAt: now,
      },
    });
    const click = (clickedAt: Date) =>
      prisma.affiliateClick.create({
        data: {
          sourceListingId: listing.id,
          platformId: platform.id,
          userId,
          ipHash: 'hash',
          userAgent: 'test-agent',
          affiliateUrl: 'https://example.test/ret?tag=x',
          clickedAt,
        },
      });
    try {
      const oldPlain = await click(ago(400));
      const oldPaid = await click(ago(400));
      const recent = await click(ago(10));
      await prisma.affiliateConversion.create({
        data: { clickId: oldPaid.id, networkKey: 'test', externalActionId: `ret-${suffix}`, occurredAt: ago(399) },
      });

      await service.run(now);

      const left = await prisma.affiliateClick.findMany({ where: { platformId: platform.id } });
      const byId = new Map(left.map((c) => [c.id, c]));
      expect(byId.has(oldPlain.id)).toBe(false);
      expect(byId.get(oldPaid.id)).toMatchObject({ userId: null, userAgent: null, ipHash: '' });
      expect(byId.get(recent.id)).toMatchObject({ userId, userAgent: 'test-agent', ipHash: 'hash' });
      expect(await prisma.affiliateConversion.count({ where: { clickId: oldPaid.id } })).toBe(1);
    } finally {
      // Clicks and conversions cascade from the listing.
      await prisma.sourceListing.delete({ where: { id: listing.id } });
      await prisma.platform.delete({ where: { id: platform.id } });
    }
  });
});
