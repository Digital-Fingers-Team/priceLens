// apps/api/src/matching/semantic.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import axios from 'axios';

@Injectable()
export class SemanticService {
  private readonly logger = new Logger(SemanticService.name);
  private readonly enabled: boolean;
  private readonly openaiKey: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.openaiKey = config.get<string>('search.openaiApiKey', '');
    this.enabled = !!this.openaiKey;
    if (!this.enabled) {
      this.logger.warn('OPENAI_API_KEY not set — semantic matching disabled, using fuzzy only');
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Generate a text embedding using OpenAI text-embedding-3-small.
   * Returns null if semantic search is disabled or API call fails.
   */
  async embed(text: string): Promise<number[] | null> {
    if (!this.enabled) return null;

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/embeddings',
        {
          model: 'text-embedding-3-small',
          input: text.slice(0, 8191), // API limit
        },
        {
          headers: {
            Authorization: `Bearer ${this.openaiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );

      return response.data.data[0].embedding as number[];
    } catch (err) {
      this.logger.error('Embedding API call failed:', err);
      return null;
    }
  }

  /**
   * Compute cosine similarity between two embedding vectors.
   * Returns a value in [-1, 1], normalized to [0, 1] for scoring.
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
    // Normalize from [-1,1] to [0,1]
    return (cosine + 1) / 2;
  }

  /**
   * Fetch the embedding of a canonical product from the database.
   * Uses pgvector storage to avoid re-computing embeddings.
   */
  async getCanonicalEmbedding(productId: string): Promise<number[] | null> {
    if (!this.enabled) return null;

    // Raw query because Prisma doesn't natively support vector type yet
    const result = await this.prisma.$queryRaw<Array<{ embedding: string }>>`
      SELECT title_embedding::text as embedding
      FROM canonical_products
      WHERE id = ${productId}::uuid
      AND title_embedding IS NOT NULL
    `;

    if (result.length === 0 || !result[0].embedding) return null;

    // Parse pgvector format: [0.1,0.2,...] → number[]
    return JSON.parse(result[0].embedding) as number[];
  }

  /**
   * Store a computed embedding for a canonical product.
   */
  async storeCanonicalEmbedding(productId: string, embedding: number[]): Promise<void> {
    const vectorStr = `[${embedding.join(',')}]`;
    await this.prisma.$executeRaw`
      UPDATE canonical_products
      SET title_embedding = ${vectorStr}::vector
      WHERE id = ${productId}::uuid
    `;
  }

  /**
   * Find the top-N most similar canonical products to a given embedding.
   * Uses pgvector's cosine distance operator (<=>).
   */
  async findSimilarProducts(
    embedding: number[],
    limit = 10,
    categoryId?: string,
  ): Promise<Array<{ id: string; similarity: number }>> {
    if (!this.enabled) return [];

    const vectorStr = `[${embedding.join(',')}]`;

    let results: Array<{ id: string; similarity: number }>;

    if (categoryId) {
      results = await this.prisma.$queryRaw<Array<{ id: string; similarity: number }>>`
        SELECT id, 1 - (title_embedding <=> ${vectorStr}::vector) as similarity
        FROM canonical_products
        WHERE title_embedding IS NOT NULL
          AND category_id = ${categoryId}::uuid
        ORDER BY title_embedding <=> ${vectorStr}::vector
        LIMIT ${limit}
      `;
    } else {
      results = await this.prisma.$queryRaw<Array<{ id: string; similarity: number }>>`
        SELECT id, 1 - (title_embedding <=> ${vectorStr}::vector) as similarity
        FROM canonical_products
        WHERE title_embedding IS NOT NULL
        ORDER BY title_embedding <=> ${vectorStr}::vector
        LIMIT ${limit}
      `;
    }

    return results;
  }

  /**
   * Score a source listing against a candidate's embedding.
   * Returns 0.5 (neutral) if semantic matching is disabled.
   */
  async scoreSemanticSimilarity(
    sourceTitle: string,
    candidateId: string,
    candidateEmbedding?: number[] | null,
  ): Promise<number> {
    if (!this.enabled) return 0.5; // neutral — don't penalize for missing

    const sourceEmbedding = await this.embed(sourceTitle);
    if (!sourceEmbedding) return 0.5;

    const targetEmbedding = candidateEmbedding ?? await this.getCanonicalEmbedding(candidateId);
    if (!targetEmbedding) return 0.5;

    return this.cosineSimilarity(sourceEmbedding, targetEmbedding);
  }
}