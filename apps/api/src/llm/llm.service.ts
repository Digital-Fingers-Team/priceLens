import { Inject, Injectable, Logger } from '@nestjs/common';
import { LLM_PROVIDERS, LlmHttpError, LlmProvider, LlmRequest } from './llm-provider';

const PAUSE_AFTER_RATE_LIMIT_MS = 60_000;
const PAUSE_AFTER_FAILURE_MS = 5 * 60_000;

/**
 * Asks the configured models in order (Claude when keyed, then Gemini),
 * skipping one that just failed, and parses the JSON answer. Returns null —
 * never throws — when no model could answer: every caller has a plain,
 * model-free fallback.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly pausedUntil = new Map<string, number>();

  constructor(@Inject(LLM_PROVIDERS) private readonly providers: LlmProvider[]) {}

  isAvailable(): boolean {
    return this.providers.some((provider) => provider.isConfigured());
  }

  async json<T>(request: LlmRequest, validate: (value: unknown) => T | null): Promise<{ value: T; provider: string } | null> {
    for (const provider of this.providers) {
      if (!provider.isConfigured() || Date.now() < (this.pausedUntil.get(provider.id) ?? 0)) continue;
      try {
        const text = await provider.complete(request);
        const value = text === null ? null : validate(parseJson(text));
        if (value !== null) return { value, provider: provider.id };
        this.logger.warn(`${provider.id} answered, but not in the expected shape`);
      } catch (error) {
        const pause = error instanceof LlmHttpError && error.status === 429 ? PAUSE_AFTER_RATE_LIMIT_MS : PAUSE_AFTER_FAILURE_MS;
        this.pausedUntil.set(provider.id, Date.now() + pause);
        this.logger.warn(`${provider.id} failed, pausing it for ${pause / 1000}s: ${(error as Error).message}`);
      }
    }
    return null;
  }
}

/** Models sometimes wrap JSON in a code fence or a sentence; take the outermost object. */
export function parseJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
