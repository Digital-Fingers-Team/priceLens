import { ConfigService } from '@nestjs/config';
import { SemanticService } from '../../src/matching/semantic.service';

/**
 * Prod, 2026-09-29: Gemini answered 503 (overloaded) and 429 (rate limited)
 * 38 times in 8 hours, and every one paused the judge for 5 minutes -- about
 * 40% of the night without it.
 */
function service() {
  const config = {
    get: (key: string, fallback: unknown) =>
      ({ 'search.geminiApiKey': 'test-key', 'search.geminiMatchModel': 'gemini-test' } as Record<string, unknown>)[key] ?? fallback,
  } as ConfigService;
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
