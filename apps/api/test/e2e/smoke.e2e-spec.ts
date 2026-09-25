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

  it('auth: register, login, me, logout, and the refresh token dies', async () => {
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

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(204);

    await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);
  });
});
