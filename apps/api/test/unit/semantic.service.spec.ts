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
