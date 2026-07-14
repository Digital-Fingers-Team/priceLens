// apps/api/src/matching/semantic.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';

interface OllamaEmbeddingResponse {
  embedding: number[];
}

interface OllamaGenerateResponse {
  response: string;
}

@Injectable()
export class SemanticService {
  private readonly logger = new Logger(SemanticService.name);
  private readonly baseUrl: string;
  private readonly embedModel: string;
  private readonly matchModel: string;
  private readonly openRouterApiKey: string;
  private readonly openRouterBaseUrl: string;
  private readonly openRouterMatchModel: string;
  private readonly openRouterEmbedModel: string;
  private readonly openRouterFallbackEnabled: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.baseUrl = this.config.get<string>('search.ollamaBaseUrl', 'http://localhost:11434');
    this.embedModel = this.config.get<string>('search.ollamaEmbedModel', 'nomic-embed-text');
    this.matchModel = this.config.get<string>('search.ollamaMatchModel', 'qwen2.5:1.5b');
    this.openRouterApiKey = this.config.get<string>('search.openRouterApiKey', '');
    this.openRouterBaseUrl = this.config.get<string>('search.openRouterBaseUrl', 'https://openrouter.ai/api/v1');
    this.openRouterMatchModel = this.config.get<string>('search.openRouterMatchModel', 'meta-llama/llama-3.1-8b-instruct');
    this.openRouterEmbedModel = this.config.get<string>('search.openRouterEmbedModel', 'openai/text-embedding-3-small');
    this.openRouterFallbackEnabled = this.config.get<boolean>('search.openRouterFallbackEnabled', true);
  }

  /**
   * Generate a text embedding using a local Ollama model (nomic-embed-text by
   * default) — no API key, no network egress, runs entirely on this machine.
   * Falls back to OpenRouter if Ollama is unreachable, so ingestion doesn't
   * silently drop to the plain heuristic matcher just because the local
   * daemon isn't running. Returns null only if both are unavailable.
   */
  async embed(text: string): Promise<number[] | null> {
    const local = await this.embedViaOllama(text);
    if (local !== undefined) {
      return local;
    }
    return this.embedViaOpenRouter(text);
  }

  private async embedViaOllama(text: string): Promise<number[] | null | undefined> {
    try {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.embedModel, prompt: text.slice(0, 8000), keep_alive: '30m' }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        throw new Error(`Ollama embeddings HTTP ${response.status}`);
      }

      const data = (await response.json()) as OllamaEmbeddingResponse;
      return Array.isArray(data.embedding) ? data.embedding : null;
    } catch (err) {
      this.logger.warn(`Ollama embedding call failed, will try OpenRouter fallback: ${(err as Error).message}`);
      return undefined;
    }
  }

  private async embedViaOpenRouter(text: string): Promise<number[] | null> {
    if (!this.openRouterFallbackEnabled) {
      this.logger.warn('OpenRouter embedding fallback skipped: disabled (OPENROUTER_FALLBACK_ENABLED=false)');
      return null;
    }
    if (!this.openRouterApiKey) {
      this.logger.warn('OpenRouter embedding fallback skipped: OPENROUTER_API_KEY not set');
      return null;
    }

    // Requests 768 dims via the OpenAI `dimensions` param so the vector fits
    // the same vector(768) column populated by nomic-embed-text.
    this.logger.warn(`Ollama unavailable — embedding via OpenRouter (${this.openRouterEmbedModel})`);
    try {
      const response = await fetch(`${this.openRouterBaseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.openRouterApiKey}`,
        },
        body: JSON.stringify({
          model: this.openRouterEmbedModel,
          input: text.slice(0, 8000),
          dimensions: 768,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter embeddings HTTP ${response.status}`);
      }

      const data = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
      const embedding = data.data?.[0]?.embedding;
      return Array.isArray(embedding) ? embedding : null;
    } catch (err) {
      this.logger.warn(`OpenRouter embedding call failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Ask a small local chat model whether two listing titles describe the exact
   * same product, just worded differently by each store's copywriter. Regex/text
   * overlap alone can't tell "Samsung Galaxy S26 - 256GB - Sky Blue" and "Samsung
   * Galaxy S26, Unlocked Android Smartphone... Galaxy AI... Sky Blue" apart from
   * two genuinely different phones — this can, because it reads for meaning.
   * Returns null (not false) if Ollama isn't reachable, so callers can tell
   * "confirmed different" apart from "couldn't ask."
   */
  async judgeSameProduct(titleA: string, titleB: string): Promise<boolean | null> {
    const prompt = `You are a strict product-matching assistant for an e-commerce price-comparison site.
Given two product titles from two different online stores, decide if they describe the EXACT same product for sale — same brand, same model, same storage/capacity if mentioned, same color/variant if mentioned — just worded differently by each store's copywriter. Marketing filler words (e.g. "Unlocked", "Official Warranty", "Genuine") don't matter and should be ignored. But a different color, different storage/RAM/capacity, or a different model tier (e.g. "Pro" vs base, "Ultra" vs base, "Max" vs base, "Mini" vs base) means they are NOT the same product.

Product A: "${titleA}"
Product B: "${titleB}"

Respond with ONLY this JSON object and nothing else: {"same": true or false}`;

    // Prefer the local Ollama model (no cost, no egress). If it's unreachable
    // — e.g. on a server with no local LLM — fall back to OpenRouter so matching
    // keeps working instead of silently degrading to the heuristic matcher.
    const local = await this.judgeViaOllama(prompt);
    if (local !== undefined) {
      return local;
    }
    return this.judgeViaOpenRouter(prompt);
  }

  /**
   * Returns the parsed verdict, or `undefined` (not null) to signal the local
   * model was unreachable so the caller can try the cloud fallback. `null` here
   * means Ollama answered but with an unusable payload.
   */
  private async judgeViaOllama(prompt: string): Promise<boolean | null | undefined> {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.matchModel,
          prompt,
          format: 'json',
          stream: false,
          options: { temperature: 0 },
          keep_alive: '30m',
        }),
        signal: AbortSignal.timeout(45_000),
      });

      if (!response.ok) {
        throw new Error(`Ollama generate HTTP ${response.status}`);
      }

      const data = (await response.json()) as OllamaGenerateResponse;
      const parsed = JSON.parse(data.response) as { same?: boolean };
      return typeof parsed.same === 'boolean' ? parsed.same : null;
    } catch (err) {
      this.logger.warn(`Ollama match-judgement unavailable, will try OpenRouter fallback: ${(err as Error).message}`);
      return undefined;
    }
  }

  private async judgeViaOpenRouter(prompt: string): Promise<boolean | null> {
    if (!this.openRouterFallbackEnabled) {
      this.logger.warn('OpenRouter fallback skipped: disabled (OPENROUTER_FALLBACK_ENABLED=false)');
      return null;
    }
    if (!this.openRouterApiKey) {
      this.logger.warn('OpenRouter fallback skipped: OPENROUTER_API_KEY not set');
      return null;
    }

    // This sends product titles to a third party (OpenRouter). It runs only when
    // local Ollama is unreachable AND the fallback is explicitly enabled.
    this.logger.warn(
      `Local model unavailable — sending titles to OpenRouter (${this.openRouterMatchModel}) for match judgement`,
    );
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

  /**
   * Compute cosine similarity between two embedding vectors, normalized to [0,1].
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    const cosine = dot / (Math.sqrt(normA) * Math.sqrt(normB));
    return (cosine + 1) / 2;
  }

  /**
   * Fetch the stored embedding of a canonical product. Raw query because Prisma
   * doesn't natively support the pgvector column type.
   */
  async getCanonicalEmbedding(productId: string): Promise<number[] | null> {
    const result = await this.prisma.$queryRaw<Array<{ embedding: string }>>`
      SELECT title_embedding::text as embedding
      FROM canonical_products
      WHERE id = ${productId}
      AND title_embedding IS NOT NULL
    `;

    if (result.length === 0 || !result[0].embedding) return null;
    return JSON.parse(result[0].embedding) as number[];
  }

  /**
   * Store a computed embedding for a canonical product so future ingestion
   * passes don't need to re-embed every existing candidate's title.
   */
  async storeCanonicalEmbedding(productId: string, embedding: number[]): Promise<void> {
    const vectorStr = `[${embedding.join(',')}]`;
    await this.prisma.$executeRaw`
      UPDATE canonical_products
      SET title_embedding = ${vectorStr}::vector
      WHERE id = ${productId}
    `;
  }

  /**
   * Find the top-N most similar canonical products to a given embedding, using
   * pgvector's cosine distance operator (<=>). Optionally scoped to a category.
   */
  async findSimilarProducts(
    embedding: number[],
    limit = 8,
    categoryId?: string,
  ): Promise<Array<{ id: string; similarity: number }>> {
    const vectorStr = `[${embedding.join(',')}]`;

    if (categoryId) {
      return this.prisma.$queryRaw<Array<{ id: string; similarity: number }>>`
        SELECT id, 1 - (title_embedding <=> ${vectorStr}::vector) as similarity
        FROM canonical_products
        WHERE title_embedding IS NOT NULL
          AND category_id = ${categoryId}
        ORDER BY title_embedding <=> ${vectorStr}::vector
        LIMIT ${limit}
      `;
    }

    return this.prisma.$queryRaw<Array<{ id: string; similarity: number }>>`
      SELECT id, 1 - (title_embedding <=> ${vectorStr}::vector) as similarity
      FROM canonical_products
      WHERE title_embedding IS NOT NULL
      ORDER BY title_embedding <=> ${vectorStr}::vector
      LIMIT ${limit}
    `;
  }
}
