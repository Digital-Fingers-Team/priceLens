-- Reconciliation's candidate search and ingestion's findSimilarProducts both scan
-- canonical_products by cosine distance (<=>) on title_embedding. Without an ANN
-- index every query is a sequential scan, and reconciliation's self-join is O(n^2).
-- An HNSW index on the cosine ops makes both indexed nearest-neighbor lookups.
CREATE INDEX IF NOT EXISTS "canonical_products_title_embedding_hnsw_idx"
  ON "canonical_products"
  USING hnsw ("title_embedding" vector_cosine_ops);
