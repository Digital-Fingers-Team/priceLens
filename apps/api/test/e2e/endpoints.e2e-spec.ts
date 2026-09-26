// Before AppModule loads: this suite sends a few hundred requests from one
// address, far past the production per-minute limits it would otherwise hit.
process.env.THROTTLE_LIMIT = '100000';
process.env.THROTTLE_LIMIT_AUTH = '100000';

import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { getQueueToken } from '@nestjs/bull';
import type { PrismaClient } from '@prisma/client';
import type { Queue } from 'bull';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { PrismaService } from '../../src/database/prisma.service';
import { LiveIngestionService } from '../../src/scraping/live-ingestion.service';
import { NoonConnector } from '../../src/scraping/connectors/noon.connector';
import { JumiaConnector } from '../../src/scraping/connectors/jumia.connector';
import { IngestionQueue } from '../../src/workers/ingestion-queue.service';
import { AFFILIATE_CONVERSION_QUEUE } from '../../src/affiliate/affiliate.constants';
import type { RetailerConnector } from '../../src/scraping/interfaces/retailer-connector.interface';
import type { RetailerListing } from '../../src/scraping/interfaces/retailer-listing.interface';
import { upsertCategories } from '../../seed/generators/generateProducts';
import { generateStores } from '../../seed/generators/generateStores';

/**
 * Every route, called at least once (B-12): the happy path, plus an
 * authorization or validation failure where the route has one. The last test
 * compares the routes called here with every route Express has registered,
 * so a new endpoint without a test fails the suite.
 *
 * Every JSON response is also checked for fields that must never leave the
 * server (FORBIDDEN_KEYS); refresh tokens only in the auth responses that
 * issue them.
 *
 * Queue calls are stubbed: a job left in Redis would otherwise run inside the
 * next e2e file's app, against its data.
 */

const FORBIDDEN_KEYS = ['passwordHash', 'keyHash', 'verifyToken', 'ipHash'];
const ISSUES_REFRESH_TOKEN = ['POST /api/v1/auth/register', 'POST /api/v1/auth/login', 'POST /api/v1/auth/refresh'];
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

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

/** Paths of keys anywhere in `value` that must not be in a response. */
function leaks(value: unknown, allowRefreshToken: boolean, at = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => leaks(item, allowRefreshToken, `${at}[${i}]`));
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const here = `${at}.${key}`;
    const bad = FORBIDDEN_KEYS.includes(key) || (key === 'refreshToken' && !allowRefreshToken);
    return [...(bad ? [here] : []), ...leaks(child, allowRefreshToken, here)];
  });
}

interface CallOptions {
  token?: string;
  params?: Record<string, string>;
  query?: Record<string, string | number | boolean>;
  body?: object;
  headers?: Record<string, string>;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

describe('Every endpoint (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const covered = new Set<string>();
  let problems: string[] = [];

  /**
   * Calls `METHOD template` and records it as covered. A wrong status or a
   * leaked field is collected rather than thrown, so one run lists them all;
   * each test ends with expectNoProblems().
   */
  async function call(method: Method, template: string, status: number, options: CallOptions = {}) {
    const route = `${method} ${template}`;
    covered.add(route);
    const path = template.replace(/\{(\w+)\}/g, (_, name: string) => {
      const value = options.params?.[name];
      if (value === undefined) throw new Error(`${route}: no value for {${name}}`);
      return encodeURIComponent(value);
    });

    let req = request(app.getHttpServer())[method.toLowerCase() as 'get'](path);
    if (options.token) req = req.set('Authorization', `Bearer ${options.token}`);
    for (const [name, value] of Object.entries(options.headers ?? {})) req = req.set(name, value);
    if (options.query) req = req.query(options.query);
    if (options.body) req = req.send(options.body);
    const res = await req;

    if (res.status !== status) {
      problems.push(`${route} -> ${res.status} (expected ${status}): ${JSON.stringify(res.body).slice(0, 300)}`);
    }
    for (const path of leaks(res.body, ISSUES_REFRESH_TOKEN.includes(route))) {
      problems.push(`${route} leaks ${path}`);
    }
    return res;
  }

  function expectNoProblems() {
    const found = problems;
    problems = [];
    expect(found).toEqual([]);
  }

  // Shared state, filled in as the tests run in order.
  let productId: string;
  let productSlug: string;
  let listingId: string;
  let platformId: string;
  let admin: { id: string; token: string };
  let pro: { id: string; email: string; token: string; refreshToken: string };
  let brand: { id: string; token: string };
  let brandOrgId: string;
  let free: { id: string; email: string; password: string; token: string };

  async function registerUser(name: string) {
    const suffix = `${name}${Date.now().toString(36)}`;
    const credentials = { email: `${suffix}@example.com`, password: 'EndpointPass123' };
    const res = await call('POST', '/api/v1/auth/register', 201, {
      body: { ...credentials, username: suffix, displayName: name },
    });
    return { id: res.body.data.user.id as string, ...credentials };
  }

  async function login(email: string, password: string) {
    const res = await call('POST', '/api/v1/auth/login', 200, { body: { email, password } });
    return { token: res.body.data.accessToken as string, refreshToken: res.body.data.refreshToken as string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NoonConnector)
      .useValue(
        fakeConnector('noon', [
          listing('endpoints-noon-phone', 'Apple iPhone 15 128GB Black', 42999),
          listing('endpoints-noon-phone-2', 'Apple iPhone 15 256GB Blue', 49999),
        ]),
      )
      .overrideProvider(JumiaConnector)
      .useValue(fakeConnector('jumia', [listing('endpoints-jumia-phone', 'Apple iPhone 15 (128 GB) - Black', 41499)]))
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true });
    configureApp(app);
    await app.init();

    const queue = app.get(IngestionQueue);
    for (const name of Object.getOwnPropertyNames(IngestionQueue.prototype)) {
      if (name.startsWith('enqueue')) {
        jest.spyOn(queue as unknown as Record<string, () => Promise<string>>, name as never).mockResolvedValue('stub-job' as never);
      }
    }
    const conversions = app.get<Queue>(getQueueToken(AFFILIATE_CONVERSION_QUEUE));
    jest.spyOn(conversions, 'add').mockResolvedValue({ id: 'stub-job' } as never);

    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe(
      'TRUNCATE canonical_products, source_listings, price_history, match_decisions, review_queue CASCADE',
    );
    await upsertCategories(prisma as unknown as PrismaClient);
    await generateStores(prisma as unknown as PrismaClient);
    await app.get(LiveIngestionService).runQueryIngestion('iphone 15', { platformSlugs: ['noon', 'jumia'], limitPerQuery: 5 });

    const phone = await prisma.sourceListing.findFirstOrThrow({
      where: { externalId: 'endpoints-noon-phone' },
      include: { canonicalProduct: true },
    });
    productId = phone.canonicalProductId!;
    productSlug = phone.canonicalProduct!.slug;
    listingId = phone.id;
    platformId = phone.platformId;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('the leak check finds nested forbidden fields', () => {
    expect(leaks({ data: [{ user: { passwordHash: 'x' } }], refreshToken: 'y' }, false)).toEqual([
      '$.data[0].user.passwordHash',
      '$.refreshToken',
    ]);
    expect(leaks({ refreshToken: 'y' }, true)).toEqual([]);
  });

  it('health and the service banner', async () => {
    await call('GET', '/', 200);
    await call('GET', '/health', 200);
    await call('GET', '/health/ready', 200);
    expectNoProblems();
  });

  it('auth', async () => {
    const adminUser = await registerUser('admin');
    await prisma.user.update({ where: { id: adminUser.id }, data: { role: 'ADMIN' } });
    admin = { id: adminUser.id, ...(await login(adminUser.email, adminUser.password)) };

    const brandUser = await registerUser('brand');
    brand = { id: brandUser.id, token: (await login(brandUser.email, brandUser.password)).token };
    const proUser = await registerUser('pro');
    pro = { ...proUser, ...(await login(proUser.email, proUser.password)) };
    const freeUser = await registerUser('free');
    free = { ...freeUser, ...(await login(freeUser.email, freeUser.password)) };

    await call('POST', '/api/v1/auth/register', 400, { body: { email: 'not-an-email' } });
    await call('POST', '/api/v1/auth/login', 401, { body: { email: pro.email, password: 'WrongPass123' } });

    await call('GET', '/api/v1/auth/me', 200, { token: pro.token });
    await call('GET', '/api/v1/auth/me', 401);

    const refreshed = await call('POST', '/api/v1/auth/refresh', 200, { body: { refreshToken: pro.refreshToken } });
    pro.token = refreshed.body.data.accessToken;
    pro.refreshToken = refreshed.body.data.refreshToken;
    await call('POST', '/api/v1/auth/refresh', 400, { body: {} });

    // A throwaway session to log out of, and one more for "log out everywhere".
    const spare = await login(free.email, free.password);
    await call('POST', '/api/v1/auth/logout', 204, { token: spare.token, body: { refreshToken: spare.refreshToken } });
    await call('POST', '/api/v1/auth/logout', 401, { body: { refreshToken: spare.refreshToken } });
    const other = await login(free.email, free.password);
    await call('DELETE', '/api/v1/auth/sessions', 204, { token: other.token });
    await call('DELETE', '/api/v1/auth/sessions', 401);
    free.token = (await login(free.email, free.password)).token;
    expectNoProblems();
  });

  it('billing: plans, grants, checkout without Stripe', async () => {
    await call('GET', '/api/v1/billing/plans', 200);
    await call('GET', '/api/v1/billing/me', 200, { token: free.token });
    await call('GET', '/api/v1/billing/me', 401);

    await call('POST', '/api/v1/billing/admin/grant', 201, {
      token: admin.token,
      body: { userId: pro.id, planKey: 'enterprise_monthly', days: 30 },
    });
    await call('POST', '/api/v1/billing/admin/grant', 201, {
      token: admin.token,
      body: { userId: brand.id, planKey: 'enterprise_monthly', days: 30 },
    });
    await call('POST', '/api/v1/billing/admin/grant', 403, {
      token: free.token,
      body: { userId: free.id, planKey: 'enterprise_monthly' },
    });
    await call('GET', '/api/v1/billing/admin/plans', 200, { token: admin.token });
    await call('GET', '/api/v1/billing/admin/plans', 403, { token: free.token });

    await call('POST', '/api/v1/billing/checkout', 403, { token: free.token, body: { planKey: 'plus_monthly' } });
    await call('POST', '/api/v1/billing/checkout', 400, { token: free.token, body: {} });
    await call('POST', '/api/v1/billing/portal', 403, { token: free.token });
    await call('POST', '/api/v1/billing/cancel', 201, { token: pro.token, body: { immediately: false } });
    // Stripe signs its webhook; an unsigned call is refused.
    await call('POST', '/api/v1/billing/webhook/stripe', 400, { body: { type: 'checkout.session.completed' } });
    expectNoProblems();
  });

  it('catalog: products, search, prices', async () => {
    await call('GET', '/api/v1/products/{slug}', 200, { params: { slug: productSlug } });
    await call('GET', '/api/v1/products/{slug}', 404, { params: { slug: 'no-such-product' } });
    await call('GET', '/api/v1/products/{id}/listings', 200, { params: { id: productId } });
    await call('GET', '/api/v1/products/{id}/listings', 400, { params: { id: 'not-a-uuid' } });

    await call('GET', '/api/v1/search', 200, { query: { q: 'iphone' } });
    await call('GET', '/api/v1/search', 400, { query: { limit: 1000 } });
    await call('GET', '/api/v1/search/suggest', 200, { query: { q: 'iph' } });
    await call('GET', '/api/v1/search/suggest', 400, { query: { q: 'iph', limit: 0 } });

    await call('GET', '/api/v1/prices/{productId}/history', 200, { params: { productId }, query: { days: 30 } });
    await call('GET', '/api/v1/prices/{productId}/history', 400, { params: { productId: 'not-a-uuid' } });
    await call('GET', '/api/v1/prices/{productId}/current', 200, { params: { productId } });
    await call('GET', '/api/v1/prices/{productId}/stats', 200, { params: { productId } });
    expectNoProblems();
  });

  it('watchlist and alerts', async () => {
    const auth = { token: free.token };
    await call('POST', '/api/v1/watchlist', 201, { ...auth, body: { productId } });
    await call('POST', '/api/v1/watchlist', 400, { ...auth, body: { productId: 'nope' } });
    await call('GET', '/api/v1/watchlist', 200, auth);
    await call('GET', '/api/v1/watchlist', 401);

    const alert = await call('POST', '/api/v1/watchlist/{productId}/alerts', 201, {
      ...auth,
      params: { productId },
      body: { alertType: 'PRICE_TARGET', thresholdValue: 30000 },
    });
    // Restock alerts are a paid alert type.
    await call('POST', '/api/v1/watchlist/{productId}/alerts', 403, {
      ...auth,
      params: { productId },
      body: { alertType: 'RESTOCK', thresholdValue: 0 },
    });
    await call('GET', '/api/v1/watchlist/alerts', 200, auth);
    const alertId = alert.body.data?.id ?? MISSING_ID;
    await call('POST', '/api/v1/watchlist/alerts/{alertId}/reactivate', 201, { ...auth, params: { alertId } });
    await call('DELETE', '/api/v1/watchlist/alerts/{alertId}', 200, { ...auth, params: { alertId } });
    await call('DELETE', '/api/v1/watchlist/alerts/{alertId}', 404, { ...auth, params: { alertId } });
    await call('DELETE', '/api/v1/watchlist/{productId}', 200, { ...auth, params: { productId } });
    expectNoProblems();
  });

  it('intelligence and deal hunter', async () => {
    const params = { productId };
    await call('GET', '/api/v1/intelligence/products/{productId}', 200, { token: free.token, params });
    await call('GET', '/api/v1/intelligence/products/{productId}/verdict', 200, { token: pro.token, params });
    await call('GET', '/api/v1/intelligence/products/{productId}/verdict', 403, { token: free.token, params });
    await call('GET', '/api/v1/intelligence/products/{productId}/discount-check', 200, { token: pro.token, params });
    await call('GET', '/api/v1/intelligence/products/{productId}/discount-check', 403, { token: free.token, params });

    await call('GET', '/api/v1/deal-hunter', 200, { token: pro.token, query: { q: 'iphone under 45000' } });
    await call('GET', '/api/v1/deal-hunter', 403, { token: free.token, query: { q: 'iphone under 45000' } });
    await call('GET', '/api/v1/deal-hunter/interpret', 200, { query: { q: 'iphone under 45000' } });
    expectNoProblems();
  });

  it('notifications and channels', async () => {
    const auth = { token: free.token };
    await call('GET', '/api/v1/notifications', 200, auth);
    await call('GET', '/api/v1/notifications', 401);
    await call('GET', '/api/v1/notifications/unread-count', 200, auth);
    await call('POST', '/api/v1/notifications/{id}/read', 201, { ...auth, params: { id: MISSING_ID } });
    await call('POST', '/api/v1/notifications/read-all', 201, auth);

    await call('GET', '/api/v1/notifications/channels', 200, auth);
    await call('POST', '/api/v1/notifications/channels', 201, {
      ...auth,
      body: { type: 'EMAIL', destination: 'alerts@example.com' },
    });
    await call('POST', '/api/v1/notifications/channels', 400, { ...auth, body: { type: 'PIGEON', destination: 'x' } });
    await call('POST', '/api/v1/notifications/channels/verify', 400, { ...auth, body: { type: 'EMAIL', code: '000000' } });
    await call('POST', '/api/v1/notifications/channels/active', 201, { ...auth, body: { type: 'EMAIL', isActive: false } });
    await call('DELETE', '/api/v1/notifications/channels/{type}', 200, { ...auth, params: { type: 'EMAIL' } });
    expectNoProblems();
  });

  it('seller workspace', async () => {
    const auth = { token: pro.token };
    await call('POST', '/api/v1/seller/workspaces', 400, { ...auth, body: { name: 'x' } });
    const org = await call('POST', '/api/v1/seller/workspaces', 201, { ...auth, body: { name: 'Endpoint Seller', type: 'SELLER' } });
    const orgId = org.body.data.id;
    const params = { orgId };
    await call('GET', '/api/v1/seller/workspaces', 200, auth);
    await call('GET', '/api/v1/seller/workspaces/{orgId}/summary', 200, { ...auth, params });
    await call('GET', '/api/v1/seller/workspaces/{orgId}/summary', 403, { token: free.token, params });

    const member = await call('POST', '/api/v1/seller/workspaces/{orgId}/members', 201, {
      ...auth,
      params,
      body: { email: free.email, role: 'MEMBER' },
    });
    await call('GET', '/api/v1/seller/workspaces/{orgId}/members', 200, { ...auth, params });
    await call('DELETE', '/api/v1/seller/workspaces/{orgId}/members/{memberId}', 200, {
      ...auth,
      params: { orgId, memberId: member.body.data?.id ?? MISSING_ID },
    });

    const product = await call('PUT', '/api/v1/seller/workspaces/{orgId}/products', 200, {
      ...auth,
      params,
      body: { sku: 'EP-IPHONE-15', name: 'Apple iPhone 15 128GB', currentPrice: 42000, canonicalProductId: productId },
    });
    await call('PUT', '/api/v1/seller/workspaces/{orgId}/products', 400, { ...auth, params, body: { name: 'no sku' } });
    const sellerProduct = { orgId, productId: product.body.data?.id ?? MISSING_ID };
    await call('GET', '/api/v1/seller/workspaces/{orgId}/products', 200, { ...auth, params });
    await call('GET', '/api/v1/seller/workspaces/{orgId}/products/{productId}', 200, { ...auth, params: sellerProduct });
    await call('GET', '/api/v1/seller/workspaces/{orgId}/products/{productId}/match-suggestions', 200, {
      ...auth,
      params: sellerProduct,
    });

    await call('GET', '/api/v1/seller/workspaces/{orgId}/events', 200, { ...auth, params });
    await call('POST', '/api/v1/seller/workspaces/{orgId}/events/{eventId}/acknowledge', 404, {
      ...auth,
      params: { orgId, eventId: MISSING_ID },
    });
    await call('POST', '/api/v1/seller/workspaces/{orgId}/events/acknowledge-all', 201, { ...auth, params });

    const rule = await call('PUT', '/api/v1/seller/workspaces/{orgId}/alert-rules', 200, {
      ...auth,
      params,
      body: { type: 'UNDERCUT' },
    });
    await call('GET', '/api/v1/seller/workspaces/{orgId}/alert-rules', 200, { ...auth, params });
    await call('DELETE', '/api/v1/seller/workspaces/{orgId}/alert-rules/{ruleId}', 200, {
      ...auth,
      params: { orgId, ruleId: rule.body.data?.id ?? MISSING_ID },
    });
    await call('DELETE', '/api/v1/seller/workspaces/{orgId}/products/{productId}', 200, { ...auth, params: sellerProduct });
    // Someone else's workspace: indistinguishable from one that doesn't exist.
    await call('GET', '/api/v1/seller/workspaces/{orgId}/members', 404, { token: free.token, params });
    expectNoProblems();
  });

  it('brand workspace', async () => {
    // A second enterprise user: an owner has only one workspace.
    const auth = { token: brand.token };
    const org = await call('POST', '/api/v1/seller/workspaces', 201, { ...auth, body: { name: 'Endpoint Brand', type: 'BRAND' } });
    const orgId = org.body.data.id;
    brandOrgId = orgId;
    const params = { orgId };

    await call('GET', '/api/v1/brand/workspaces/{orgId}/map/violations', 200, { ...auth, params });
    await call('GET', '/api/v1/brand/workspaces/{orgId}/map/violations', 403, { token: free.token, params });
    await call('GET', '/api/v1/brand/workspaces/{orgId}/distribution/summary', 200, { ...auth, params });
    await call('GET', '/api/v1/brand/workspaces/{orgId}/distribution', 200, { ...auth, params });
    await call('GET', '/api/v1/brand/workspaces/{orgId}/distribution/retailers', 200, { ...auth, params });
    await call('GET', '/api/v1/brand/workspaces/{orgId}/distribution/lapsed', 200, { ...auth, params });

    const watch = await call('PUT', '/api/v1/brand/workspaces/{orgId}/watches', 200, { ...auth, params, body: { brand: 'Apple' } });
    await call('PUT', '/api/v1/brand/workspaces/{orgId}/watches', 400, { ...auth, params, body: {} });
    await call('GET', '/api/v1/brand/workspaces/{orgId}/watches', 200, { ...auth, params });
    await call('DELETE', '/api/v1/brand/workspaces/{orgId}/watches/{watchId}', 200, {
      ...auth,
      params: { orgId, watchId: watch.body.data?.id ?? MISSING_ID },
    });
    await call('GET', '/api/v1/brand/workspaces/{orgId}/discoveries', 200, { ...auth, params });

    const report = await call('POST', '/api/v1/brand/workspaces/{orgId}/reports', 201, { ...auth, params, body: { period: 'WEEKLY' } });
    await call('POST', '/api/v1/brand/workspaces/{orgId}/reports', 400, { ...auth, params, body: { period: 'HOURLY' } });
    await call('GET', '/api/v1/brand/workspaces/{orgId}/reports', 200, { ...auth, params });
    await call('GET', '/api/v1/brand/workspaces/{orgId}/reports/{reportId}', 200, {
      ...auth,
      params: { orgId, reportId: report.body.data?.id ?? MISSING_ID },
    });
    expectNoProblems();
  });

  it('API keys and the partner API', async () => {
    const auth = { token: brand.token };
    const params = { orgId: brandOrgId };

    const issued = await call('POST', '/api/v1/workspaces/{orgId}/api-keys', 201, { ...auth, params, body: { name: 'ci' } });
    await call('POST', '/api/v1/workspaces/{orgId}/api-keys', 400, { ...auth, params, body: {} });
    await call('GET', '/api/v1/workspaces/{orgId}/api-keys', 200, { ...auth, params });
    await call('GET', '/api/v1/workspaces/{orgId}/api-keys/usage', 200, { ...auth, params });
    await call('GET', '/api/v1/workspaces/{orgId}/api-keys', 403, { token: free.token, params });

    const key = { headers: { 'X-API-Key': issued.body.data?.key ?? 'missing' } };
    await call('GET', '/api/v1/partner/whoami', 200, key);
    await call('GET', '/api/v1/partner/whoami', 401);
    await call('GET', '/api/v1/partner/market/stats', 200, { ...key, query: { brand: 'Apple' } });
    await call('GET', '/api/v1/partner/products/{sku}/market', 404, { ...key, params: { sku: 'NO-SUCH-SKU' } });
    await call('GET', '/api/v1/partner/events', 200, key);

    await call('DELETE', '/api/v1/workspaces/{orgId}/api-keys/{keyId}', 200, {
      ...auth,
      params: { ...params, keyId: issued.body.data?.id ?? MISSING_ID },
    });
    await call('GET', '/api/v1/partner/whoami', 401, key);
    expectNoProblems();
  });

  it('affiliate', async () => {
    const res = await call('GET', '/api/v1/affiliate/go/{listingId}', 302, { params: { listingId } });
    expect(res.headers.location).toContain('example.test');
    await call('GET', '/api/v1/affiliate/go/{listingId}', 404, { params: { listingId: MISSING_ID } });

    await call('GET', '/api/v1/affiliate/configs', 200, { token: admin.token });
    await call('GET', '/api/v1/affiliate/configs', 403, { token: free.token });
    await call('PUT', '/api/v1/affiliate/configs/{platformId}', 200, {
      token: admin.token,
      params: { platformId },
      body: { providerKey: 'impact', affiliateId: 'endpoint-test', isActive: false },
    });
    await call('PUT', '/api/v1/affiliate/configs/{platformId}', 400, {
      token: admin.token,
      params: { platformId },
      body: { providerKey: 'impact' },
    });

    // No shared secret is configured in tests, so every postback is refused.
    await call('POST', '/api/v1/affiliate/conversions/webhook/{networkKey}', 401, {
      params: { networkKey: 'impact' },
      query: { secret: 'guess' },
      body: {},
    });
    await call('POST', '/api/v1/affiliate/conversions/poll', 201, { token: admin.token });
    await call('POST', '/api/v1/affiliate/conversions/poll', 403, { token: free.token });
    await call('GET', '/api/v1/affiliate/conversions', 200, { token: admin.token });
    await call('GET', '/api/v1/affiliate/conversions/summary', 200, { token: admin.token });
    expectNoProblems();
  });

  it('admin', async () => {
    const auth = { token: admin.token };
    await call('GET', '/api/v1/admin/dashboard', 200, auth);
    await call('GET', '/api/v1/admin/dashboard', 403, { token: free.token });
    await call('GET', '/api/v1/admin/review-queue', 200, auth);
    await call('PATCH', '/api/v1/admin/review-queue/{id}/resolve', 404, {
      ...auth,
      params: { id: MISSING_ID },
      body: { decision: 'REJECT' },
    });
    await call('PATCH', '/api/v1/admin/review-queue/{id}/resolve', 400, {
      ...auth,
      params: { id: MISSING_ID },
      body: { decision: 'MAYBE' },
    });
    await call('GET', '/api/v1/admin/platforms', 200, auth);
    await call('POST', '/api/v1/admin/ingest/live', 201, { ...auth, body: { platformSlugs: ['noon'] } });
    await call('POST', '/api/v1/admin/ingest/live', 400, { ...auth, body: { limitPerQuery: -1 } });
    await call('POST', '/api/v1/admin/reconcile', 201, { ...auth, body: { dryRun: true } });
    await call('POST', '/api/v1/admin/store-coverage-sweep', 201, { ...auth, body: { maxProducts: 5 } });
    await call('POST', '/api/v1/admin/store-coverage-sweep', 403, { token: free.token, body: {} });
    expectNoProblems();
  });

  it('calls every registered route', () => {
    interface Layer {
      route?: { path: string; methods: Record<string, boolean> };
    }
    const stack = (app.getHttpAdapter().getInstance() as { _router: { stack: Layer[] } })._router.stack;
    const registered = stack
      .filter((layer) => layer.route)
      .flatMap((layer) =>
        Object.keys(layer.route!.methods).map(
          (method) => `${method.toUpperCase()} ${layer.route!.path.replace(/:(\w+)/g, '{$1}')}`,
        ),
      );
    expect(registered.filter((route) => !covered.has(route)).sort()).toEqual([]);
    expect([...covered].filter((route) => !registered.includes(route)).sort()).toEqual([]);
  });
});
