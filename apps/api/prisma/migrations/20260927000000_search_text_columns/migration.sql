-- Search text, normalized once per write instead of on every row of every
-- search (audit 08, P-01). Search and type-ahead matched with
-- regexp_replace(translate(lower(...))) computed per row per query: about
-- 60 us a row, so 0.5-1.7 s per search and per keystroke on 16,857 products.
--
-- The expression must stay in step with normalizedTextSql() in
-- src/search/search-text.ts (and so with normalizeArabic in
-- src/matching/text/arabic.ts); an integration test compares them.
-- search_text is concat_ws(' ', title, brand, model, slug), spelled with ||
-- because concat_ws is not immutable and a generated column must be.
ALTER TABLE "canonical_products"
  ADD COLUMN "search_title" TEXT GENERATED ALWAYS AS (
    regexp_replace(
      translate(lower("title"), 'أإآٱىةؤئ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', 'اااايهوي01234567890123456789'),
      '[ً-ٰٟـ]', '', 'g')
  ) STORED,
  ADD COLUMN "search_text" TEXT GENERATED ALWAYS AS (
    regexp_replace(
      translate(
        lower("title" || coalesce(' ' || "brand", '') || coalesce(' ' || "model", '') || ' ' || "slug"),
        'أإآٱىةؤئ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', 'اااايهوي01234567890123456789'),
      '[ً-ٰٟـ]', '', 'g')
  ) STORED;

-- Search and type-ahead match with LIKE '%term%' on search_text; a trigram
-- index answers that without reading every row (P-04).
CREATE INDEX "canonical_products_search_text_trgm_idx" ON "canonical_products" USING GIN ("search_text" gin_trgm_ops);
