-- v2 plan, phase 3: installments, card/cashback offers and coupons, the banks a
-- buyer holds (names only), warranty rules, cart watch, reviews and summaries.
-- No data: providers' terms and offers are entered by the admin, never invented.
-- CreateEnum
CREATE TYPE "PromoType" AS ENUM ('CARD', 'CASHBACK', 'COUPON');

-- CreateEnum
CREATE TYPE "PromoValueType" AS ENUM ('PERCENT', 'AMOUNT');

-- CreateEnum
CREATE TYPE "WarrantyType" AS ENUM ('LOCAL_AGENT', 'INTERNATIONAL', 'SELLER', 'NONE');

-- CreateTable
CREATE TABLE "installment_plans" (
    "id" TEXT NOT NULL,
    "provider" VARCHAR(64) NOT NULL,
    "kind" VARCHAR(16) NOT NULL DEFAULT 'BNPL',
    "months" INTEGER NOT NULL,
    "markup_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "admin_fee_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "admin_fee_flat" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "down_payment_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "min_amount" DECIMAL(12,2),
    "max_amount" DECIMAL(12,2),
    "platform_ids" TEXT[],
    "valid_until" TIMESTAMP(3),
    "source_url" VARCHAR(512),
    "notes" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "installment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promos" (
    "id" TEXT NOT NULL,
    "type" "PromoType" NOT NULL,
    "platform_id" TEXT,
    "bank_name" VARCHAR(64),
    "code" VARCHAR(64),
    "title" VARCHAR(160) NOT NULL,
    "title_ar" VARCHAR(160),
    "value_type" "PromoValueType" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "max_discount" DECIMAL(12,2),
    "min_spend" DECIMAL(12,2),
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "last_verified_at" TIMESTAMP(3),
    "worked_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "source_url" VARCHAR(512),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_reports" (
    "id" TEXT NOT NULL,
    "promo_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "worked" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_banks" (
    "user_id" TEXT NOT NULL,
    "bank_name" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_banks_pkey" PRIMARY KEY ("user_id","bank_name")
);

-- CreateTable
CREATE TABLE "warranty_rules" (
    "id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "brand" VARCHAR(64),
    "type" "WarrantyType" NOT NULL,
    "months" INTEGER NOT NULL DEFAULT 0,
    "agent_name" VARCHAR(128),
    "notes" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warranty_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_watches" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "target_total" DECIMAL(12,2) NOT NULL,
    "across_stores" BOOLEAN NOT NULL DEFAULT true,
    "last_total" DECIMAL(12,2),
    "last_checked_at" TIMESTAMP(3),
    "last_notified_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_watches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_watch_items" (
    "id" TEXT NOT NULL,
    "cart_id" TEXT NOT NULL,
    "canonical_product_id" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "cart_watch_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_reviews" (
    "id" TEXT NOT NULL,
    "source_listing_id" TEXT NOT NULL,
    "external_id" VARCHAR(128) NOT NULL,
    "rating" DOUBLE PRECISION,
    "title" VARCHAR(255),
    "body" TEXT NOT NULL,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_summaries" (
    "canonical_product_id" TEXT NOT NULL,
    "pros" JSONB NOT NULL DEFAULT '[]',
    "cons" JSONB NOT NULL DEFAULT '[]',
    "issues" JSONB NOT NULL DEFAULT '[]',
    "pros_ar" JSONB NOT NULL DEFAULT '[]',
    "cons_ar" JSONB NOT NULL DEFAULT '[]',
    "issues_ar" JSONB NOT NULL DEFAULT '[]',
    "sample_size" INTEGER NOT NULL,
    "reviews_hash" VARCHAR(64) NOT NULL,
    "model" VARCHAR(64) NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_summaries_pkey" PRIMARY KEY ("canonical_product_id")
);

-- CreateIndex
CREATE INDEX "installment_plans_is_active_idx" ON "installment_plans"("is_active");

-- CreateIndex
CREATE INDEX "promos_type_is_active_idx" ON "promos"("type", "is_active");

-- CreateIndex
CREATE INDEX "promos_platform_id_idx" ON "promos"("platform_id");

-- CreateIndex
CREATE UNIQUE INDEX "promo_reports_promo_id_user_id_key" ON "promo_reports"("promo_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "warranty_rules_platform_id_brand_key" ON "warranty_rules"("platform_id", "brand");

-- CreateIndex
CREATE INDEX "cart_watches_user_id_idx" ON "cart_watches"("user_id");

-- CreateIndex
CREATE INDEX "cart_watches_is_active_last_checked_at_idx" ON "cart_watches"("is_active", "last_checked_at");

-- CreateIndex
CREATE UNIQUE INDEX "cart_watch_items_cart_id_canonical_product_id_key" ON "cart_watch_items"("cart_id", "canonical_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_reviews_source_listing_id_external_id_key" ON "product_reviews"("source_listing_id", "external_id");

-- AddForeignKey
ALTER TABLE "promos" ADD CONSTRAINT "promos_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_reports" ADD CONSTRAINT "promo_reports_promo_id_fkey" FOREIGN KEY ("promo_id") REFERENCES "promos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_reports" ADD CONSTRAINT "promo_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_banks" ADD CONSTRAINT "user_banks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_rules" ADD CONSTRAINT "warranty_rules_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_watches" ADD CONSTRAINT "cart_watches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_watch_items" ADD CONSTRAINT "cart_watch_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "cart_watches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_watch_items" ADD CONSTRAINT "cart_watch_items_canonical_product_id_fkey" FOREIGN KEY ("canonical_product_id") REFERENCES "canonical_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_source_listing_id_fkey" FOREIGN KEY ("source_listing_id") REFERENCES "source_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_summaries" ADD CONSTRAINT "review_summaries_canonical_product_id_fkey" FOREIGN KEY ("canonical_product_id") REFERENCES "canonical_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

