-- Reconciliation's look-alike search asks, for each product, for its nearest
-- titles in the same category (ORDER BY normalized_title <-> ...). The title
-- GiST index alone walks the whole table and filters the category after; on
-- 33k products that took 38 minutes (2026-09-29). With the category in the
-- index too, 200 products take ~2 s instead of ~48 s.
--
-- Built by hand on prod first (CREATE INDEX CONCURRENTLY, same name), so this
-- is a no-op there; on a fresh database the table is small.
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE INDEX IF NOT EXISTS "canonical_products_category_title_trgm_gist_idx"
  ON "canonical_products" USING gist ("category_id", "normalized_title" gist_trgm_ops);
