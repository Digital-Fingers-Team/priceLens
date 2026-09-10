-- Tracks when the store-coverage sweep last attempted to expand a product.
-- Nullable with no default, so this is a metadata-only change on PostgreSQL:
-- no table rewrite and no lock held while existing rows are backfilled.
ALTER TABLE "canonical_products" ADD COLUMN "last_coverage_attempt_at" TIMESTAMP(3);

-- The sweep orders by this column to pick the least-recently-attempted
-- products, so it needs an index to avoid a full sort of the catalog.
CREATE INDEX "canonical_products_last_coverage_attempt_at_idx"
  ON "canonical_products"("last_coverage_attempt_at");
