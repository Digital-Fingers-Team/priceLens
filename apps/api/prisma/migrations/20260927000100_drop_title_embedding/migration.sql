-- D-16 (owner-approved 2026-09-26): nothing has read or written
-- title_embedding since phase 02, and it is NULL on every production row
-- (checked read-only 2026-09-26: 0 of 16,857). Drops a 768-float column and
-- an HNSW index that was maintained for nothing.
DROP INDEX IF EXISTS "canonical_products_title_embedding_hnsw_idx";
ALTER TABLE "canonical_products" DROP COLUMN IF EXISTS "title_embedding";
