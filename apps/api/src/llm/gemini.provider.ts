import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmHttpError, LlmProvider, LlmRequest } from './llm-provider';

const TIMEOUT_MS = 60_000;

/**
 * Gemini, with the same API keys as the match judge but its own model
 * (LLM_GEMINI_MODEL: vision-capable, a notch above the judge's lite model)
 * and its own pause state in LlmService, so features never starve matching.
 */
@Injectable()
export class GeminiProvider implements LlmProvider {
  readonly id = 'gemini';
  private nextKey = 0;

  constructor(private readonly config: ConfigService) {}

  private get keys(): string[] {
    const all = [this.config.get<string>('search.geminiApiKey', ''), this.config.get<string>('search.geminiApiKeys', '')]
      .flatMap((value) => value.split(','))
      .map((key) => key.trim())
      .filter(Boolean);
    return [...new Set(all)];
  }

  isConfigured(): boolean {
    return this.keys.length > 0;
  }

  async complete(request: LlmRequest): Promise<string | null> {
    const keys = this.keys;
    const key = keys[this.nextKey++ % keys.length];
    const model = this.config.get<string>('llm.geminiModel', 'gemini-2.5-flash');
    const base = this.config.get<string>('search.geminiBaseUrl', 'https://generativelanguage.googleapis.com/v1beta');
    const parts = [
      ...(request.images ?? []).map((image) => ({ inline_data: { mime_type: image.mimeType, data: image.data } })),
      { text: request.prompt },
    ];
    const response = await fetch(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0.2, maxOutputTokens: request.maxTokens ?? 2048, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new LlmHttpError('Gemini', response.status);
    const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') || null;
  }
}
