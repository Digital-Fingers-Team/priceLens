-- Arabic product titles for the Arabic site (owner, 2026-09-29), translated
-- by the AI (TitleTranslationService).
ALTER TABLE "canonical_products" ADD COLUMN "title_ar" TEXT;

-- Search and type-ahead find products by their Arabic title too: search_text
-- (migration 20260927000000) gains title_ar after the title. A generated
-- column's expression cannot be altered, so it is dropped and re-added.
DROP INDEX IF EXISTS "canonical_products_search_text_trgm_idx";
ALTER TABLE "canonical_products" DROP COLUMN "search_text";
ALTER TABLE "canonical_products"
  ADD COLUMN "search_text" TEXT GENERATED ALWAYS AS (
    regexp_replace(
      translate(
        lower("title" || coalesce(' ' || "title_ar", '') || coalesce(' ' || "brand", '') || coalesce(' ' || "model", '') || ' ' || "slug"),
        'أإآٱىةؤئ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', 'اااايهوي01234567890123456789'),
      '[ً-ٰٟـ]', '', 'g')
  ) STORED;
CREATE INDEX "canonical_products_search_text_trgm_idx" ON "canonical_products" USING GIN ("search_text" gin_trgm_ops);
