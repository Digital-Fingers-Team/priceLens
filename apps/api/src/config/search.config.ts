// apps/api/src/config/search.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('search', () => ({
  meilisearchUrl: process.env.MEILISEARCH_URL ?? 'http://localhost:7700',
  meilisearchKey: process.env.MEILISEARCH_KEY ?? process.env.MEILISEARCH_MASTER_KEY ?? '',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
  ollamaEmbedModel: process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text',
  ollamaMatchModel: process.env.OLLAMA_MATCH_MODEL ?? 'qwen2.5:1.5b',
  // Cloud fallback for the match-judgement step when local Ollama is unreachable
  // (e.g. on a server with no local LLM). Uses the OpenRouter key already set for
  // the project. Leave OPENROUTER_API_KEY empty to disable the fallback.
  openRouterApiKey: process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY ?? '',
  openRouterBaseUrl: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
  openRouterMatchModel: process.env.OPENROUTER_MATCH_MODEL ?? 'meta-llama/llama-3.1-8b-instruct',
  // Background reconciliation job that re-checks EXISTING canonical products for
  // duplicates and merges them (fixes the "1 store" problem). Runs on a cron and
  // can also be triggered manually. Dry-run only logs proposed merges.
  reconciliationScheduleEnabled: (process.env.RECONCILIATION_SCHEDULE_ENABLED ?? 'true') !== 'false',
  reconciliationCron: process.env.RECONCILIATION_CRON ?? '0 * * * *',
  reconciliationDryRun: (process.env.RECONCILIATION_DRY_RUN ?? 'true') !== 'false',
  // Minimum cosine similarity (0..1) between two canonical embeddings before the
  // pair is even considered a candidate worth asking the LLM about.
  reconciliationSimilarityThreshold: Number(process.env.RECONCILIATION_SIMILARITY_THRESHOLD ?? '0.82'),
  // Max candidate pairs examined per run, to bound LLM calls.
  reconciliationMaxPairs: Number(process.env.RECONCILIATION_MAX_PAIRS ?? '200'),
  // How many nearest neighbours to pull per product from the HNSW index when
  // building the candidate list. Higher = more thorough, more rows to filter.
  reconciliationNeighborsPerProduct: Number(process.env.RECONCILIATION_NEIGHBORS_PER_PRODUCT ?? '5'),
  // When false, the OpenRouter cloud fallback for match-judgement is disabled even
  // if a key is present, keeping every title on-machine (local Ollama only).
  openRouterFallbackEnabled: (process.env.OPENROUTER_FALLBACK_ENABLED ?? 'true') !== 'false',
}));