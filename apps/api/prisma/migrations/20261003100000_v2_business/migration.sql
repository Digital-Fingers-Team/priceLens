-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'FINAL');

-- CreateTable
CREATE TABLE "authorized_retailers" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "note" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authorized_retailers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_quotes" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "created_by" TEXT,
    "title" VARCHAR(160) NOT NULL,
    "notes" VARCHAR(1000),
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" VARCHAR(3) NOT NULL DEFAULT 'EGP',
    "total_amount" DECIMAL(14,2),
    "priced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procurement_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_quote_items" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "query" VARCHAR(255) NOT NULL,
    "specs" VARCHAR(500),
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "max_unit_price" DECIMAL(12,2),
    "note" VARCHAR(500),
    "canonical_product_id" TEXT,
    "matched_title" VARCHAR(255),
    "store" VARCHAR(128),
    "store_slug" VARCHAR(64),
    "store_kind" VARCHAR(24),
    "unit_price" DECIMAL(12,2),
    "in_stock" BOOLEAN,
    "listing_url" TEXT,
    "alternatives" JSONB NOT NULL DEFAULT '[]',
    "priced_at" TIMESTAMP(3),

    CONSTRAINT "procurement_quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "authorized_retailers_org_id_platform_id_key" ON "authorized_retailers"("org_id", "platform_id");

-- CreateIndex
CREATE INDEX "procurement_quotes_org_id_created_at_idx" ON "procurement_quotes"("org_id", "created_at");

-- CreateIndex
CREATE INDEX "procurement_quote_items_quote_id_position_idx" ON "procurement_quote_items"("quote_id", "position");

-- AddForeignKey
ALTER TABLE "authorized_retailers" ADD CONSTRAINT "authorized_retailers_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorized_retailers" ADD CONSTRAINT "authorized_retailers_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_quotes" ADD CONSTRAINT "procurement_quotes_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_quote_items" ADD CONSTRAINT "procurement_quote_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "procurement_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

