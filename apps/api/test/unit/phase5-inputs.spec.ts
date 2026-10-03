import { LlmService, parseJson } from '../../src/llm/llm.service';
import { LlmHttpError } from '../../src/llm/llm-provider';
import { validateRecognition } from '../../src/image-search/image-search.service';
import { AdvisorService, validatePicks, validateRewrite } from '../../src/advisor/advisor.service';
import axios from 'axios';
import { TelegramBotService, VERIFY_KEY } from '../../src/telegram-bot/telegram-bot.service';

const provider = (id: string, answer: () => Promise<string | null>, configured = true) => ({ id, isConfigured: () => configured, complete: jest.fn(answer) });

describe('LlmService', () => {
  it('uses the first configured provider, and falls back when it fails', async () => {
    const claude = provider('claude', async () => {
      throw new LlmHttpError('Claude', 429);
    });
    const gemini = provider('gemini', async () => '```json\n{"ok": true}\n```');
    const llm = new LlmService([claude, gemini]);
    await expect(llm.json({ prompt: 'x' }, (v) => v as { ok: boolean })).resolves.toEqual({ value: { ok: true }, provider: 'gemini' });
    // The failed one is paused, not retried on the next call.
    await llm.json({ prompt: 'y' }, (v) => v);
    expect(claude.complete).toHaveBeenCalledTimes(1);
  });

  it('skips unconfigured providers and answers null when nobody can', async () => {
    const llm = new LlmService([provider('claude', async () => '{}', false)]);
    expect(llm.isAvailable()).toBe(false);
    await expect(llm.json({ prompt: 'x' }, (v) => v)).resolves.toBeNull();
  });

  it('finds the JSON object inside chatter', () => {
    expect(parseJson('Sure! {"a": 1} hope that helps')).toEqual({ a: 1 });
    expect(parseJson('no json here')).toBeNull();
  });
});

describe('image recognition', () => {
  it('keeps a confident identification and its query', () => {
    expect(validateRecognition({ found: true, brand: 'Apple', model: 'iPhone 15', query: 'Apple iPhone 15 128GB', confidence: 0.9 })).toMatchObject({
      found: true,
      query: 'Apple iPhone 15 128GB',
    });
  });

  it('treats a low-confidence or empty answer as not found', () => {
    expect(validateRecognition({ found: true, query: 'something', confidence: 0.2 })).toMatchObject({ found: false, query: null });
    expect(validateRecognition({ found: true, query: '', confidence: 0.9 })).toMatchObject({ found: false });
    expect(validateRecognition('nonsense')).toBeNull();
  });
});

describe('advisor', () => {
  const ids = new Set(['p1', 'p2', 'p3', 'p4']);

  it('keeps only products we offered, once each, at most three', () => {
    const picks = validatePicks(
      {
        picks: [
          { productId: 'p1', why: 'fits', tradeoff: 'heavy' },
          { productId: 'invented', why: 'made up' },
          { productId: 'p1', why: 'again' },
          { productId: 'p2', why: 'cheap' },
          { productId: 'p3', why: 'fast' },
          { productId: 'p4', why: 'fourth' },
        ],
      },
      ids,
    );
    expect(picks?.map((p) => p.productId)).toEqual(['p1', 'p2', 'p3']);
    expect(validatePicks({ picks: [{ productId: 'nope', why: 'x' }] }, ids)).toBeNull();
  });

  it('rejects an empty rewrite', () => {
    expect(validateRewrite({ query: 'laptop under 30000' })).toEqual({ query: 'laptop under 30000' });
    expect(validateRewrite({ query: '' })).toBeNull();
  });

  const match = (id: string, price: number) => ({
    productId: id, slug: id, title: `Laptop ${id}`, brand: 'X', imageUrl: null, categoryName: 'Laptops', price, currency: 'EGP',
    storeCount: 3, inStock: true, dealScore: 70, dealGrade: 'B', matchScore: 90, specsMatched: [], specsUnconfirmed: [], reasons: [`${id} is good value.`],
  });

  function advisor(llmAnswers: Array<unknown>) {
    const hunt = jest.fn(async () => ({ query: 'q', parsed: {}, interpretation: 'laptops under 30000', matches: [match('p1', 29_000), match('p2', 25_000)], totalCandidates: 2, currency: 'EGP', notice: null }));
    const llm = { isAvailable: () => llmAnswers.length > 0, json: jest.fn(async (_req: unknown, validate: (v: unknown) => unknown) => {
      const raw = llmAnswers.shift();
      const value = raw === undefined ? null : validate(raw);
      return value ? { value, provider: 'gemini' } : null;
    }) };
    const redis = { incr: jest.fn(async () => 1), expire: jest.fn() };
    const config = { get: jest.fn((_k: string, d: unknown) => d) };
    return { service: new AdvisorService({ hunt } as never, llm as never, { client: redis } as never, config as never), hunt };
  }

  it('lets the model choose among real candidates, with prices from our data', async () => {
    const { service, hunt } = advisor([{ query: 'laptop under 30000' }, { picks: [{ productId: 'p2', why: 'أرخص', tradeoff: 'أبطأ' }] }]);
    const answer = await service.advise('u1', 'لابتوب للبرمجة 30 ألف');
    expect(hunt).toHaveBeenCalledWith('laptop under 30000', 10);
    expect(answer.generatedBy).toBe('model');
    expect(answer.picks).toEqual([expect.objectContaining({ why: 'أرخص', tradeoff: 'أبطأ', product: expect.objectContaining({ productId: 'p2', price: 25_000 }) })]);
  });

  it('falls back to Deal Hunter\'s own ranking without a model', async () => {
    const { service } = advisor([]);
    const answer = await service.advise('u1', 'laptop under 30000');
    expect(answer.generatedBy).toBe('rules');
    expect(answer.picks.map((p) => p.product.productId)).toEqual(['p1', 'p2']);
  });
});

describe('Telegram bot', () => {
  function bot(options: { linked?: boolean; tier?: string; features?: string[]; used?: number } = {}) {
    const store = new Map<string, string>();
    const redis = {
      set: jest.fn(async (k: string, v: string) => store.set(k, v)),
      incr: jest.fn(async () => options.used ?? 1),
      expire: jest.fn(),
    };
    const prisma = {
      notificationChannel: { findFirst: jest.fn(async () => (options.linked ? { userId: 'u1' } : null)) },
      sourceListing: { findFirst: jest.fn(async () => null) },
    };
    const entitlements = { getEntitlements: jest.fn(async () => ({ tier: options.tier ?? 'FREE', limits: { features: options.features ?? [] } })) };
    const search = { search: jest.fn(async () => ({ hits: [{ id: 'p1', slug: 'iphone-15', title: 'iPhone 15', titleAr: null, minPriceUsd: 41_499, listingCount: 3 }] })) };
    const extras = { forProduct: jest.fn(async () => ({ installments: { access: 'locked', count: 2 } })) };
    const config = { get: jest.fn((key: string, d: unknown) => (key === 'app.frontendUrl' ? 'https://pricelens.work.gd' : d)) };
    const service = new TelegramBotService(prisma as never, { client: redis } as never, entitlements as never, search as never, extras as never, {} as never, config as never);
    return { service, store, search: { search: search.search } };
  }
  const say = (text: string, extra: Record<string, unknown> = {}) => ({ message: { chat: { id: 42 }, text, ...extra } });

  it('stores an alert-linking code for the notifications page to find', async () => {
    const { service, store } = bot();
    await expect(service.respond('42', say('a1b2c3d4'))).resolves.toContain('تم استلام الرمز');
    expect(store.get(VERIFY_KEY('A1B2C3D4'))).toBe('42');
  });

  it('answers a product name with prices and a link', async () => {
    const reply = await bot().service.respond('42', say('iphone 15'));
    expect(reply).toContain('41,499 ج.م');
    expect(reply).toContain('<b>iPhone 15</b>');
    expect(reply).toContain('2 خطة تقسيط');

    const card = await bot().service.card('iphone 15');
    expect(card.buttons?.[0]?.[0]).toMatchObject({ url: 'https://pricelens.work.gd/products/iphone-15' });
    expect(card.buttons?.[card.buttons.length - 1]?.[0]?.callback_data).toMatch(/^r:[0-9a-f]{12}$/);
  });

  it('escapes HTML in titles so a product name cannot break the message', async () => {
    const { service, search } = bot();
    search.search.mockResolvedValueOnce({ hits: [{ id: 'p1', slug: 's', title: 'TV <55"> & stand', titleAr: null, minPriceUsd: 9000, listingCount: 1 }] });
    const card = await service.card('tv');
    expect(card.text).toContain('TV &lt;55"&gt; &amp; stand');
    expect(card.text).not.toContain('<55');
  });

  it('puts the same fingerprint on two searches that show the same prices', async () => {
    const { service } = bot();
    expect((await service.card('iphone')).prices).toBe((await service.card('iphone')).prices);
  });

  describe('live message', () => {
    const calls = (post: jest.SpyInstance) => post.mock.calls.map(([url, body]) => [String(url).split('/').pop(), body as Record<string, unknown>] as const);
    afterEach(() => jest.restoreAllMocks());

    it('shows a searching message first, then edits it into the answer', async () => {
      const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: { ok: true, result: { message_id: 7 } } });
      await bot().service.handle(say('iphone 15'));
      const made = calls(post);
      expect(made.map(([method]) => method)).toEqual(['sendChatAction', 'sendMessage', 'editMessageText']);
      expect(made[1][1]).toMatchObject({ parse_mode: 'HTML' });
      expect(String(made[1][1].text)).toContain('جاري البحث');
      expect(made[2][1]).toMatchObject({ message_id: 7, parse_mode: 'HTML' });
      expect(String(made[2][1].text)).toContain('41,499 ج.م');
    });

    it('refreshes the same message when the button is pressed', async () => {
      const { service, store } = bot();
      const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: { ok: true, result: { message_id: 7 } } });
      const card = await service.card('iphone 15');
      const callbackData = card.buttons![card.buttons!.length - 1][0].callback_data!;
      const key = [...store.keys()].find((k) => k.startsWith('tg-q:'));
      expect(store.get(key!)).toBe('iphone 15');
      (service as unknown as { cache: { client: { get: (k: string) => Promise<string> } } }).cache.client.get = async () => 'iphone 15';
      await service.handle({ callback_query: { id: 'cb1', data: callbackData, message: { message_id: 9, chat: { id: 42 } } } });
      const made = calls(post);
      expect(made.map(([method]) => method)).toEqual(['answerCallbackQuery', 'editMessageText']);
      expect(made[1][1]).toMatchObject({ chat_id: '42', message_id: 9 });
    });

    it('says so when the refresh button is too old', async () => {
      const { service } = bot();
      const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: { ok: true } });
      (service as unknown as { cache: { client: { get: (k: string) => Promise<null> } } }).cache.client.get = async () => null;
      await service.handle({ callback_query: { id: 'cb1', data: 'r:abcdef123456', message: { message_id: 9, chat: { id: 42 } } } });
      expect(calls(post).map(([method]) => method)).toEqual(['answerCallbackQuery']);
    });
  });

  it('turns a store link into a search', async () => {
    const { service } = bot();
    expect(await service.queryFromLink('https://www.amazon.eg/Apple-iPhone-15-128-GB/dp/B0CHX1W1XY')).toBe('Apple iPhone 15 128 GB');
  });

  it('keeps photos for linked paid plans, and caps free chats', async () => {
    await expect(bot().service.respond('42', say('', { photo: [{ file_id: 'f' }] }))).resolves.toContain('Plus');
    await expect(bot({ used: 11 }).service.respond('42', say('iphone'))).resolves.toContain('اليومي المجاني');
  });
});
