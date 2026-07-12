// apps/api/src/config/search.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('search', () => ({
  meilisearchUrl: process.env.MEILISEARCH_URL ?? 'http://localhost:7700',
  meilisearchKey: process.env.MEILISEARCH_KEY ?? process.env.MEILISEARCH_MASTER_KEY ?? '',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
  ollamaEmbedModel: process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text',
  ollamaMatchModel: process.env.OLLAMA_MATCH_MODEL ?? 'qwen2.5:3b',
}));