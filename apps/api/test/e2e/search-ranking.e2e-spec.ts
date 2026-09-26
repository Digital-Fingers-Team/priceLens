import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { MatchStatus, type PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { PrismaService } from '../../src/database/prisma.service';
import { NormalizerService } from '../../src/matching/normalizer.service';
import { upsertCategories } from '../../seed/generators/generateProducts';
import { generateStores } from '../../seed/generators/generateStores';

/**
 * Search relevance on real queries (audit 02, L-15/L-24): 20 queries people
 * type, 7 of them Arabic, against a small catalog shaped like production:
 * variants of one model, accessories naming the phone, Arabic-titled
 * products. Each test states what a shopper expects to see first.
 */

interface Fixture {
  key: string;
  title: string;
  category: string;
  brand: string;
  model: string;
  price: number;
}

const CATALOG: Fixture[] = [
  { key: 'a57-8', title: 'Samsung Galaxy A57 5G 8GB RAM 256GB', category: 'smartphones', brand: 'Samsung', model: 'Galaxy A57', price: 26325 },
  { key: 'a57-12', title: 'Samsung Galaxy A57 5G 12GB RAM 256GB', category: 'smartphones', brand: 'Samsung', model: 'Galaxy A57', price: 29655 },
  { key: 's24u', title: 'Samsung Galaxy S24 Ultra 12GB 512GB', category: 'smartphones', brand: 'Samsung', model: 'Galaxy S24 Ultra', price: 64999 },
  { key: 'a57-case', title: 'Silicone Case for Samsung Galaxy A57', category: 'smartphones', brand: 'Samsung', model: 'Galaxy A57', price: 350 },
  { key: 'ip15', title: 'Apple iPhone 15 128GB', category: 'smartphones', brand: 'Apple', model: 'iPhone 15', price: 42999 },
  { key: 'ip15pm', title: 'Apple iPhone 15 Pro Max 256GB', category: 'smartphones', brand: 'Apple', model: 'iPhone 15 Pro Max', price: 69999 },
  { key: 'ip15-glass', title: 'Tempered Glass Screen Protector for iPhone 15', category: 'smartphones', brand: 'Apple', model: 'iPhone 15', price: 199 },
  { key: 'ip15p-ar', title: 'ايفون 15 برو 128 جيجا', category: 'smartphones', brand: 'Apple', model: 'iPhone 15 Pro', price: 58999 },
  { key: 'rn13p-ar', title: 'شاومي ريدمي نوت 13 برو 8 جيجا رام 256 جيجا', category: 'smartphones', brand: 'Xiaomi', model: 'Redmi Note 13 Pro', price: 15999 },
  { key: 'rn13', title: 'Xiaomi Redmi Note 13 5G 6GB 128GB', category: 'smartphones', brand: 'Xiaomi', model: 'Redmi Note 13', price: 11999 },
  { key: 'ps5', title: 'Sony PlayStation 5 Slim Console', category: 'gaming-consoles', brand: 'Sony', model: 'PlayStation 5', price: 27999 },
  { key: 'ps5-pad', title: 'PlayStation 5 DualSense Wireless Controller', category: 'gaming-consoles', brand: 'Sony', model: 'DualSense', price: 3999 },
  { key: 'xps13', title: 'Dell XPS 13 Laptop Intel Core i7 16GB 512GB SSD', category: 'laptops', brand: 'Dell', model: 'XPS 13', price: 79999 },
  { key: 'ideapad', title: 'Lenovo IdeaPad Slim 3 Laptop 8GB 512GB', category: 'laptops', brand: 'Lenovo', model: 'IdeaPad Slim 3', price: 24999 },
  { key: 'tv-samsung', title: 'Samsung 55 Inch Crystal UHD 4K Smart TV', category: 'televisions', brand: 'Samsung', model: 'Crystal UHD', price: 21999 },
  { key: 'tv-lg', title: 'LG 43 Inch Full HD Smart TV', category: 'televisions', brand: 'LG', model: '43LM', price: 11999 },
  { key: 'xm5', title: 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones', category: 'headphones', brand: 'Sony', model: 'WH-1000XM5', price: 15999 },
  { key: 'ch520-ar', title: 'سماعة سوني لاسلكية WH-CH520', category: 'headphones', brand: 'Sony', model: 'WH-CH520', price: 2499 },
  { key: 'washer-ar', title: 'غسالة سامسونج فول اوتوماتيك 8 كيلو', category: 'home-appliances', brand: 'Samsung', model: 'WW80', price: 18999 },
  { key: 'ipad-air', title: 'Apple iPad Air 11 inch M2 128GB', category: 'tablets', brand: 'Apple', model: 'iPad Air', price: 36999 },
  { key: 'aw9', title: 'Apple Watch Series 9 45mm', category: 'smart-watches', brand: 'Apple', model: 'Watch Series 9', price: 21999 },
  { key: 'gt4', title: 'Huawei Watch GT 4 46mm', category: 'smart-watches', brand: 'Huawei', model: 'Watch GT 4', price: 9999 },
];

describe('Search ranking (e2e)', () => {
  let app: NestExpressApplication;
  const titleOf = new Map(CATALOG.map((fixture) => [fixture.key, fixture.title]));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true });
    configureApp(app);
    await app.init();

    const prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe(
      'TRUNCATE canonical_products, source_listings, price_history, match_decisions, review_queue CASCADE',
    );
    const categories = await upsertCategories(prisma as unknown as PrismaClient);
    const stores = await generateStores(prisma as unknown as PrismaClient);
    const noon = stores.get('noon')!.id;
    const jumia = stores.get('jumia')!.id;
    const normalizer = new NormalizerService();

    for (const fixture of CATALOG) {
      const product = await prisma.canonicalProduct.create({
        data: {
          slug: `rank-${fixture.key}`,
          title: fixture.title,
          normalizedTitle: normalizer.normalizeTitle(fixture.title).normalized,
          brand: fixture.brand,
          model: fixture.model,
          categoryId: categories.get(fixture.category)!,
        },
      });
      for (const [platformId, store] of [[noon, 'noon'], [jumia, 'jumia']] as const) {
        await prisma.sourceListing.create({
          data: {
            platformId,
            canonicalProductId: product.id,
            externalId: `rank-${store}-${fixture.key}`,
            externalUrl: `https://example.test/${store}/${fixture.key}`,
            rawTitle: fixture.title,
            rawPrice: fixture.price,
            rawCurrency: 'EGP',
            priceUsd: fixture.price,
            inStock: true,
            matchStatus: MatchStatus.ACCEPTED,
            matchConfidence: 1,
            lastSeenAt: new Date(),
          },
        });
      }
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  async function search(q: string): Promise<string[]> {
    const res = await request(app.getHttpServer()).get('/api/v1/search').query({ q, limit: 10 }).expect(200);
    return res.body.data.hits.map((hit: { title: string }) => hit.title);
  }

  const t = (key: string) => titleOf.get(key)!;
  const rank = (titles: string[], key: string) => titles.indexOf(t(key));

  // ─── English ────────────────────────────────────────────────────────────

  it('1. "galaxy a57": both A57 phones first, the case after them', async () => {
    const titles = await search('galaxy a57');
    expect(new Set(titles.slice(0, 2))).toEqual(new Set([t('a57-8'), t('a57-12')]));
    expect(rank(titles, 'a57-case')).toBeGreaterThan(1);
  });

  it('2. "galaxy a57 12gb": only the 12GB variant', async () => {
    const titles = await search('galaxy a57 12gb');
    expect(titles[0]).toBe(t('a57-12'));
    expect(titles).not.toContain(t('a57-8'));
  });

  it('3. "iphone 15": a phone first, the screen protector below every phone', async () => {
    const titles = await search('iphone 15');
    expect([t('ip15'), t('ip15pm'), t('ip15p-ar')]).toContain(titles[0]);
    const glass = rank(titles, 'ip15-glass');
    for (const phone of ['ip15', 'ip15pm', 'ip15p-ar']) expect(rank(titles, phone)).toBeLessThan(glass);
  });

  it('4. "iphone 15 pro max": the Pro Max', async () => {
    expect((await search('iphone 15 pro max'))[0]).toBe(t('ip15pm'));
  });

  it('5. "screen protector iphone 15": asking for the accessory gets the accessory', async () => {
    expect((await search('screen protector iphone 15'))[0]).toBe(t('ip15-glass'));
  });

  it('6. "playstation 5": the console before the controller', async () => {
    const titles = await search('playstation 5');
    expect(titles[0]).toBe(t('ps5'));
    expect(rank(titles, 'ps5-pad')).toBeGreaterThan(0);
  });

  it('7. "dell laptop": the Dell', async () => {
    expect((await search('dell laptop'))[0]).toBe(t('xps13'));
  });

  it('8. "samsung tv": the Samsung TV', async () => {
    expect((await search('samsung tv'))[0]).toBe(t('tv-samsung'));
  });

  it('9. "sony headphones": the Sony headphones', async () => {
    expect((await search('sony headphones'))[0]).toBe(t('xm5'));
  });

  it('10. "apple watch": the Apple Watch', async () => {
    expect((await search('apple watch'))[0]).toBe(t('aw9'));
  });

  it('11. "redmi note 13": finds the English and the Arabic-titled listing', async () => {
    const titles = await search('redmi note 13');
    expect(titles).toEqual(expect.arrayContaining([t('rn13'), t('rn13p-ar')]));
  });

  it('12. "ipad air": the iPad Air', async () => {
    expect((await search('ipad air'))[0]).toBe(t('ipad-air'));
  });

  it('13. "watch gt 4": the Huawei watch, not the Apple one', async () => {
    const titles = await search('watch gt 4');
    expect(titles[0]).toBe(t('gt4'));
    expect(titles).not.toContain(t('aw9'));
  });

  // ─── Arabic ─────────────────────────────────────────────────────────────

  it('14. "سامسونج جالاكسي a57": both A57 phones first', async () => {
    const titles = await search('سامسونج جالاكسي a57');
    expect(new Set(titles.slice(0, 2))).toEqual(new Set([t('a57-8'), t('a57-12')]));
  });

  it('15. "ايفون ١٥" (Arabic digits): a phone first, not the protector', async () => {
    const titles = await search('ايفون ١٥');
    expect([t('ip15'), t('ip15pm'), t('ip15p-ar')]).toContain(titles[0]);
  });

  it('16. "آيفون 15 برو" (hamza on alef): the Pro models, not the base iPhone 15', async () => {
    const titles = await search('آيفون 15 برو');
    expect(titles.slice(0, 2)).toContain(t('ip15p-ar'));
    expect(titles).not.toContain(t('ip15'));
  });

  it('17. "شاومي ريدمي": Arabic and English Xiaomi Redmi listings', async () => {
    const titles = await search('شاومي ريدمي');
    expect(titles).toEqual(expect.arrayContaining([t('rn13'), t('rn13p-ar')]));
  });

  it('18. "سماعة سوني" (taa marbuta): the Arabic-titled Sony headphones', async () => {
    expect((await search('سماعة سوني'))[0]).toBe(t('ch520-ar'));
  });

  it('19. "غسالة سامسونج": the Samsung washer', async () => {
    expect((await search('غسالة سامسونج'))[0]).toBe(t('washer-ar'));
  });

  it('20. "بلايستيشن ٥": the console first', async () => {
    expect((await search('بلايستيشن ٥'))[0]).toBe(t('ps5'));
  });

  // ─── Suggestions (B-10: now SQL, same rules) ─────────────────────────────

  async function suggest(q: string, limit?: number): Promise<string[]> {
    const res = await request(app.getHttpServer())
      .get('/api/v1/search/suggest')
      .query(limit ? { q, limit } : { q })
      .expect(200);
    return res.body.data.map((item: { title: string }) => item.title);
  }

  it('suggest: titles starting with what was typed come first, every term must match', async () => {
    const titles = await suggest('samsung galaxy a57');
    expect(titles.length).toBeGreaterThanOrEqual(2);
    expect(new Set(titles.slice(0, 2))).toEqual(new Set([t('a57-8'), t('a57-12')]));
    for (const title of titles) expect(title.toLowerCase()).toContain('a57');
  });

  it('suggest: Arabic brand names reach English titles', async () => {
    const titles = await suggest('سامسونج جالاكسي');
    expect(titles).toEqual(expect.arrayContaining([t('a57-8'), t('a57-12')]));
  });

  it('suggest: respects limit, and under 2 characters returns nothing', async () => {
    expect(await suggest('samsung', 2)).toHaveLength(2);
    expect(await suggest('s')).toEqual([]);
  });

  // ─── Input handling (B-02, B-13) ─────────────────────────────────────────

  it('LIKE wildcards in a query match literally', async () => {
    expect(await search('%')).toEqual([]);
    expect(await search('_')).toEqual([]);
    expect(await suggest('%%')).toEqual([]);
  });

  it('reports a measured processing time', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/search').query({ q: 'iphone' }).expect(200);
    expect(typeof res.body.data.processingTimeMs).toBe('number');
    expect(res.body.data.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it.each([
    ['a non-numeric price', { minPrice: 'abc' }],
    ['a negative price', { maxPrice: -1 }],
    ['an unknown sort', { sortBy: 'bogus' }],
    ['an unknown tier', { tier: 'CHEAP' }],
    ['a non-uuid category', { categoryId: 'phones' }],
    ['a page below 1', { page: 0 }],
    ['a limit above 100', { limit: 101 }],
    ['an unknown parameter', { extra: 1 }],
    ['a 201-character query', { q: 'a'.repeat(201) }],
  ])('GET /search rejects %s with 400', async (_label, query) => {
    const res = await request(app.getHttpServer()).get('/api/v1/search').query(query).expect(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it.each([
    ['a negative limit', { q: 'samsung', limit: -1 }],
    ['a limit above 20', { q: 'samsung', limit: 21 }],
    ['a non-numeric limit', { q: 'samsung', limit: 'abc' }],
  ])('GET /search/suggest rejects %s with 400', async (_label, query) => {
    await request(app.getHttpServer()).get('/api/v1/search/suggest').query(query).expect(400);
  });

  it('accepts every filter the web app sends', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/search')
      .query({ q: 'samsung', brand: 'Samsung', tier: 'MID_RANGE', minPrice: 1, maxPrice: 100000, sortBy: 'minPriceUsd', sortDir: 'asc', page: 1, limit: 20 })
      .expect(200);
    expect(res.body.data.page).toBe(1);
  });
});
