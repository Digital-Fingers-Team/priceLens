// apps/api/src/matching/semantic.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SemanticService {
  private readonly logger = new Logger(SemanticService.name);
  private readonly openRouterApiKey: string;
  private readonly openRouterBaseUrl: string;
  private readonly openRouterMatchModel: string;
  private readonly openRouterFallbackEnabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.openRouterApiKey = this.config.get<string>('search.openRouterApiKey', '');
    this.openRouterBaseUrl = this.config.get<string>('search.openRouterBaseUrl', 'https://openrouter.ai/api/v1');
    this.openRouterMatchModel = this.config.get<string>('search.openRouterMatchModel', 'google/gemini-2.5-flash');
    this.openRouterFallbackEnabled = this.config.get<boolean>('search.openRouterFallbackEnabled', true);
  }

  /**
   * Ask a cloud model whether two listing titles describe the exact same
   * product, just worded differently by each store's copywriter. Regex/text
   * overlap alone can't tell "Samsung Galaxy S26 - 256GB - Sky Blue" and
   * "Samsung Galaxy S26, Unlocked Android Smartphone... Galaxy AI... Sky Blue"
   * apart from two genuinely different phones — this can, because it reads
   * for meaning. Returns null if OpenRouter isn't reachable/configured, so
   * callers can tell "confirmed different" apart from "couldn't ask" and fall
   * back to the plain fuzzy-score threshold instead.
   */
  private warnedOpenRouterUnconfigured = false;

  async judgeSameProduct(titleA: string, titleB: string): Promise<boolean | null> {
    if (!this.openRouterFallbackEnabled || !this.openRouterApiKey) {
      // Logged once per process: this fires for every candidate pair, and at
      // thousands of repetitions it buries genuine errors in the log.
      if (!this.warnedOpenRouterUnconfigured) {
        this.warnedOpenRouterUnconfigured = true;
        this.logger.warn(
          'Match judgement disabled: OpenRouter not configured (OPENROUTER_API_KEY unset or ' +
            'fallback disabled). Reconciliation will rely on model agreement plus the ' +
            'hard-conflict guards. This message is logged once.',
        );
      }
      return null;
    }

    const prompt = `You are a strict product-matching assistant for an e-commerce price-comparison site.
Given two product titles from two different online stores, decide if they describe the same product for sale — same brand, same model, same storage and RAM, same size or pack — just worded differently by each store's copywriter. Titles may be in English or Arabic. Marketing filler words (e.g. "Unlocked", "Official Warranty", "Genuine") don't matter and should be ignored. COLOR DOES NOT MATTER: the same model in a different color is the same product here, because the site shows every color of a model on one page. But different storage/RAM/capacity, a different model tier (e.g. "Pro" vs base, "Ultra" vs base, "Max" vs base, "Mini" vs base), a different model number/code (e.g. "F6000" vs "H5000F"), new vs used/refurbished, a bundle vs the item alone, or a different size or pack count (500ml vs 1L, 1 can vs 6 cans) means they are NOT the same product. If one title states the RAM or storage and the other does not, answer false.

Product A: "${titleA}"
Product B: "${titleB}"

Respond with ONLY this JSON object and nothing else: {"same": true or false}`;

    try {
      const response = await fetch(`${this.openRouterBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.openRouterApiKey}`,
        },
        body: JSON.stringify({
          model: this.openRouterMatchModel,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0,
          // The answer is a few bytes of JSON, but some models (e.g. Gemini,
          // which reserves an internal "thinking" budget by default) will
          // otherwise request a huge max_tokens and fail with a 402 credits
          // error on a low-balance account before producing any output.
          max_tokens: 50,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(45_000),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) return null;
      const parsed = JSON.parse(content) as { same?: boolean };
      return typeof parsed.same === 'boolean' ? parsed.same : null;
    } catch (err) {
      this.logger.warn(`OpenRouter match-judgement call failed: ${(err as Error).message}`);
      return null;
    }
  }
}
