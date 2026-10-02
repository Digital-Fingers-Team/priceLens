/**
 * A language model the product features call (image understanding, the
 * advisor, review summaries). Every feature asks for JSON and validates what
 * comes back; nothing a model says is trusted as data on its own.
 */
export interface LlmImage {
  mimeType: string;
  /** Base64, no data: prefix. */
  data: string;
}

export interface LlmRequest {
  prompt: string;
  images?: LlmImage[];
  maxTokens?: number;
}

export interface LlmProvider {
  readonly id: string;
  isConfigured(): boolean;
  /** The model's text answer (expected to be JSON), or null when it had none. Throws on transport errors. */
  complete(request: LlmRequest): Promise<string | null>;
}

export class LlmHttpError extends Error {
  constructor(
    provider: string,
    readonly status: number,
  ) {
    super(`${provider} HTTP ${status}`);
  }
}

export const LLM_PROVIDERS = Symbol('LLM_PROVIDERS');
