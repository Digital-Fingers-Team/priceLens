-- v2 plan, phase 4: store kinds, two more chains, used-market price ranges.
-- CreateEnum
CREATE TYPE "StoreKind" AS ENUM ('ONLINE', 'OFFLINE_CHAIN', 'USED_MARKET', 'GROCERY', 'PHARMACY');

-- AlterTable
ALTER TABLE "platforms" ADD COLUMN     "kind" "StoreKind" NOT NULL DEFAULT 'ONLINE';

-- CreateTable
CREATE TABLE "used_price_snapshots" (
    "id" TEXT NOT NULL,
    "canonical_product_id" TEXT NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "sample_size" INTEGER NOT NULL,
    "p25" DECIMAL(12,2),
    "median" DECIMAL(12,2),
    "p75" DECIMAL(12,2),
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "used_price_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "used_price_snapshots_canonical_product_id_captured_at_idx" ON "used_price_snapshots"("canonical_product_id", "captured_at");

-- AddForeignKey
ALTER TABLE "used_price_snapshots" ADD CONSTRAINT "used_price_snapshots_canonical_product_id_fkey" FOREIGN KEY ("canonical_product_id") REFERENCES "canonical_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Data: Egyptian chains with physical branches. Their website price is what
-- we track; the site says it may differ in-store. Carrefour here is the UAE
-- site, not a local branch network, so it stays ONLINE.
UPDATE "platforms" SET "kind" = 'OFFLINE_CHAIN' WHERE "slug" IN ('btech', '2b', 'elaraby', 'dream2000');

-- Data: Tradeline and Compumarts (Shopify search, plain HTTP). Idempotent.
INSERT INTO "platforms" ("id", "slug", "name", "base_url", "connector_type", "is_active", "rate_limit", "kind", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'tradeline', 'Tradeline', 'https://tradelinestores.com', 'HTTP_API', true, 60, 'OFFLINE_CHAIN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'compumarts', 'Compumarts', 'https://compumarts.com', 'HTTP_API', true, 60, 'OFFLINE_CHAIN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET "kind" = 'OFFLINE_CHAIN';
