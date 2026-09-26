-- Phase 03 (audit/03-backend.md).

-- B-22: reconciliation ranks each product's neighbours with
-- ORDER BY normalized_title <-> other.normalized_title LIMIT k. That KNN
-- ordering can only use a GiST trigram index; the GIN one serves LIKE only,
-- so every product sorted its whole category.
CREATE INDEX IF NOT EXISTS "canonical_products_title_trgm_gist_idx"
  ON "canonical_products" USING GIST ("normalized_title" gist_trgm_ops);

-- B-15 / L-23: the default must not silently mean dollars.
ALTER TABLE "price_history" ALTER COLUMN "currency" SET DEFAULT 'EGP';
