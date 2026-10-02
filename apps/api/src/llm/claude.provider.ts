import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmHttpError, LlmProvider, LlmRequest } from './llm-provider';

const TIMEOUT_MS = 60_000;

/**
 * Claude, through the Messages API. Used first when ANTHROPIC_API_KEY is set;
 * otherwise the features run on Gemini.
 */
@Injectable()
export class ClaudeProvider implements LlmProvider {
  readonly id = 'claude';

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('llm.anthropicApiKey', ''));
  }

  async complete(request: LlmRequest): Promise<string | null> {
    const content = [
      ...(request.images ?? []).map((image) => ({
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: image.mimeType, data: image.data },
      })),
      { type: 'text' as const, text: `${request.prompt}\n\nAnswer with JSON only, no prose around it.` },
    ];
    const response = await fetch(`${this.config.get<string>('llm.anthropicBaseUrl', 'https://api.anthropic.com')}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.get<string>('llm.anthropicApiKey', ''),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.get<string>('llm.claudeModel', 'claude-sonnet-5-5'),
        max_tokens: request.maxTokens ?? 2048,
        messages: [{ role: 'user', content }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new LlmHttpError('Claude', response.status);
    const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
    return data.content?.filter((block) => block.type === 'text').map((block) => block.text ?? '').join('') || null;
  }
}
