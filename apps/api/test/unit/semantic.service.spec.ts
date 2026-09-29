import { ConfigService } from '@nestjs/config';
import { SemanticService } from '../../src/matching/semantic.service';

/**
 * Prod, 2026-09-29: Gemini answered 503 (overloaded) and 429 (rate limited)
 * 38 times in 8 hours, and every one paused the judge for 5 minutes -- about
 * 40% of the night without it.
 */
function service(settings: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = { 'search.geminiApiKey': 'test-key', 'search.geminiMatchModel': 'gemini-test', ...settings };
  const config = { get: (key: string, fallback: unknown) => values[key] ?? fallback } as ConfigService;
  const prisma = { matchJudgement: { findUnique: jest.fn(async () => null), create: jest.fn(async () => ({})) } };
  const semantic = new SemanticService(config, prisma as never);
  semantic.sleep = async () => undefined;
  return semantic;
}

const answer = (status: number, same?: boolean) =>
  ({
    ok: status === 200,
    status,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ same }) }] } }] }),
  }) as Response;

describe('SemanticService when Gemini is busy', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.useRealTimers();
  });

  it('retries an overloaded (503) call and answers, without pausing', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(answer(503)).mockResolvedValueOnce(answer(200, true)) as never;
    const semantic = service();

    expect(await semantic.judgeSameProduct('LG GTF402SVAN', 'LG Refrigerator GTF402SVAN')).toBe(true);
    expect(semantic.isAvailable()).toBe(true);
  });

  it('falls over to the next key when one hits its quota, and keeps the spent one paused', async () => {
    const keys: string[] = [];
    global.fetch = jest.fn(async (_url: string, init: RequestInit) => {
      const key = (init.headers as Record<string, string>)['x-goog-api-key'];
      keys.push(key);
      return key === 'test-key' ? answer(429) : answer(200, false);
    }) as never;
    const semantic = service({ 'search.geminiApiKeys': 'second-key' });

    expect(await semantic.judgeSameProduct('a', 'b')).toBe(false);
    expect(await semantic.judgeSameProduct('c', 'd')).toBe(false);
    // The spent key is asked once; the next call goes straight to the second.
    expect(keys).toEqual(['test-key', 'second-key', 'second-key']);
    expect(semantic.isAvailable()).toBe(true);
  });

  it('tries each model on a key before giving up (free quotas are per model)', async () => {
    const models: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      const model = /models\/([^:]+):/.exec(url)?.[1] ?? '';
      models.push(model);
      return model === 'gemini-test' ? answer(429) : answer(200, true);
    }) as never;
    const semantic = service({ 'search.geminiMatchModels': 'gemini-test,gemini-other' });

    expect(await semantic.judgeSameProduct('a', 'b')).toBe(true);
    expect(models).toEqual(['gemini-test', 'gemini-other']);
  });

  it('is unavailable only when every slot is paused', async () => {
    global.fetch = jest.fn(async () => answer(429)) as never;
    const semantic = service({ 'search.geminiApiKeys': 'second-key' });

    expect(await semantic.judgeSameProduct('a', 'b')).toBeNull();
    expect(semantic.isAvailable()).toBe(false);
  });

  describe('judgeMany: several titles against one in a single request', () => {
    const many = (verdicts: boolean[]) =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ same: verdicts }) }] } }] }),
      }) as Response;

    it('asks about all the titles in one request and stores each answer', async () => {
      global.fetch = jest.fn().mockResolvedValue(many([true, false, true])) as never;
      const semantic = service();

      expect(await semantic.judgeMany('Insta360 X5', ['Insta360 X5 Black', 'Insta360 X3', 'Insta360 X5 Standard'])).toEqual([
        true,
        false,
        true,
      ]);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(((global.fetch as jest.Mock).mock.calls[0][1] as RequestInit).body as string);
      const prompt = body.contents[0].parts[0].text as string;
      expect(prompt).toContain('1. "Insta360 X5 Black"');
      expect(prompt).toContain('3. "Insta360 X5 Standard"');
    });

    it('splits a long list into requests of at most 8', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(many(Array(8).fill(false)))
        .mockResolvedValueOnce(many([true, true])) as never;
      const semantic = service();

      const verdicts = await semantic.judgeMany('anchor', Array.from({ length: 10 }, (_, i) => `offer ${i}`));
      expect(verdicts).toEqual([...Array(8).fill(false), true, true]);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('answers nothing for a batch whose reply has the wrong length', async () => {
      global.fetch = jest.fn().mockResolvedValue(many([true])) as never;
      const semantic = service();

      expect(await semantic.judgeMany('anchor', ['a', 'b'])).toEqual([null, null]);
    });

    it('falls over to the next slot for a batch, like a single question', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce(answer(429)).mockResolvedValueOnce(many([false, true])) as never;
      const semantic = service({ 'search.geminiApiKeys': 'second-key' });

      expect(await semantic.judgeMany('anchor', ['a', 'b'])).toEqual([false, true]);
    });
  });

  it('sends calls made at the same time to different keys', async () => {
    const keys: string[] = [];
    global.fetch = jest.fn(async (_url: string, init: RequestInit) => {
      keys.push((init.headers as Record<string, string>)['x-goog-api-key']);
      return answer(200, true);
    }) as never;
    const semantic = service({ 'search.geminiApiKeys': 'second-key' });

    await Promise.all([semantic.judgeSameProduct('a', 'b'), semantic.judgeSameProduct('c', 'd')]);
    expect(keys.sort()).toEqual(['second-key', 'test-key']);
  });

  it('pauses only one minute after a rate limit (429)', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-29T09:00:00Z'));
    global.fetch = jest.fn().mockResolvedValue(answer(429)) as never;
    const semantic = service();

    expect(await semantic.judgeSameProduct('a', 'b')).toBeNull();
    expect(semantic.isAvailable()).toBe(false);
    jest.setSystemTime(new Date('2026-09-29T09:01:01Z'));
    expect(semantic.isAvailable()).toBe(true);
  });
});
