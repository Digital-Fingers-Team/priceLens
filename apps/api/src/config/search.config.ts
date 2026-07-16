// apps/api/src/config/search.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('search', () => ({
  meilisearchUrl: process.env.MEILISEARCH_URL ?? 'http://localhost:7700',
  meilisearchKey: process.env.MEILISEARCH_KEY ?? process.env.MEILISEARCH_MASTER_KEY ?? '',
  // Match-judgement and embeddings both run via OpenRouter (cloud) -- this app
  // needs internet access anyway to scrape live retailer sites, and a local
  // Ollama model was both slower and less reliable on this machine's hardware.
  // Leave OPENROUTER_API_KEY empty to disable and fall back to the plain
  // fuzzy-score heuristic only.
  openRouterApiKey: process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY ?? '',
  openRouterBaseUrl: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
  openRouterMatchModel: process.env.OPENROUTER_MATCH_MODEL ?? 'google/gemini-2.5-flash',
  // Embedding model, requested at 768 dims via the OpenAI `dimensions` param
  // (forwarded through OpenRouter) to match the existing vector(768) column.
  openRouterEmbedModel: process.env.OPENROUTER_EMBED_MODEL ?? 'openai/text-embedding-3-small',
  // Background reconciliation job that re-checks EXISTING canonical products for
  // duplicates and merges them (fixes the "1 store" problem). Runs on a cron and
  // can also be triggered manually. Dry-run only logs proposed merges.
  reconciliationScheduleEnabled: (process.env.RECONCILIATION_SCHEDULE_ENABLED ?? 'true') !== 'false',
  reconciliationCron: process.env.RECONCILIATION_CRON ?? '0 * * * *',
  reconciliationDryRun: (process.env.RECONCILIATION_DRY_RUN ?? 'true') !== 'false',
  // Minimum title-trigram similarity (pg_trgm, 0..1) between two canonical
  // products before the pair is even considered a candidate worth asking the
  // LLM about. Tuned low on purpose: a genuine cross-store duplicate of the
  // same phone (just worded differently) scores ~0.45-0.55 here — the
  // hasHardConflict guard (brand/color/storage/RAM/identifier), not this
  // threshold, is what actually rejects false positives before the LLM call.
  reconciliationSimilarityThreshold: Number(process.env.RECONCILIATION_SIMILARITY_THRESHOLD ?? '0.3'),
  // Max candidate pairs examined per run, to bound LLM calls.
  reconciliationMaxPairs: Number(process.env.RECONCILIATION_MAX_PAIRS ?? '500'),
  // How many nearest neighbours to pull per product (by title-trigram
  // similarity) when building the candidate list. Higher = more thorough,
  // more rows to filter.
  reconciliationNeighborsPerProduct: Number(process.env.RECONCILIATION_NEIGHBORS_PER_PRODUCT ?? '8'),
  // When false, OpenRouter is disabled even if a key is present, and matching
  // drops to the plain fuzzy-score heuristic (no LLM at all).
  openRouterFallbackEnabled: (process.env.OPENROUTER_FALLBACK_ENABLED ?? 'true') !== 'false',
}));