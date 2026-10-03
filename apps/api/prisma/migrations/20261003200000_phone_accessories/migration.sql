-- Phone Accessories leaf (seed/datasets/categoryTree.ts). Cases and screen
-- protectors found by other sweeps are filed here, so the same case is no
-- longer created once per sweep category. Wave -1: never swept itself.
INSERT INTO "categories" ("id", "slug", "name", "name_ar", "parent_id", "level", "search_terms", "rollout_wave", "min_price_egp")
SELECT gen_random_uuid()::text, 'phone-accessories', 'Phone Accessories', 'إكسسوارات موبايل', p."id", 1,
       ARRAY['screen protector', 'tempered glass', 'جراب', 'اسكرينة'], -1, 0
FROM "categories" p
WHERE p."slug" = 'electronics'
ON CONFLICT ("slug") DO NOTHING;

-- Old product URLs redirect through product_merges (ProductsService
-- resolveMergedProductId), looked up by the merged product's slug. It lived
-- only inside merged_snapshot, unindexed; the catalog cleanup adds ~29k
-- merges, so every old link would scan them all.
ALTER TABLE "product_merges" ADD COLUMN "merged_slug" TEXT;
UPDATE "product_merges" SET "merged_slug" = "merged_snapshot"->>'slug';
CREATE INDEX "product_merges_merged_slug_idx" ON "product_merges"("merged_slug");
