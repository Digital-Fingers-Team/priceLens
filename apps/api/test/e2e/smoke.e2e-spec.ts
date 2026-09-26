import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { PrismaService } from '../../src/database/prisma.service';
import { LiveIngestionService } from '../../src/scraping/live-ingestion.service';
import { NoonConnector } from '../../src/scraping/connectors/noon.connector';
import { JumiaConnector } from '../../src/scraping/connectors/jumia.connector';
import type { RetailerConnector } from '../../src/scraping/interfaces/retailer-connector.interface';
import type { RetailerListing } from '../../src/scraping/interfaces/retailer-listing.interface';
import { upsertCategories } from '../../seed/generators/generateProducts';
import { generateStores } from '../../seed/generators/generateStores';

/**
 * Smoke tests: the few paths that must work for the product to exist at all.
 * The full AppModule boots against the local *_test database with the same
 * request pipeline as production (configureApp). Store connectors are the
 * only fakes -- they return fixed listings instead of scraping -- so the
 * matching pipeline, persistence, search and product endpoints run for real.
 */

const QUERY = 'iphone 15 128gb';
// The site origin as production sets it; FRONTEND_URL in .env.test leaves it out (S-02).
const SITE_ORIGIN = 'https://site.pricelens.test';

function listing(externalId: string, title: string, price: number): RetailerListing {
  return {
    externalId,
    externalUrl: `https://example.test/${externalId}`,
    title,
    priceUsd: price,
    currency: 'EGP',
    brand: 'Apple',
    model: null,
    imageUrl: null,
    inStock: true,
    rating: null,
    reviewCount: null,
    identifiers: { gtin: null, upc: null, ean: null, mpn: null },
    raw: {},
  };
}

function fakeConnector(slug: string, listings: RetailerListing[]): RetailerConnector {
  return { slug, isEnabled: true, searchListings: async () => listings };
}

const NOON_LISTINGS = [
  listing('smoke-noon-phone', 'Apple iPhone 15 128GB Black', 42999),
  listing('smoke-noon-case', 'Silicone Case for Apple iPhone 15 128GB - Black', 499),
];
const JUMIA_LISTINGS = [listing('smoke-jumia-phone', 'Apple iPhone 15 (128 GB) - Black', 41499)];

describe('Smoke (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NoonConnector)
      .useValue(fakeConnector('noon', NOON_LISTINGS))
      .overrideProvider(JumiaConnector)
      .useValue(fakeConnector('jumia', JUMIA_LISTINGS))
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true });
    process.env.NEXT_PUBLIC_SITE_URL = SITE_ORIGIN;
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    // Start from an empty catalog so every assertion is about this run.
    await prisma.$executeRawUnsafe(
      'TRUNCATE canonical_products, source_listings, price_history, match_decisions, review_queue CASCADE',
    );
    await upsertCategories(prisma as unknown as PrismaClient);
    await generateStores(prisma as unknown as PrismaClient);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health reports ok', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ success: true, data: { status: 'ok' } });
  });

  it('GET /health/ready checks Postgres and both Redis connections (B-05)', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(res.body.data.status).toBe('ok');
    for (const name of ['database', 'cache', 'queue']) {
      expect(res.body.data.checks[name]).toEqual({ status: 'ok', latencyMs: expect.any(Number) });
    }
  });

  it('GET /health/ready answers 503 with the failing dependency when one is down', async () => {
    const prismaForCheck = app.get(PrismaService);
    const spy = jest.spyOn(prismaForCheck, '$queryRaw').mockRejectedValueOnce(new Error('connection refused'));
    try {
      const res = await request(app.getHttpServer()).get('/health/ready').expect(503);
      expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(res.body.error.details.checks.database).toMatchObject({ status: 'down', error: 'connection refused' });
      expect(res.body.error.details.checks.cache.status).toBe('ok');
    } finally {
      spy.mockRestore();
    }
  });

  describe('request ids (B-06)', () => {
    it('echoes a valid client id in the header and in the error body', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products/not-a-uuid/listings')
        .set('X-Request-ID', 'client-abc.123')
        .expect(400);
      expect(res.headers['x-request-id']).toBe('client-abc.123');
      expect(res.body.error.requestId).toBe('client-abc.123');
    });

    it('replaces an unsafe client id, and uses the same id in header and body', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('X-Request-ID', 'id with spaces] GET /admin 200')
        .expect(401);
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    });

    it('sets an id on successful responses too', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('matching pipeline run', () => {
    beforeAll(async () => {
      const report = await app
        .get(LiveIngestionService)
        .runQueryIngestion(QUERY, { platformSlugs: ['noon', 'jumia'], limitPerQuery: 5 });
      expect(report.skippedPlatforms).toEqual([]);
    });

    it('merges the same phone from two stores into one canonical product', async () => {
      const phones = await prisma.sourceListing.findMany({
        where: { externalId: { in: ['smoke-noon-phone', 'smoke-jumia-phone'] } },
      });
      expect(phones).toHaveLength(2);
      expect(phones[0].canonicalProductId).toBeTruthy();
      expect(phones[1].canonicalProductId).toBe(phones[0].canonicalProductId);
    });

    it('keeps an accessory that names the phone off the phone product', async () => {
      const phone = await prisma.sourceListing.findFirstOrThrow({ where: { externalId: 'smoke-noon-phone' } });
      const accessory = await prisma.sourceListing.findFirst({ where: { externalId: 'smoke-noon-case' } });
      // Rejected outright or stored under its own product -- never on the phone.
      expect(accessory?.canonicalProductId ?? null).not.toBe(phone.canonicalProductId);
    });
  });

  it('errors use one envelope: unknown route, validation, rejected CORS origin', async () => {
    const http = request(app.getHttpServer());
    const missing = await http.get('/api/v1/no-such-route').expect(404);
    expect(missing.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND', path: '/api/v1/no-such-route' } });

    const invalid = await request(app.getHttpServer()).post('/api/v1/auth/register').send({ email: 'not-an-email' }).expect(400);
    expect(invalid.body.error.code).toBe('BAD_REQUEST');
    expect(invalid.body.error.details).toEqual(expect.arrayContaining(['email must be an email']));

    const cors = await request(app.getHttpServer())
      .get('/api/v1/billing/plans')
      .set('Origin', 'https://evil.example')
      .expect(403);
    expect(cors.body).toMatchObject({ success: false, error: { code: 'CORS_ORIGIN_NOT_ALLOWED' } });

    // Browsers send Origin on same-origin POSTs; the site's own login must reach the handler.
    const ownSite = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', SITE_ORIGIN)
      .send({ email: 'nobody@example.com', password: 'wrong-password' })
      .expect(401);
    expect(ownSite.headers['access-control-allow-origin']).toBe(SITE_ORIGIN);
  });

  it('search returns the ingested product', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/search').query({ q: 'iphone 15' }).expect(200);
    const titles: string[] = res.body.data.hits.map((hit: { title: string }) => hit.title);
    expect(titles.some((title) => /iphone 15/i.test(title) && !/case/i.test(title))).toBe(true);
  });

  it('product page data loads with offers from both stores', async () => {
    const phone = await prisma.sourceListing.findFirstOrThrow({
      where: { externalId: 'smoke-noon-phone' },
      include: { canonicalProduct: true },
    });
    const { id, slug } = phone.canonicalProduct!;

    const res = await request(app.getHttpServer()).get(`/api/v1/products/${slug}`).expect(200);
    expect(res.body.data.slug).toBe(slug);

    const listings = await request(app.getHttpServer()).get(`/api/v1/products/${id}/listings`).expect(200);
    const rows: Array<Record<string, unknown>> = listings.body.data.items;
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows)).toContain('smoke-noon-phone');
    expect(JSON.stringify(rows)).toContain('smoke-jumia-phone');
  });

  it('auth: register, login, me, billing, logout, and the refresh token dies', async () => {
    const http = request(app.getHttpServer());
    const suffix = Date.now().toString(36);
    const credentials = { email: `smoke_${suffix}@example.com`, password: 'SmokePass123' };

    await http
      .post('/api/v1/auth/register')
      .send({ ...credentials, username: `smoke${suffix}`, displayName: 'Smoke' })
      .expect(201);

    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send(credentials).expect(200);
    const { accessToken, refreshToken } = login.body.data;

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const billing = await request(app.getHttpServer())
      .get('/api/v1/billing/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(billing.body.data.planKey).toBe('free');
    expect(billing.body.data.usage).toEqual({ trackedProducts: 0, activeAlerts: 0 });

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(204);

    await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);
  });
});
