-- Brand monitoring (watches, discoveries, reports) and the enterprise API
-- (hashed keys + daily usage rollups).
--
-- NOTE: `prisma migrate diff` again proposed dropping six indexes that exist
-- in production but are not expressible in the Prisma datamodel -- the pgvector
-- HNSW index on canonical_products.title_embedding, the pg_trgm indexes on
-- canonical_products.title and source_listings.raw_title, and the covering /
-- BRIN indexes on price_history. They are created by earlier raw-SQL
-- migrations and are load-bearing for search and semantic matching. They are
-- deliberately NOT dropped here. (Same as the two previous migrations.)

-- CreateEnum
CREATE TYPE "ReportPeriod" AS ENUM ('WEEKLY', 'MONTHLY');

-- AlterEnum
ALTER TYPE "CompetitorEventType" ADD VALUE 'NEW_PRODUCT';

-- CreateTable
CREATE TABLE "brand_watches" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "brand" VARCHAR(128) NOT NULL,
    "category_id" TEXT,
    "is_own_brand" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_watches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_discoveries" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "canonical_product_id" TEXT NOT NULL,
    "brand" VARCHAR(128),
    "category_name" VARCHAR(128),
    "first_price" DECIMAL(12,2),
    "first_store" VARCHAR(128),
    "first_detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified_at" TIMESTAMP(3),

    CONSTRAINT "product_discoveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_reports" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "period" "ReportPeriod" NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "key_prefix" VARCHAR(32) NOT NULL,
    "key_hash" VARCHAR(64) NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_usage" (
    "id" TEXT NOT NULL,
    "api_key_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "endpoint" VARCHAR(128) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brand_watches_org_id_is_active_idx" ON "brand_watches"("org_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "brand_watches_org_id_brand_category_id_key" ON "brand_watches"("org_id", "brand", "category_id");

-- CreateIndex
CREATE INDEX "product_discoveries_org_id_first_detected_at_idx" ON "product_discoveries"("org_id", "first_detected_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_discoveries_org_id_canonical_product_id_key" ON "product_discoveries"("org_id", "canonical_product_id");

-- CreateIndex
CREATE INDEX "market_reports_org_id_period_end_idx" ON "market_reports"("org_id", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "market_reports_org_id_period_period_start_key" ON "market_reports"("org_id", "period", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_prefix_key" ON "api_keys"("key_prefix");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_org_id_is_active_idx" ON "api_keys"("org_id", "is_active");

-- CreateIndex
CREATE INDEX "api_usage_org_id_day_idx" ON "api_usage"("org_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "api_usage_api_key_id_day_endpoint_key" ON "api_usage"("api_key_id", "day", "endpoint");

-- AddForeignKey
ALTER TABLE "brand_watches" ADD CONSTRAINT "brand_watches_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_watches" ADD CONSTRAINT "brand_watches_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_discoveries" ADD CONSTRAINT "product_discoveries_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_discoveries" ADD CONSTRAINT "product_discoveries_canonical_product_id_fkey" FOREIGN KEY ("canonical_product_id") REFERENCES "canonical_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_reports" ADD CONSTRAINT "market_reports_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

