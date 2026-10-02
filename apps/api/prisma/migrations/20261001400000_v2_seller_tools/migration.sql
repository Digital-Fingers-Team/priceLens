-- CreateEnum
CREATE TYPE "RepricerStrategy" AS ENUM ('BEAT_LOWEST', 'MATCH_LOWEST');

-- CreateEnum
CREATE TYPE "PriceChangeSource" AS ENUM ('SUGGESTED', 'APPLIED', 'EDITED', 'IMPORTED');

-- AlterTable
ALTER TABLE "seller_products" ADD COLUMN     "ceiling_price" DECIMAL(12,2),
ADD COLUMN     "floor_price" DECIMAL(12,2),
ADD COLUMN     "listing_url" VARCHAR(1000),
ADD COLUMN     "repricer_offset" DECIMAL(12,2) NOT NULL DEFAULT 1,
ADD COLUMN     "repricer_strategy" "RepricerStrategy",
ADD COLUMN     "suggested_at" TIMESTAMP(3),
ADD COLUMN     "suggested_price" DECIMAL(12,2),
ADD COLUMN     "suggestion_reason" VARCHAR(32);

-- CreateTable
CREATE TABLE "platform_fee_tables" (
    "id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "category_key" VARCHAR(64) NOT NULL DEFAULT '',
    "commission_pct" DOUBLE PRECISION NOT NULL,
    "fixed_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shipping_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "return_rate_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vat_pct" DOUBLE PRECISION NOT NULL DEFAULT 14,
    "notes" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_fee_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_change_logs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "seller_product_id" TEXT NOT NULL,
    "old_price" DECIMAL(12,2),
    "new_price" DECIMAL(12,2),
    "source" "PriceChangeSource" NOT NULL,
    "reason" VARCHAR(64) NOT NULL,
    "actor_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rank_keywords" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "seller_product_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "keyword" VARCHAR(160) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rank_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rank_snapshots" (
    "id" TEXT NOT NULL,
    "keyword_id" TEXT NOT NULL,
    "position" INTEGER,
    "scanned" INTEGER NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rank_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_fee_tables_platform_id_category_key_key" ON "platform_fee_tables"("platform_id", "category_key");

-- CreateIndex
CREATE INDEX "price_change_logs_seller_product_id_created_at_idx" ON "price_change_logs"("seller_product_id", "created_at");

-- CreateIndex
CREATE INDEX "price_change_logs_org_id_created_at_idx" ON "price_change_logs"("org_id", "created_at");

-- CreateIndex
CREATE INDEX "rank_keywords_org_id_idx" ON "rank_keywords"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "rank_keywords_seller_product_id_platform_id_keyword_key" ON "rank_keywords"("seller_product_id", "platform_id", "keyword");

-- CreateIndex
CREATE INDEX "rank_snapshots_keyword_id_checked_at_idx" ON "rank_snapshots"("keyword_id", "checked_at");

-- AddForeignKey
ALTER TABLE "platform_fee_tables" ADD CONSTRAINT "platform_fee_tables_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_change_logs" ADD CONSTRAINT "price_change_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_change_logs" ADD CONSTRAINT "price_change_logs_seller_product_id_fkey" FOREIGN KEY ("seller_product_id") REFERENCES "seller_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rank_keywords" ADD CONSTRAINT "rank_keywords_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rank_keywords" ADD CONSTRAINT "rank_keywords_seller_product_id_fkey" FOREIGN KEY ("seller_product_id") REFERENCES "seller_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rank_keywords" ADD CONSTRAINT "rank_keywords_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rank_snapshots" ADD CONSTRAINT "rank_snapshots_keyword_id_fkey" FOREIGN KEY ("keyword_id") REFERENCES "rank_keywords"("id") ON DELETE CASCADE ON UPDATE CASCADE;

