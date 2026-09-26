// apps/api/src/matching/semantic.service.ts
import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';

/** After a failed call, skip the provider this long instead of retrying per pair. */
const PAUSE_AFTER_FAILURE_MS = 5 * 60 * 1000;
const CALL_TIMEOUT_MS = 45_000;

interface Provider {
  name: 'gemini' | 'openrouter';
  model: string;
  ask: (prompt: string) => Promise<string | null>;
}

/**
 * The AI judge: asks a cloud model whether two listing titles are the same
 * product for sale. Gemini (GEMINI_API_KEY) is used when configured, else
 * OpenRouter (OPENROUTER_API_KEY), else there is no judge.
 *
 * Every answer is stored (match_judgements), so a pair is asked once, and a
 * stored answer is returned even while the provider is down. After a failed
 * call the provider is skipped for a few minutes.
 *
 * Returns null when there is no answer (no provider, provider paused or
 * failing, unparseable reply), so callers can tell "different" from
 * "couldn't ask" and fall back to their own rules.
 */
@Injectable()
export class SemanticService {
  private readonly logger = new Logger(SemanticService.name);
  private readonly provider: Provider | null;
  private pausedUntil = 0;
  private warnedUnconfigured = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.provider = this.pickProvider();
  }

  /** A provider is configured and not paused after a failure. */
  isAvailable(): boolean {
    return this.provider !== null && Date.now() >= this.pausedUntil;
  }

  async judgeSameProduct(titleA: string, titleB: string): Promise<boolean | null> {
    if (!this.provider) {
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

    if (Date.now() < this.pausedUntil) return null;

    try {
      const same = this.parse(await this.provider.ask(this.prompt(titleA, titleB)));
      if (same === null) return null;
      await this.prisma.matchJudgement
        .create({ data: { pairKey, titleA, titleB, same, model: `${this.provider.name}:${this.provider.model}` } })
        .catch(() => undefined); // a concurrent caller stored the same pair first
      return same;
    } catch (err) {
      this.pausedUntil = Date.now() + PAUSE_AFTER_FAILURE_MS;
      this.logger.warn(
        `${this.provider.name} match-judgement call failed, pausing it for ${PAUSE_AFTER_FAILURE_MS / 60_000} min: ` +
          (err as Error).message,
      );
      return null;
    }
  }

  private pickProvider(): Provider | null {
    if (!this.config.get<boolean>('search.openRouterFallbackEnabled', true)) return null;

    const geminiKey = this.config.get<string>('search.geminiApiKey', '');
    if (geminiKey) {
      const model = this.config.get<string>('search.geminiMatchModel', 'gemini-2.5-flash-lite');
      const baseUrl = this.config.get<string>('search.geminiBaseUrl', 'https://generativelanguage.googleapis.com/v1beta');
      return { name: 'gemini', model, ask: (prompt) => this.askGemini(baseUrl, geminiKey, model, prompt) };
    }

    const openRouterKey = this.config.get<string>('search.openRouterApiKey', '');
    if (openRouterKey) {
      const model = this.config.get<string>('search.openRouterMatchModel', 'google/gemini-2.5-flash');
      const baseUrl = this.config.get<string>('search.openRouterBaseUrl', 'https://openrouter.ai/api/v1');
      return { name: 'openrouter', model, ask: (prompt) => this.askOpenRouter(baseUrl, openRouterKey, model, prompt) };
    }
    return null;
  }

  private async askGemini(baseUrl: string, key: string, model: string, prompt: string): Promise<string | null> {
    const response = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        // Room for a model that thinks before answering; the answer itself is a few bytes.
        generationConfig: { temperature: 0, maxOutputTokens: 256, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') || null;
  }

  private async askOpenRouter(baseUrl: string, key: string, model: string, prompt: string): Promise<string | null> {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        // The answer is a few bytes of JSON, but some models (e.g. Gemini,
        // which reserves an internal "thinking" budget by default) will
        // otherwise request a huge max_tokens and fail with a 402 credits
        // error on a low-balance account before producing any output.
        max_tokens: 50,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}`);
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

  /** Order-independent: (a, b) and (b, a) are one pair. */
  private pairKey(titleA: string, titleB: string): string {
    const [first, second] = [titleA, titleB].map((title) => title.trim().toLowerCase().replace(/\s+/g, ' ')).sort();
    return createHash('sha256').update(`${first}\n${second}`).digest('hex');
  }

  private prompt(titleA: string, titleB: string): string {
    return `You are a strict product-matching assistant for an e-commerce price-comparison site.
Given two product titles from two different online stores, decide if they describe the same product for sale — same brand, same model, same storage and RAM, same size or pack — just worded differently by each store's copywriter. Titles may be in English or Arabic. Marketing filler words (e.g. "Unlocked", "Official Warranty", "Genuine") don't matter and should be ignored. COLOR DOES NOT MATTER: the same model in a different color is the same product here, because the site shows every color of a model on one page. But different storage/RAM/capacity, a different model tier (e.g. "Pro" vs base, "Pro+" vs "Pro", "Ultra" vs base, "Max" vs base, "Mini" vs base), a different model number/code (e.g. "F6000" vs "H5000F"), new vs used/refurbished, a bundle vs the item alone, a spare part or accessory vs the device itself, or a different size or pack count (500ml vs 1L, 1 can vs 6 cans) means they are NOT the same product. If one title states the RAM or storage and the other does not, answer false.

Product A: "${titleA}"
Product B: "${titleB}"

Respond with ONLY this JSON object and nothing else: {"same": true or false}`;
  }
}
