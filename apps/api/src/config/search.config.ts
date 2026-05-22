// apps/api/src/config/search.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('search', () => ({
  meilisearchUrl: process.env.MEILISEARCH_URL ?? 'http://localhost:7700',
  meilisearchKey: process.env.MEILISEARCH_KEY ?? process.env.MEILISEARCH_MASTER_KEY ?? '',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  enableSemanticSearch: !!process.env.OPENAI_API_KEY,
}));