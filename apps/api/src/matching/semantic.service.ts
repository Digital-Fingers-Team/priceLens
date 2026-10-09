// apps/api/src/matching/semantic.service.ts
import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { isPhoneAccessory } from './text/phone-accessory';

/** After a failed call, skip the provider this long instead of retrying per pair. */
const PAUSE_AFTER_FAILURE_MS = 5 * 60 * 1000;
/** A rate limit (429) clears within a minute on Gemini's per-minute quotas. */
const PAUSE_AFTER_RATE_LIMIT_MS = 60 * 1000;
/** Waits before retrying an overloaded (5xx) call; then the provider is paused. */
const OVERLOADED_RETRY_DELAYS_MS = [1_000, 3_000];
const CALL_TIMEOUT_MS = 45_000;
/** Titles asked about in one judgeMany request. */
const BATCH_SIZE = 8;
/** Room for a model that thinks before answering; a verdict itself is a few bytes. */
const JUDGEMENT_MAX_TOKENS = 256;
/** ~40 translated titles (~60 tokens each), plus thinking. */
const TRANSLATION_MAX_TOKENS = 8192;
const ARABIC_LETTER = /[ء-ي]/;

/** A provider answered with an HTTP error status. */
class ProviderHttpError extends Error {
  constructor(
    provider: string,
    readonly status: number,
    /** The provider said a per-day quota is spent (Gemini's quotaId names it). */
    readonly dailyQuota = false,
  ) {
    super(`${provider} HTTP ${status}${dailyQuota ? ' (daily quota spent)' : ''}`);
  }
}

/** A daily quota comes back hours later; asking every minute until then is noise. */
const PAUSE_AFTER_DAILY_QUOTA_MS = 60 * 60 * 1000;


/**
 * One way to ask: a provider, one of its API keys and one model. Free-tier
 * quotas are per key and per model, so each slot is paused on its own.
 */
interface Slot {
  name: 'gemini' | 'openrouter';
  model: string;
  /** For logs: provider, model and position -- never the key. */
  label: string;
  ask: (prompt: string, maxTokens: number) => Promise<string | null>;
  pausedUntil: number;
}

/** A comma-separated setting as a list, first the single-value setting it extends. */
function list(...values: Array<string | undefined>): string[] {
  const items = values.flatMap((value) => (value ?? '').split(',')).map((item) => item.trim()).filter(Boolean);
  return [...new Set(items)];
}

/**
 * The AI judge: asks a cloud model whether two listing titles are the same
 * product for sale.
 *
 * It holds a chain of slots: every Gemini key (GEMINI_API_KEY, then
 * GEMINI_API_KEYS) with every model (GEMINI_MATCH_MODEL, then
 * GEMINI_MATCH_MODELS), then OpenRouter (OPENROUTER_API_KEY). A call goes to
 * the first slot that is not paused; a slot that fails is paused on its own
 * and the next one is asked straight away, so one spent quota no longer
 * stops the judge.
 *
 * Every answer is stored (match_judgements), so a pair is asked once, and a
 * stored answer is returned even while every slot is down.
 *
 * Returns null when there is no answer (no slot, every slot paused or
 * failing, unparseable reply), so callers can tell "different" from
 * "couldn't ask" and fall back to their own rules.
 */
@Injectable()
export class SemanticService {
  private readonly logger = new Logger(SemanticService.name);
  private readonly slots: Slot[];
  private warnedUnconfigured = false;
  private nextSlot = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.slots = this.buildSlots();
  }

  /** Some slot is configured and not paused after a failure. */
  isAvailable(): boolean {
    const now = Date.now();
    return this.slots.some((slot) => now >= slot.pausedUntil);
  }

  async judgeSameProduct(titleA: string, titleB: string): Promise<boolean | null> {
    if (isPhoneAccessory(titleA) || isPhoneAccessory(titleB)) return null;
    if (this.slots.length === 0) {
      if (!this.warnedUnconfigured) {
        // Logged once per process: this fires for every candidate pair.
        this.warnedUnconfigured = true;
        this.logger.warn(
          'Match judgement disabled: no GEMINI_API_KEY or OPENROUTER_API_KEY (or OPENROUTER_FALLBACK_ENABLED=false). ' +
            'Matching and reconciliation rely on the code rules alone. This message is logged once.',
        );
      }
      return null;
    }

    const pairKey = this.pairKey(titleA, titleB);
    const stored = await this.prisma.matchJudgement
      .findUnique({ where: { pairKey }, select: { same: true } })
      .catch(() => null);
    if (stored) return stored.same;

    const answer = await this.askSlots(this.prompt(titleA, titleB), (content) => this.parse(content));
    if (!answer) return null;
    await this.store(titleA, titleB, answer.value, answer.model);
    return answer.value;
  }

  /**
   * Several titles against one, up to BATCH_SIZE per request: the offer
   * audit asks about a product's offers together, ingestion about a
   * listing's candidates. Stored answers are not asked again. Answers are in
   * the order of `others`, null where there is none.
   */
  async judgeMany(anchor: string, others: string[]): Promise<Array<boolean | null>> {
    // Phone cases and screen protectors are not worth the free quota: on
    // 2026-10-09 they were 37% of all judgements (mostly AliExpress cases
    // compared with each other). Unasked, a case founds its own product.
    if (isPhoneAccessory(anchor)) return others.map(() => null);
    const verdicts: Array<boolean | null> = others.map(() => null);
    if (this.slots.length === 0) return verdicts;

    const unasked: number[] = [];
    for (const [index, other] of others.entries()) {
      const stored = await this.prisma.matchJudgement
        .findUnique({ where: { pairKey: this.pairKey(anchor, other) }, select: { same: true } })
        .catch(() => null);
      if (stored) verdicts[index] = stored.same;
      else unasked.push(index);
    }

    for (let start = 0; start < unasked.length; start += BATCH_SIZE) {
      const chunk = unasked.slice(start, start + BATCH_SIZE);
      const titles = chunk.map((index) => others[index]);
      const answer = await this.askSlots(this.batchPrompt(anchor, titles), (content) =>
        this.parseMany(content, titles.length),
      );
      if (!answer) continue;
      for (const [position, index] of chunk.entries()) {
        verdicts[index] = answer.value[position];
        await this.store(anchor, others[index], answer.value[position], answer.model);
      }
    }
    return verdicts;
  }

  /**
   * Product titles in Arabic, as Egyptian stores write them, for the Arabic
   * site. One request for the whole list (callers send up to ~40). Answers
   * are in order; null for a title without a usable translation, and all
   * null when no slot answers or the reply is malformed.
   */
  async translateToArabic(titles: string[]): Promise<Array<string | null>> {
    const none = titles.map(() => null);
    if (this.slots.length === 0 || titles.length === 0) return none;
    const numbered = titles.map((title, index) => `${index + 1}. "${title}"`).join('\n');
    const prompt = `Translate these product titles from Egyptian online stores into Arabic, the way Amazon.eg, noon and B.TECH write their Arabic listings.
Write the product type and descriptive words in Arabic, and well-known brand names in Arabic script as Egyptian stores do (e.g. سامسونج، شاومي، ابل، ال جي، توشيبا). Keep model names and codes, numbers, units (GB, TB, mAh, W, Hz, inch) and technology names (Wi-Fi, 5G, OLED) exactly as written in Latin letters. Do not add or drop information. A title that is already Arabic is returned unchanged.

${numbered}

Respond with ONLY this JSON object and nothing else: {"ar": [${titles.length} Arabic titles, in order]}`;

    const answer = await this.askSlots(
      prompt,
      (content) => {
        if (!content) return null;
        try {
          const parsed = JSON.parse(content.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) as { ar?: unknown };
          return Array.isArray(parsed.ar) && parsed.ar.length === titles.length ? (parsed.ar as unknown[]) : null;
        } catch {
          return null;
        }
      },
      TRANSLATION_MAX_TOKENS,
    );
    if (!answer) return none;
    return answer.value.map((value) =>
      typeof value === 'string' && ARABIC_LETTER.test(value) ? value.trim() : null,
    );
  }

  /**
   * The first slot that answers, failing over as described on the class.
   * Each call starts one slot further along, so calls made at the same time
   * go to different keys instead of queueing on one quota.
   */
  private async askSlots<T>(
    prompt: string,
    parse: (content: string | null) => T | null,
    maxTokens = JUDGEMENT_MAX_TOKENS,
  ): Promise<{ value: T; model: string } | null> {
    const start = this.nextSlot++ % this.slots.length;
    for (const slot of [...this.slots.slice(start), ...this.slots.slice(0, start)]) {
      if (Date.now() < slot.pausedUntil) continue;
      try {
        const value = parse(await this.askWithRetry(slot, prompt, maxTokens));
        return value === null ? null : { value, model: `${slot.name}:${slot.model}` };
      } catch (err) {
        const rateLimited = err instanceof ProviderHttpError && err.status === 429;
        const pauseMs =
          err instanceof ProviderHttpError && err.dailyQuota
            ? PAUSE_AFTER_DAILY_QUOTA_MS
            : rateLimited
              ? PAUSE_AFTER_RATE_LIMIT_MS
              : PAUSE_AFTER_FAILURE_MS;
        slot.pausedUntil = Date.now() + pauseMs;
        this.logger.warn(`${slot.label} match-judgement call failed, pausing it for ${pauseMs / 1000}s: ${(err as Error).message}`);
      }
    }
    return null;
  }

  private async store(titleA: string, titleB: string, same: boolean, model: string): Promise<void> {
    await this.prisma.matchJudgement
      .create({ data: { pairKey: this.pairKey(titleA, titleB), titleA, titleB, same, model } })
      .catch(() => undefined); // a concurrent caller stored the same pair first
  }

  /** Overridable in tests. */
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /** An overloaded provider (5xx) usually answers a moment later: retry it a couple of times. */
  private async askWithRetry(slot: Slot, prompt: string, maxTokens: number): Promise<string | null> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await slot.ask(prompt, maxTokens);
      } catch (err) {
        const overloaded = err instanceof ProviderHttpError && err.status >= 500;
        if (!overloaded || attempt >= OVERLOADED_RETRY_DELAYS_MS.length) throw err;
        await this.sleep(OVERLOADED_RETRY_DELAYS_MS[attempt]);
      }
    }
  }

  private buildSlots(): Slot[] {
    if (!this.config.get<boolean>('search.openRouterFallbackEnabled', true)) return [];
    const slots: Slot[] = [];

    const geminiKeys = list(this.config.get<string>('search.geminiApiKey', ''), this.config.get<string>('search.geminiApiKeys', ''));
    const geminiModels = list(
      this.config.get<string>('search.geminiMatchModel', 'gemini-2.5-flash-lite'),
      this.config.get<string>('search.geminiMatchModels', ''),
    );
    const geminiBase = this.config.get<string>('search.geminiBaseUrl', 'https://generativelanguage.googleapis.com/v1beta');
    geminiKeys.forEach((key, keyIndex) => {
      for (const model of geminiModels) {
        slots.push({
          name: 'gemini',
          model,
          label: `gemini key #${keyIndex + 1} ${model}`,
          ask: (prompt, maxTokens) => this.askGemini(geminiBase, key, model, prompt, maxTokens),
          pausedUntil: 0,
        });
      }
    });

    const openRouterKey = this.config.get<string>('search.openRouterApiKey', '');
    if (openRouterKey) {
      const model = this.config.get<string>('search.openRouterMatchModel', 'google/gemini-2.5-flash');
      const baseUrl = this.config.get<string>('search.openRouterBaseUrl', 'https://openrouter.ai/api/v1');
      slots.push({
        name: 'openrouter',
        model,
        label: `openrouter ${model}`,
        ask: (prompt, maxTokens) => this.askOpenRouter(baseUrl, openRouterKey, model, prompt, maxTokens),
        pausedUntil: 0,
      });
    }
    return slots;
  }

  private async askGemini(
    baseUrl: string,
    key: string,
    model: string,
    prompt: string,
    maxTokens: number,
  ): Promise<string | null> {
    const response = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    if (!response.ok) {
      const body = response.status === 429 ? await response.json().catch(() => null) : null;
      throw new ProviderHttpError('Gemini', response.status, /PerDay/.test(JSON.stringify(body ?? '')));
    }
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') || null;
  }

  private async askOpenRouter(
    baseUrl: string,
    key: string,
    model: string,
    prompt: string,
    maxTokens: number,
  ): Promise<string | null> {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        // Explicit and small: some models (e.g. Gemini, which reserves an
        // internal "thinking" budget by default) will otherwise request a huge
        // max_tokens and fail with a 402 credits error on a low-balance
        // account before producing any output.
        max_tokens: Math.min(maxTokens, 2048),
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    if (!response.ok) throw new ProviderHttpError('OpenRouter', response.status);
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? null;
  }

  private parse(content: string | null): boolean | null {
    if (!content) return null;
    try {
      const parsed = JSON.parse(content.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) as { same?: unknown };
      return typeof parsed.same === 'boolean' ? parsed.same : null;
    } catch {
      return null;
    }
  }

  /** One boolean per asked title, or null when the reply is not exactly that. */
  private parseMany(content: string | null, count: number): boolean[] | null {
    if (!content) return null;
    try {
      const parsed = JSON.parse(content.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) as { same?: unknown };
      const same = parsed.same;
      return Array.isArray(same) && same.length === count && same.every((v) => typeof v === 'boolean') ? same : null;
    } catch {
      return null;
    }
  }

  /** The judge's stored answer for a pair, or null when it was never asked. No model call. */
  async storedVerdict(titleA: string, titleB: string): Promise<boolean | null> {
    const stored = await this.prisma.matchJudgement
      .findUnique({ where: { pairKey: this.pairKey(titleA, titleB) }, select: { same: true } })
      .catch(() => null);
    return stored ? stored.same : null;
  }

  /** Order-independent: (a, b) and (b, a) are one pair. */
  private pairKey(titleA: string, titleB: string): string {
    const [first, second] = [titleA, titleB].map((title) => title.trim().toLowerCase().replace(/\s+/g, ' ')).sort();
    return createHash('sha256').update(`${first}\n${second}`).digest('hex');
  }

  private prompt(titleA: string, titleB: string): string {
    return `You are a strict product-matching assistant for an e-commerce price-comparison site.
Given two product titles from two different online stores, decide if they describe the same product for sale — ${RULES}

Product A: "${titleA}"
Product B: "${titleB}"

Respond with ONLY this JSON object and nothing else: {"same": true or false}`;
  }

  private batchPrompt(anchor: string, titles: string[]): string {
    const numbered = titles.map((title, index) => `${index + 1}. "${title}"`).join('\n');
    return `You are a strict product-matching assistant for an e-commerce price-comparison site.
Given product A and a numbered list of titles from different online stores, decide for EACH listed title whether it describes the same product for sale as product A — ${RULES}

Product A: "${anchor}"
Titles:
${numbered}

Respond with ONLY this JSON object and nothing else: {"same": [${titles.length} true/false values, one per numbered title, in order]}`;
  }
}

const RULES = `same brand, same model, same storage and RAM, same size or pack — just worded differently by each store's copywriter. Titles may be in English or Arabic. Marketing filler words (e.g. "Unlocked", "Official Warranty", "Genuine") don't matter and should be ignored. COLOR DOES NOT MATTER: the same model in a different color is the same product here, because the site shows every color of a model on one page. But different storage/RAM/capacity, a different model tier (e.g. "Pro" vs base, "Pro+" vs "Pro", "Ultra" vs base, "Max" vs base, "Mini" vs base), a different model number/code (e.g. "F6000" vs "H5000F"), new vs used/refurbished, a bundle vs the item alone, a spare part or accessory vs the device itself, or a different size or pack count (500ml vs 1L, 1 can vs 6 cans) means they are NOT the same product. If one title states the RAM or storage and the other does not, answer false.`;
