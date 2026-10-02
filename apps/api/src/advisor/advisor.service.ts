import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../common/errors/app.exception';
import { RedisCacheService } from '../common/cache/redis-cache.service';
import { DealHunterMatch, DealHunterService } from '../deal-hunter/deal-hunter.service';
import { LlmService } from '../llm/llm.service';

export interface AdvisorPick {
  product: DealHunterMatch;
  why: string;
  tradeoff: string | null;
}

export interface AdvisorAnswer {
  /** The search we ran, in Deal Hunter's words. */
  query: string;
  interpretation: string;
  picks: AdvisorPick[];
  /** 'model' when the model chose and explained; 'rules' when Deal Hunter's own ranking was used. */
  generatedBy: 'model' | 'rules';
  notice: string | null;
}

const ARABIC = /[؀-ۿ]/;

export function validateRewrite(value: unknown): { query: string } | null {
  const v = value as { query?: unknown } | null;
  const query = typeof v?.query === 'string' ? v.query.trim().slice(0, 160) : '';
  return query.length >= 3 ? { query } : null;
}

/**
 * Only products we offered may come back, each once, at most three. Text is
 * trimmed; anything else the model says is dropped. Prices, specs and links
 * always come from our own data, never from the model's answer.
 */
export function validatePicks(value: unknown, candidateIds: Set<string>): Array<{ productId: string; why: string; tradeoff: string | null }> | null {
  const picks = (value as { picks?: unknown } | null)?.picks;
  if (!Array.isArray(picks)) return null;
  const seen = new Set<string>();
  const result: Array<{ productId: string; why: string; tradeoff: string | null }> = [];
  for (const pick of picks) {
    const p = pick as { productId?: unknown; why?: unknown; tradeoff?: unknown };
    if (typeof p.productId !== 'string' || !candidateIds.has(p.productId) || seen.has(p.productId)) continue;
    if (typeof p.why !== 'string' || !p.why.trim()) continue;
    seen.add(p.productId);
    result.push({
      productId: p.productId,
      why: p.why.trim().slice(0, 400),
      tradeoff: typeof p.tradeoff === 'string' && p.tradeoff.trim() ? p.tradeoff.trim().slice(0, 300) : null,
    });
    if (result.length === 3) break;
  }
  return result.length > 0 ? result : null;
}

/**
 * "Laptop for programming, 30k EGP" → three products we actually track, with
 * current prices from our data and the reasons and trade-offs explained.
 *
 * Grounded by construction: the model never searches. Deal Hunter finds the
 * candidates in our catalogue; the model may only choose among them and
 * explain the choice. Without a model, Deal Hunter's own top three and its
 * data-backed reasons are the answer.
 */
@Injectable()
export class AdvisorService {
  private readonly logger = new Logger(AdvisorService.name);

  constructor(
    private readonly dealHunter: DealHunterService,
    private readonly llm: LlmService,
    private readonly cache: RedisCacheService,
    private readonly config: ConfigService,
  ) {}

  async advise(userId: string, message: string): Promise<AdvisorAnswer> {
    await this.spend(userId);
    const arabic = ARABIC.test(message);

    const rewrite = this.llm.isAvailable()
      ? await this.llm.json(
          {
            prompt: `Turn this shopping request (Egypt, prices in EGP) into one short English product search with its constraints, like "laptop under 30000 with 16GB ram" or "phone between 10000 and 15000 with 256GB". Convert "30k", "30 ألف" and Arabic digits to plain numbers. Keep only what was asked; invent nothing.
Return JSON: {"query": "..."}
Request: ${JSON.stringify(message.slice(0, 500))}`,
            maxTokens: 200,
          },
          validateRewrite,
        )
      : null;
    const query = rewrite?.value.query ?? message.slice(0, 160);

    const hunt = await this.dealHunter.hunt(query, 10);
    const candidates = hunt.matches.filter((m) => m.price !== null);
    if (candidates.length === 0) {
      return { query, interpretation: hunt.interpretation, picks: [], generatedBy: 'rules', notice: hunt.notice ?? 'NO_MATCHES' };
    }

    const chosen = this.llm.isAvailable() ? await this.choose(message, candidates, arabic) : null;
    if (chosen) {
      const byId = new Map(candidates.map((c) => [c.productId, c]));
      return {
        query,
        interpretation: hunt.interpretation,
        picks: chosen.map((pick) => ({ product: byId.get(pick.productId)!, why: pick.why, tradeoff: pick.tradeoff })),
        generatedBy: 'model',
        notice: null,
      };
    }

    return {
      query,
      interpretation: hunt.interpretation,
      picks: candidates.slice(0, 3).map((product) => ({ product, why: product.reasons.join(' '), tradeoff: null })),
      generatedBy: 'rules',
      notice: null,
    };
  }

  private async choose(message: string, candidates: DealHunterMatch[], arabic: boolean) {
    const facts = candidates.map((c) => ({
      productId: c.productId,
      title: c.title,
      brand: c.brand,
      priceEGP: c.price,
      stores: c.storeCount,
      inStock: c.inStock,
      dealGrade: c.dealGrade,
      matchesRequest: c.matchScore,
      specsConfirmed: c.specsMatched,
      specsUnconfirmed: c.specsUnconfirmed,
    }));
    const answer = await this.llm.json(
      {
        prompt: `You are a careful shopping advisor in Egypt. The buyer asked: ${JSON.stringify(message.slice(0, 500))}
Here are the ONLY products you may recommend, with the facts we hold (prices are current, in EGP):
${JSON.stringify(facts)}
Choose up to 3 that best fit the request. For each, say why it fits and its main trade-off, using only these facts and general, well-known knowledge of the product line. Do not state prices, specs or features that are not in the facts. If a spec is unconfirmed, say it should be checked.
Write "why" and "tradeoff" in ${arabic ? 'Arabic (Egyptian Modern Standard)' : 'English'}, one or two sentences each.
Return JSON: {"picks": [{"productId": "...", "why": "...", "tradeoff": "..."}]}`,
        maxTokens: 1200,
      },
      (value) => validatePicks(value, new Set(candidates.map((c) => c.productId))),
    );
    if (answer) this.logger.log(`Advisor answered via ${answer.provider} with ${answer.value.length} pick(s)`);
    return answer?.value ?? null;
  }

  private async spend(userId: string): Promise<void> {
    const limit = this.config.get<number>('llm.advisorDailyLimit', 30);
    const key = `advisor:${userId}:${new Date().toISOString().slice(0, 10)}`;
    const used = await this.cache.client.incr(key);
    if (used === 1) await this.cache.client.expire(key, 2 * 24 * 60 * 60);
    if (used > limit) {
      throw new AppException(HttpStatus.TOO_MANY_REQUESTS, 'QUOTA_EXCEEDED', `You have asked the advisor ${limit} times today. More tomorrow.`);
    }
  }
}
