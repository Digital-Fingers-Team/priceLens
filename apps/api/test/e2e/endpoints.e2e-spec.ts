// Before AppModule loads: this suite sends a few hundred requests from one
// address, far past the production per-minute limits it would otherwise hit.
process.env.THROTTLE_LIMIT = '100000';
process.env.THROTTLE_LIMIT_AUTH = '100000';
// Wallet payments are on only with somewhere to send the money.
process.env.BILLING_WALLET_NUMBER = '01000000000';

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
import { clearTestRedis, offlineStores } from './offline-stores';
import { IngestionQueue } from '../../src/workers/ingestion-queue.service';
import { AFFILIATE_CONVERSION_QUEUE } from '../../src/affiliate/affiliate.constants';
import type { RetailerConnector } from '../../src/scraping/interfaces/retailer-connector.interface';
import type { RetailerListing } from '../../src/scraping/interfaces/retailer-listing.interface';
import { upsertCategories } from '../../seed/generators/generateProducts';
import { generateStores } from '../../seed/generators/generateStores';
import { DEFAULT_PLAN_BLUEPRINTS } from '../../src/billing/plan-limits';

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

function listing(externalId: string, title: string, price: number, store = 'https://www.noon.com'): RetailerListing {
  return {
    externalId,
    // On the store's own domain: the redirect refuses anything else (S-09).
    externalUrl: `${store}/p/${externalId}`,
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
    await clearTestRedis();
    const moduleRef = await offlineStores(Test.createTestingModule({ imports: [AppModule] }), {
      noon: fakeConnector('noon', [
        listing('endpoints-noon-phone', 'Apple iPhone 15 128GB Black', 42999),
        listing('endpoints-noon-phone-2', 'Apple iPhone 15 256GB Blue', 49999),
      ]),
      jumia: fakeConnector('jumia', [
        listing('endpoints-jumia-phone', 'Apple iPhone 15 (128 GB) - Black', 41499, 'https://www.jumia.com.eg'),
      ]),
    }).compile();

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
      'TRUNCATE canonical_products, source_listings, price_history, match_decisions, review_queue, page_views CASCADE',
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
    await call('GET', '/health/ops', 200);
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
    // No token in the body and no pl_rt cookie: unauthenticated (the body is
    // optional since D-17, so this is no longer a validation error).
    await call('POST', '/api/v1/auth/refresh', 401, { body: {} });

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

  it('billing: a wallet payment, from order to approval', async () => {
    // The free user pays, and is put back on Free at the end (later tests
    // rely on it); registering another user would hit the sign-up limit.
    const payerToken = free.token;
    // Unique per run: a transfer number counts once, also across runs on one database.
    const ref = String(Date.now());

    const plans = await call('GET', '/api/v1/billing/plans', 200);
    expect(plans.body.data.manualPaymentsEnabled).toBe(true);
    const byKey = Object.fromEntries(plans.body.data.plans.map((p: { key: string; purchasable: boolean }) => [p.key, p.purchasable]));
    expect(byKey.plus_monthly).toBe(true);
    expect(byKey.enterprise_monthly).not.toBe(true);

    await call('POST', '/api/v1/billing/payments', 401, { body: { planKey: 'plus_monthly' } });
    await call('POST', '/api/v1/billing/payments', 403, { token: payerToken, body: { planKey: 'enterprise_monthly' } });
    const started = await call('POST', '/api/v1/billing/payments', 201, { token: payerToken, body: { planKey: 'plus_monthly' } });
    const order = started.body.data.payment;
    expect(order).toMatchObject({ status: 'AWAITING_PAYMENT', amountMinor: 12900, planKey: 'plus_monthly' });
    expect(started.body.data.destinations.walletNumber).toBe('01000000000');
    // A second click is the same order, not a new code.
    const again = await call('POST', '/api/v1/billing/payments', 201, { token: payerToken, body: { planKey: 'plus_monthly' } });
    expect(again.body.data.payment.id).toBe(order.id);

    const params = { id: order.id };
    await call('POST', '/api/v1/billing/payments/{id}/submit', 404, {
      token: pro.token,
      params,
      body: { method: 'WALLET', reference: `TX-${ref}` },
    });
    await call('POST', '/api/v1/billing/payments/{id}/submit', 400, { token: payerToken, params, body: { method: 'CARD', reference: `TX-${ref}` } });
    const sent = await call('POST', '/api/v1/billing/payments/{id}/submit', 201, {
      token: payerToken,
      params,
      body: { method: 'WALLET', reference: `tx ${ref}`, payerAccount: '01111111111' },
    });
    expect(sent.body.data).toMatchObject({ status: 'SUBMITTED', reference: `TX${ref}` });

    // The same receipt cannot pay for a second order.
    const other = await call('POST', '/api/v1/billing/payments', 201, { token: pro.token, body: { planKey: 'plus_monthly' } });
    await call('POST', '/api/v1/billing/payments/{id}/submit', 409, {
      token: pro.token,
      params: { id: other.body.data.payment.id },
      body: { method: 'WALLET', reference: `TX-${ref}` },
    });
    await call('POST', '/api/v1/billing/payments/{id}/cancel', 201, { token: pro.token, params: { id: other.body.data.payment.id } });
    await call('POST', '/api/v1/billing/payments/{id}/cancel', 409, { token: pro.token, params: { id: other.body.data.payment.id } });

    const mine = await call('GET', '/api/v1/billing/payments/mine', 200, { token: payerToken });
    expect(mine.body.data.payments[0].id).toBe(order.id);

    await call('GET', '/api/v1/billing/payments/admin', 403, { token: payerToken });
    const queue = await call('GET', '/api/v1/billing/payments/admin', 200, { token: admin.token, query: { status: 'SUBMITTED' } });
    expect(queue.body.data.payments.map((p: { id: string }) => p.id)).toContain(order.id);

    await call('POST', '/api/v1/billing/payments/admin/{id}/approve', 403, { token: payerToken, params });
    await call('POST', '/api/v1/billing/payments/admin/{id}/approve', 201, { token: admin.token, params });
    await call('POST', '/api/v1/billing/payments/admin/{id}/approve', 409, { token: admin.token, params });
    await call('POST', '/api/v1/billing/payments/admin/{id}/reject', 409, { token: admin.token, params, body: { reason: 'late' } });
    await call('POST', '/api/v1/billing/payments/admin/{id}/reject', 404, { token: admin.token, params: { id: MISSING_ID } });

    const me = await call('GET', '/api/v1/billing/me', 200, { token: payerToken });
    expect(me.body.data).toMatchObject({ planKey: 'plus_monthly', provider: 'wallet', status: 'ACTIVE' });
    const days = (Date.parse(me.body.data.currentPeriodEnd) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
    await call('POST', '/api/v1/billing/cancel', 201, { token: payerToken, body: { immediately: true } });
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

    // D-24: only categories that hold products, with their counts.
    const categories = await call('GET', '/api/v1/categories', 200);
    const rows = categories.body.data as { slug: string; productCount: number }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.productCount > 0)).toBe(true);

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
    expect(res.headers.location).toContain('www.noon.com/p/endpoints-noon-phone');
    await call('GET', '/api/v1/affiliate/go/{listingId}', 404, { params: { listingId: MISSING_ID } });

    // A scraped URL off the store's domain is never followed (S-09).
    const original = (await prisma.sourceListing.findUniqueOrThrow({ where: { id: listingId } })).externalUrl;
    for (const hostile of ['https://evil.example/login', 'javascript:alert(document.cookie)']) {
      await prisma.sourceListing.update({ where: { id: listingId }, data: { externalUrl: hostile } });
      const refused = await call('GET', '/api/v1/affiliate/go/{listingId}', 404, { params: { listingId } });
      expect(refused.headers.location).toBeUndefined();
    }
    await prisma.sourceListing.update({ where: { id: listingId }, data: { externalUrl: original } });

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

  it('analytics', async () => {
    const browser = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Mobile Safari' };
    const view = {
      id: '0b7e8f1c-3a52-4c1e-9d6f-2a1b3c4d5e6f',
      visitorId: '1c8f9a2d-4b63-4d2f-8e7a-3b2c4d5e6f70',
      sessionId: '2d9a0b3e-5c74-4e3a-9f8b-4c3d5e6f7081',
      path: `/products/${productSlug}`,
      referrer: 'https://www.google.com/',
    };
    await call('POST', '/api/v1/analytics/views', 204, { headers: browser, body: view });
    // A crawler that runs script is not a visitor.
    await call('POST', '/api/v1/analytics/views', 204, {
      headers: { 'User-Agent': 'Googlebot/2.1' },
      body: { ...view, id: '3e0b1c4f-6d85-4f4b-8a9c-5d4e6f708192' },
    });
    await call('POST', '/api/v1/analytics/views', 400, { headers: browser, body: { ...view, id: 'not-a-uuid' } });
    await call('POST', '/api/v1/analytics/views/{id}/duration', 204, {
      headers: browser,
      params: { id: view.id },
      body: { durationMs: 42000 },
    });
    await call('POST', '/api/v1/analytics/views/{id}/duration', 400, {
      headers: browser,
      params: { id: view.id },
      body: { durationMs: -1 },
    });

    const stored = await prisma.pageView.findMany();
    expect(stored.map((v) => [v.route, v.productSlug, v.device, v.referrerHost, v.durationMs])).toEqual([
      ['product', productSlug, 'mobile', 'google.com', 42000],
    ]);

    const summary = await call('GET', '/api/v1/analytics/summary', 200, { token: admin.token, query: { days: 7 } });
    expect(summary.body.data.traffic).toMatchObject({ views: 1, visitors: 1 });
    expect(summary.body.data.engagement.products[0]).toMatchObject({ slug: productSlug, totalMs: 42000 });
    await call('GET', '/api/v1/analytics/summary', 400, { token: admin.token, query: { days: 5 } });
    await call('GET', '/api/v1/analytics/summary', 403, { token: free.token });
    await call('GET', '/api/v1/analytics/summary', 401);
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

  it('another user cannot read or change what is not theirs (S-07, S-19)', async () => {
    const victim = { token: pro.token };
    const intruder = { token: free.token };

    // Alerts: someone else's id behaves like a missing one, and nothing changes.
    await call('POST', '/api/v1/watchlist', 201, { ...victim, body: { productId } });
    const alert = await call('POST', '/api/v1/watchlist/{productId}/alerts', 201, {
      ...victim,
      params: { productId },
      body: { alertType: 'PRICE_TARGET', thresholdValue: 30000 },
    });
    const alertId = alert.body.data?.id ?? MISSING_ID;
    await call('POST', '/api/v1/watchlist/alerts/{alertId}/reactivate', 404, { ...intruder, params: { alertId } });
    await call('DELETE', '/api/v1/watchlist/alerts/{alertId}', 404, { ...intruder, params: { alertId } });
    expect(await prisma.priceAlert.count({ where: { id: alertId } })).toBe(1);

    // Notifications: marking someone else's as read is a silent no-op.
    const notification = await prisma.notification.create({
      data: { userId: pro.id, type: 'price_alert.triggered', title: 'Price drop', body: 'Cheaper now' },
    });
    await call('POST', '/api/v1/notifications/{id}/read', 201, { ...intruder, params: { id: notification.id } });
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } })).readAt).toBeNull();

    // Workspaces: a non-member cannot touch members, and an ADMIN cannot demote the owner.
    const owner = await prisma.organizationMember.findFirstOrThrow({ where: { userId: pro.id, role: 'OWNER' } });
    const params = { orgId: owner.orgId };
    await call('DELETE', '/api/v1/seller/workspaces/{orgId}/members/{memberId}', 404, {
      ...intruder,
      params: { ...params, memberId: owner.id },
    });
    const admin = await call('POST', '/api/v1/seller/workspaces/{orgId}/members', 201, {
      ...victim,
      params,
      body: { email: free.email, role: 'ADMIN' },
    });
    await call('POST', '/api/v1/seller/workspaces/{orgId}/members', 400, {
      ...intruder,
      params,
      body: { email: pro.email, role: 'MEMBER' },
    });
    expect((await prisma.organizationMember.findUniqueOrThrow({ where: { id: owner.id } })).role).toBe('OWNER');
    await call('DELETE', '/api/v1/seller/workspaces/{orgId}/members/{memberId}', 200, {
      ...victim,
      params: { ...params, memberId: admin.body.data?.id ?? MISSING_ID },
    });

    await call('DELETE', '/api/v1/watchlist/{productId}', 200, { ...victim, params: { productId } });
    expectNoProblems();
  });

  it('v2 foundation: flags, online invoices, plan editor, invitations', async () => {
    // Flags: public snapshot, admin list and toggle.
    const flags = await call('GET', '/api/v1/flags', 200);
    expect(flags.body.data).toMatchObject({ deal_hunter: true, mock_checkout: false });
    await call('GET', '/api/v1/admin/flags', 200, { token: admin.token });
    await call('GET', '/api/v1/admin/flags', 403, { token: free.token });
    await call('PUT', '/api/v1/admin/flags/{key}', 403, { token: free.token, params: { key: 'mock_checkout' }, body: { enabled: true } });
    await call('PUT', '/api/v1/admin/flags/{key}', 404, { token: admin.token, params: { key: 'no_such_flag' }, body: { enabled: true } });
    await call('PUT', '/api/v1/admin/flags/{key}', 400, { token: admin.token, params: { key: 'mock_checkout' }, body: {} });

    // A switched-off plan feature is a 404 even for a plan that includes it.
    await call('PUT', '/api/v1/admin/flags/{key}', 200, { token: admin.token, params: { key: 'buy_verdict' }, body: { enabled: false } });
    const gone = await call('GET', '/api/v1/intelligence/products/{productId}/verdict', 404, { token: pro.token, params: { productId } });
    expect(gone.body.error?.code).toBe('FEATURE_DISABLED');
    await call('DELETE', '/api/v1/admin/flags/{key}', 200, { token: admin.token, params: { key: 'buy_verdict' } });
    await call('GET', '/api/v1/intelligence/products/{productId}/verdict', 200, { token: pro.token, params: { productId } });

    // Plan editor.
    await call('PUT', '/api/v1/billing/admin/plans/{key}', 403, { token: free.token, params: { key: 'plus_monthly' }, body: { trialDays: 7 } });
    await call('PUT', '/api/v1/billing/admin/plans/{key}', 404, { token: admin.token, params: { key: 'nope' }, body: { trialDays: 7 } });
    const edited = await call('PUT', '/api/v1/billing/admin/plans/{key}', 200, {
      token: admin.token,
      params: { key: 'plus_monthly' },
      body: { trialDays: 7, limits: { features: ['deal_hunter', 'not_a_feature'], activeAlerts: null } },
    });
    // Unknown feature keys are dropped, never stored.
    expect(edited.body.data.limits.features).toEqual(['deal_hunter']);
    const plans = await call('GET', '/api/v1/billing/admin/plans', 200, { token: admin.token });
    expect(plans.body.data.map((p: { key: string }) => p.key)).toContain('seller_plus_monthly');
    // Put Plus back the way the rest of the suite expects it.
    const plusBlueprint = DEFAULT_PLAN_BLUEPRINTS.find((plan) => plan.key === 'plus_monthly')!;
    await prisma.plan.update({ where: { key: 'plus_monthly' }, data: { limits: plusBlueprint.limits as never, trialDays: plusBlueprint.trialDays } });

    // Online checkout with the test double: off until its flag is on.
    const before = await call('GET', '/api/v1/billing/providers', 200, { token: free.token });
    expect(before.body.data.providers).toEqual([]);
    await call('POST', '/api/v1/billing/invoices/checkout', 404, { token: free.token, body: { planKey: 'plus_monthly', provider: 'mock' } });
    await call('PUT', '/api/v1/admin/flags/{key}', 200, { token: admin.token, params: { key: 'mock_checkout' }, body: { enabled: true } });
    const after = await call('GET', '/api/v1/billing/providers', 200, { token: free.token });
    expect(after.body.data.providers).toEqual(['mock']);

    await call('POST', '/api/v1/billing/invoices/checkout', 400, { token: free.token, body: { planKey: 'plus_monthly', provider: 'bitcoin' } });
    await call('POST', '/api/v1/billing/invoices/checkout', 403, { token: free.token, body: { planKey: 'enterprise_monthly', provider: 'mock' } });
    const checkout = await call('POST', '/api/v1/billing/invoices/checkout', 201, {
      token: free.token,
      body: { planKey: 'plus_monthly', provider: 'mock' },
    });
    const invoiceId = checkout.body.data.invoiceId as string;
    expect(checkout.body.data.redirectUrl).toContain(`/account/pay/test/${invoiceId}`);
    const params = { id: invoiceId };

    const pending = await call('GET', '/api/v1/billing/invoices/{id}', 200, { token: free.token, params });
    expect(pending.body.data).toMatchObject({ status: 'PENDING', amountMinor: 12900, planKey: 'plus_monthly' });
    await call('GET', '/api/v1/billing/invoices/{id}', 404, { token: pro.token, params });
    const freeBefore = await call('GET', '/api/v1/billing/me', 200, { token: free.token });
    expect(freeBefore.body.data.tier).toBe('FREE');

    // Someone else cannot settle it; a decline fails it; paying it grants Plus at once.
    await call('POST', '/api/v1/billing/invoices/{id}/test-pay', 404, { token: pro.token, params, body: { outcome: 'PAID' } });
    await call('POST', '/api/v1/billing/invoices/{id}/test-pay', 400, { token: free.token, params, body: { outcome: 'MAYBE' } });
    const declined = await call('POST', '/api/v1/billing/invoices/{id}/test-pay', 201, { token: free.token, params, body: { outcome: 'FAILED' } });
    expect(declined.body.data.status).toBe('FAILED');
    const paid = await call('POST', '/api/v1/billing/invoices/{id}/test-pay', 201, { token: free.token, params, body: { outcome: 'PAID' } });
    expect(paid.body.data.status).toBe('PAID');
    const replay = await call('POST', '/api/v1/billing/invoices/{id}/test-pay', 201, { token: free.token, params, body: { outcome: 'PAID' } });
    expect(replay.body.data.status).toBe('PAID');

    const freeAfter = await call('GET', '/api/v1/billing/me', 200, { token: free.token });
    expect(freeAfter.body.data).toMatchObject({ tier: 'PLUS', planKey: 'plus_monthly', provider: 'mock', status: 'ACTIVE' });
    expect(freeAfter.body.data.limits.features).toContain('buy_verdict');
    // The locked feature is now available.
    await call('GET', '/api/v1/intelligence/products/{productId}/verdict', 200, { token: free.token, params: { productId } });

    const list = await call('GET', '/api/v1/billing/invoices', 200, { token: free.token });
    expect(list.body.data.invoices[0]).toMatchObject({ id: invoiceId, kind: 'online', status: 'PAID' });

    // Cancelling keeps the plan to the end of the period.
    const cancelled = await call('POST', '/api/v1/billing/cancel', 201, { token: free.token, body: { immediately: false } });
    expect(cancelled.body.data.cancelAtPeriodEnd).toBe(true);
    await call('POST', '/api/v1/billing/cancel', 201, { token: free.token, body: { immediately: true } });
    await call('DELETE', '/api/v1/admin/flags/{key}', 200, { token: admin.token, params: { key: 'mock_checkout' } });
    await call('DELETE', '/api/v1/admin/flags/{key}', 403, { token: free.token, params: { key: 'mock_checkout' } });

    // Paymob's callback is HMAC-signed; an unsigned one is refused.
    await call('POST', '/api/v1/billing/webhook/paymob', 400, { body: { type: 'TRANSACTION', obj: { id: 1 } } });

    // Invitations: the enterprise user's workspace invites the free user by email.
    // One workspace per owner: reuse the one the seller test created.
    const owned = await call('GET', '/api/v1/seller/workspaces', 200, { token: pro.token });
    const shop = owned.body.data.find((w: { role: string; name: string }) => w.role === 'OWNER');
    const orgParams = { orgId: shop.id as string };
    await call('POST', '/api/v1/seller/workspaces/{orgId}/invites', 400, { token: pro.token, params: orgParams, body: { email: 'not-an-email', role: 'MEMBER' } });
    await call('POST', '/api/v1/seller/workspaces/{orgId}/invites', 404, { token: free.token, params: orgParams, body: { email: free.email, role: 'MEMBER' } });
    const created = await call('POST', '/api/v1/seller/workspaces/{orgId}/invites', 201, {
      token: pro.token,
      params: orgParams,
      body: { email: free.email, role: 'MEMBER' },
    });
    const token = String(created.body.data.link).split('/invite/')[1];
    expect(token).toBeTruthy();
    const open = await call('GET', '/api/v1/seller/workspaces/{orgId}/invites', 200, { token: pro.token, params: orgParams });
    expect(open.body.data.map((i: { email: string }) => i.email)).toEqual([free.email.toLowerCase()]);

    const preview = await call('GET', '/api/v1/invites/{token}', 200, { params: { token } });
    expect(preview.body.data).toMatchObject({ workspace: shop.name, role: 'MEMBER' });
    await call('POST', '/api/v1/invites/{token}/accept', 403, { token: pro.token, params: { token } });
    const joined = await call('POST', '/api/v1/invites/{token}/accept', 201, { token: free.token, params: { token } });
    expect(joined.body.data).toEqual({ orgId: orgParams.orgId, role: 'MEMBER' });
    await call('POST', '/api/v1/invites/{token}/accept', 404, { token: free.token, params: { token } });
    await call('GET', '/api/v1/invites/{token}', 404, { params: { token: 'not-a-token' } });

    const second = await call('POST', '/api/v1/seller/workspaces/{orgId}/invites', 201, {
      token: pro.token,
      params: orgParams,
      body: { email: 'someone-new@example.com', role: 'ADMIN' },
    });
    await call('DELETE', '/api/v1/seller/workspaces/{orgId}/invites/{inviteId}', 200, {
      token: pro.token,
      params: { ...orgParams, inviteId: second.body.data.id },
    });
    await call('DELETE', '/api/v1/seller/workspaces/{orgId}/invites/{inviteId}', 404, {
      token: pro.token,
      params: { ...orgParams, inviteId: second.body.data.id },
    });
    // Leave the free user as they were: in no workspace.
    await prisma.organizationMember.deleteMany({ where: { orgId: orgParams.orgId, userId: free.id } });
    expectNoProblems();
  });

  it('v2 buyer pro: landed cost, browser push', async () => {
    // Landed cost: the e2e product is sold by local stores only, so nothing yet.
    const before = await call('GET', '/api/v1/intelligence/products/{productId}/landed-cost', 200, { params: { productId } });
    expect(before.body.data.offers).toEqual([]);

    // Treat Noon as cross-border for a moment: its offer gains a door price.
    await call('PUT', '/api/v1/admin/landed-cost-rules', 403, { token: free.token, body: { platformId } });
    await call('PUT', '/api/v1/admin/landed-cost-rules', 400, { token: admin.token, body: { platformId, customsPct: -1 } });
    const saved = await call('PUT', '/api/v1/admin/landed-cost-rules', 200, {
      token: admin.token,
      body: { platformId, customsPct: 10, vatPct: 14, handlingFee: 100 },
    });
    const rules = await call('GET', '/api/v1/admin/landed-cost-rules', 200, { token: admin.token });
    expect(rules.body.data.map((r: { id: string }) => r.id)).toContain(saved.body.data.id);

    const anonymous = await call('GET', '/api/v1/intelligence/products/{productId}/landed-cost', 200, { params: { productId } });
    const offer = anonymous.body.data.offers[0];
    // 42999 * 1.10 * 1.14 + 100
    expect(offer.total).toBeCloseTo(42999 * 1.1 * 1.14 + 100, 0);
    expect(offer.breakdown).toBeNull();
    const detailed = await call('GET', '/api/v1/intelligence/products/{productId}/landed-cost', 200, { token: pro.token, params: { productId } });
    expect(detailed.body.data.offers[0].breakdown).toMatchObject({ handling: 100 });

    await call('DELETE', '/api/v1/admin/landed-cost-rules/{id}', 200, { token: admin.token, params: { id: saved.body.data.id } });
    await call('DELETE', '/api/v1/admin/landed-cost-rules/{id}', 404, { token: admin.token, params: { id: saved.body.data.id } });

    // Browser push: free plans do not include it; with no VAPID keys it is off.
    const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/e2e', keys: { p256dh: 'p', auth: 'a' } };
    await call('POST', '/api/v1/notifications/channels/web-push', 403, { token: free.token, body: { subscription } });
    await call('POST', '/api/v1/notifications/channels/web-push', 400, { token: pro.token, body: { subscription } });
    await call('POST', '/api/v1/notifications/channels/web-push', 400, { token: pro.token, body: {} });
    const channels = await call('GET', '/api/v1/notifications/channels', 200, { token: pro.token });
    expect(channels.body.data.available.WEB_PUSH).toEqual({ configured: false, allowed: true });
    expect(channels.body.data.webPushPublicKey).toBeNull();
    expectNoProblems();
  });

  it('v2 buyer differentiators: installments, offers, coupons, warranty, baskets', async () => {
    const extrasPath = '/api/v1/buyer/products/{productId}/extras';
    const empty = await call('GET', extrasPath, 200, { params: { productId } });
    expect(empty.body.data.installments).toMatchObject({ count: 0 });

    // Admin enters a 0% plan, a bank-card offer, a coupon and a warranty rule.
    const plan = await call('POST', '/api/v1/admin/installment-plans', 201, {
      token: admin.token,
      body: { provider: 'valU', months: 6, markupPct: 0 },
    });
    await call('POST', '/api/v1/admin/installment-plans', 403, { token: free.token, body: { provider: 'x', months: 6 } });
    await call('POST', '/api/v1/admin/installment-plans', 400, { token: admin.token, body: { provider: 'x', months: 0 } });
    await call('GET', '/api/v1/admin/installment-plans', 200, { token: admin.token });
    await call('PATCH', '/api/v1/admin/installment-plans/{id}', 200, { token: admin.token, params: { id: plan.body.data.id }, body: { notes: 'e2e' } });

    const card = await call('POST', '/api/v1/admin/promos', 201, {
      token: admin.token,
      body: { type: 'CARD', bankName: 'CIB', title: '10% with CIB', valueType: 'PERCENT', value: 10, maxDiscount: 1000 },
    });
    await call('POST', '/api/v1/admin/promos', 400, { token: admin.token, body: { type: 'COUPON', title: 'no code', valueType: 'AMOUNT', value: 50 } });
    const coupon = await call('POST', '/api/v1/admin/promos', 201, {
      token: admin.token,
      body: { type: 'COUPON', code: 'save50', title: '50 off', valueType: 'AMOUNT', value: 50, verified: true },
    });
    expect(coupon.body.data.code).toBe('SAVE50');
    await call('GET', '/api/v1/admin/promos', 200, { token: admin.token });
    await call('PATCH', '/api/v1/admin/promos/{id}', 200, { token: admin.token, params: { id: card.body.data.id }, body: { minSpend: 1 } });

    const rule = await call('PUT', '/api/v1/admin/warranty-rules', 200, {
      token: admin.token,
      body: { platformId, type: 'LOCAL_AGENT', months: 24, agentName: 'Agent' },
    });
    await call('GET', '/api/v1/admin/warranty-rules', 200, { token: admin.token });

    // A free visitor sees the Pro sections locked, with counts; warranty for everyone.
    const locked = await call('GET', extrasPath, 200, { params: { productId } });
    expect(locked.body.data.installments).toEqual({ access: 'locked', count: 1, items: [] });
    expect(locked.body.data.cardOffers).toMatchObject({ access: 'locked', count: 1 });
    expect(locked.body.data.warranty.offers.find((o: { warranty: unknown }) => o.warranty)).toBeTruthy();

    // The enterprise user (all features) sees them, and their bank first.
    await call('PUT', '/api/v1/buyer/banks', 400, { token: pro.token, body: { banks: 'CIB' } });
    await call('PUT', '/api/v1/buyer/banks', 200, { token: pro.token, body: { banks: ['CIB', ' CIB '] } });
    const banks = await call('GET', '/api/v1/buyer/banks', 200, { token: pro.token });
    expect(banks.body.data).toEqual({ mine: ['CIB'], known: ['CIB'] });
    const open = await call('GET', extrasPath, 200, { token: pro.token, params: { productId } });
    const best = open.body.data.installments.items[0];
    expect(best).toMatchObject({ provider: 'valU', months: 6, extraPct: 0 });
    expect(best.monthly).toBeCloseTo(best.price / 6, 1);
    expect(open.body.data.cardOffers.items[0]).toMatchObject({ bankName: 'CIB', mine: true });
    expect(open.body.data.cardOffers.items[0].saving).toBe(1000);
    expect(open.body.data.coupons.items[0]).toMatchObject({ code: 'SAVE50', saving: 50 });

    // Coupon reports: one vote each, changeable.
    const report = { params: { id: coupon.body.data.id } };
    await call('POST', '/api/v1/buyer/coupons/{id}/report', 201, { token: pro.token, ...report, body: { worked: false } });
    await call('POST', '/api/v1/buyer/coupons/{id}/report', 201, { token: pro.token, ...report, body: { worked: true } });
    await call('POST', '/api/v1/buyer/coupons/{id}/report', 404, { token: pro.token, params: { id: card.body.data.id }, body: { worked: true } });
    const counted = await prisma.promo.findUniqueOrThrow({ where: { id: coupon.body.data.id } });
    expect([counted.workedCount, counted.failedCount]).toEqual([1, 0]);

    // Baskets: Pro only; the target is reached, so the sweep notifies once.
    await call('GET', '/api/v1/buyer/carts', 403, { token: free.token });
    await call('POST', '/api/v1/buyer/carts', 400, { token: pro.token, body: { name: 'x', targetTotal: 10, items: [] } });
    const cart = await call('POST', '/api/v1/buyer/carts', 201, {
      token: pro.token,
      body: { name: 'Phone', targetTotal: 999_999, items: [{ productId, qty: 1 }] },
    });
    expect(cart.body.data).toMatchObject({ reached: true, items: [{ qty: 1 }] });
    const carts = await call('GET', '/api/v1/buyer/carts', 200, { token: pro.token });
    expect(carts.body.data).toHaveLength(1);
    const cartParams = { params: { id: cart.body.data.id } };
    await call('PATCH', '/api/v1/buyer/carts/{id}', 200, { token: pro.token, ...cartParams, body: { acrossStores: false } });
    // The plan gate answers before ownership is even checked.
    await call('PATCH', '/api/v1/buyer/carts/{id}', 403, { token: free.token, ...cartParams, body: { name: 'mine now' } });
    await call('DELETE', '/api/v1/buyer/carts/{id}', 404, { token: free.token, ...cartParams });
    await call('DELETE', '/api/v1/buyer/carts/{id}', 200, { token: pro.token, ...cartParams });

    // Clean up so later runs start from nothing.
    await call('DELETE', '/api/v1/admin/installment-plans/{id}', 200, { token: admin.token, params: { id: plan.body.data.id } });
    await call('DELETE', '/api/v1/admin/promos/{id}', 200, { token: admin.token, params: { id: card.body.data.id } });
    await call('DELETE', '/api/v1/admin/promos/{id}', 200, { token: admin.token, params: { id: coupon.body.data.id } });
    await call('DELETE', '/api/v1/admin/warranty-rules/{id}', 200, { token: admin.token, params: { id: rule.body.data.id } });
    await call('DELETE', '/api/v1/admin/warranty-rules/{id}', 404, { token: admin.token, params: { id: rule.body.data.id } });
    await call('PUT', '/api/v1/buyer/banks', 200, { token: pro.token, body: { banks: [] } });
    expectNoProblems();
  });

  it('v2 coverage: used-market range', async () => {
    const none = await call('GET', '/api/v1/intelligence/products/{productId}/used-price', 200, { params: { productId } });
    expect(none.body.data.range).toBeNull();
    await prisma.usedPriceSnapshot.create({
      data: { canonicalProductId: productId, source: 'opensooq', sampleSize: 12, p25: 20000, median: 22000, p75: 24000 },
    });
    // "Checked, too few listings" rows are never shown.
    await prisma.usedPriceSnapshot.create({ data: { canonicalProductId: productId, source: 'opensooq', sampleSize: 2 } });
    const some = await call('GET', '/api/v1/intelligence/products/{productId}/used-price', 200, { params: { productId } });
    expect(some.body.data.range).toMatchObject({ sampleSize: 12, p25: 20000, median: 22000, p75: 24000 });
    await prisma.usedPriceSnapshot.deleteMany({ where: { canonicalProductId: productId } });
    expectNoProblems();
  });

  it('v2 input channels: image search, advisor, Telegram bot', async () => {
    // Image search is a Pro feature; with no photo attached it is a 400.
    await call('POST', '/api/v1/search/image', 403, { token: free.token });
    await call('POST', '/api/v1/search/image', 400, { token: pro.token });

    // The advisor: no model configured in tests, so it answers from Deal Hunter alone.
    await call('POST', '/api/v1/advisor', 403, { token: free.token, body: { message: 'iphone 15' } });
    await call('POST', '/api/v1/advisor', 400, { token: pro.token, body: { message: 'x' } });
    const advice = await call('POST', '/api/v1/advisor', 201, { token: pro.token, body: { message: 'iphone 15' } });
    expect(advice.body.data.generatedBy).toBe('rules');
    for (const pick of advice.body.data.picks) expect(typeof pick.product.productId).toBe('string');

    // Telegram: no webhook secret configured, so every call is refused.
    await call('POST', '/api/v1/telegram/webhook', 403, { body: { update_id: 1 } });
    await call('POST', '/api/v1/telegram/webhook', 403, {
      headers: { 'x-telegram-bot-api-secret-token': '' },
      body: { update_id: 1 },
    });
    await call('POST', '/api/v1/admin/telegram/webhook', 403, { token: free.token });
    expectNoProblems();
  });

  it('calls every registered route', () => {
    interface Layer {
      route?: { path: string; methods: Record<string, boolean> };
    }
    const stack = (app.getHttpAdapter().getInstance() as { router: { stack: Layer[] } }).router.stack; // Express 5 (was _router)
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
