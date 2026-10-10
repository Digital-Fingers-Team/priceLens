-- Brand-specific seller fees: a row can apply to one brand ('' = every brand).
ALTER TABLE "platform_fee_tables" ADD COLUMN "brand" VARCHAR(64) NOT NULL DEFAULT '';
DROP INDEX "platform_fee_tables_platform_id_category_key_key";
CREATE UNIQUE INDEX "platform_fee_tables_platform_id_category_key_brand_key" ON "platform_fee_tables"("platform_id", "category_key", "brand");
