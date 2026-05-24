-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('ACCEPTED', 'PENDING', 'REJECTED', 'MANUAL_ACCEPT', 'MANUAL_REJECT');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('PRICE_DROP_ABSOLUTE', 'PRICE_DROP_PERCENT', 'PRICE_TARGET');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'TRIGGERED', 'DISABLED');

-- CreateEnum
CREATE TYPE "ScrapingJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConnectorType" AS ENUM ('PLAYWRIGHT', 'HTTP_API', 'RSS_FEED', 'MANUAL_IMPORT');

-- CreateEnum
CREATE TYPE "ProductTier" AS ENUM ('BUDGET', 'MID_RANGE', 'PREMIUM', 'ULTRA_PREMIUM');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" VARCHAR(32) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "avatar_url" TEXT,
    "display_name" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "refresh_token" VARCHAR(512) NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(128) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "parent_id" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "search_terms" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platforms" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "base_url" TEXT NOT NULL,
    "logo_url" TEXT,
    "connector_type" "ConnectorType" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "rate_limit" INTEGER NOT NULL DEFAULT 60,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platforms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canonical_products" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normalized_title" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "sku" TEXT,
    "gtin" TEXT,
    "upc" TEXT,
    "ean" TEXT,
    "mpn" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "image_url" TEXT,
    "thumbnail_url" TEXT,
    "title_embedding" vector(1536),
    "tier" "ProductTier" NOT NULL DEFAULT 'MID_RANGE',
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "search_boost" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canonical_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_listings" (
    "id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "canonical_product_id" TEXT,
    "external_id" TEXT NOT NULL,
    "external_url" TEXT NOT NULL,
    "raw_title" TEXT NOT NULL,
    "raw_price" DECIMAL(12,2),
    "raw_currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "raw_brand" TEXT,
    "raw_image_url" TEXT,
    "raw_attributes" JSONB NOT NULL DEFAULT '{}',
    "raw_category" TEXT,
    "normalized_title" TEXT,
    "extracted_gtin" TEXT,
    "extracted_upc" TEXT,
    "extracted_ean" TEXT,
    "extracted_mpn" TEXT,
    "extracted_brand" TEXT,
    "extracted_model" TEXT,
    "extracted_attributes" JSONB NOT NULL DEFAULT '{}',
    "price_usd" DECIMAL(12,2),
    "in_stock" BOOLEAN,
    "rating" DOUBLE PRECISION,
    "review_count" INTEGER,
    "match_status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "match_confidence" DOUBLE PRECISION,
    "matched_at" TIMESTAMP(3),
    "match_version" INTEGER NOT NULL DEFAULT 1,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_scraped_at" TIMESTAMP(3),

    CONSTRAINT "source_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_history" (
    "id" TEXT NOT NULL,
    "canonical_product_id" TEXT NOT NULL,
    "source_listing_id" TEXT NOT NULL,
    "price_usd" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "original_price" DECIMAL(12,2),
    "in_stock" BOOLEAN NOT NULL DEFAULT true,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_decisions" (
    "id" TEXT NOT NULL,
    "source_listing_id" TEXT NOT NULL,
    "candidate_id" TEXT,
    "status" "MatchStatus" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "engine_version" TEXT NOT NULL,
    "scores" JSONB NOT NULL,
    "reasoning" TEXT NOT NULL,
    "flags" TEXT[],
    "processing_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_queue" (
    "id" TEXT NOT NULL,
    "source_listing_id" TEXT NOT NULL,
    "canonical_product_id" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "scores" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,
    "resolution" "MatchStatus",
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_decisions" (
    "id" TEXT NOT NULL,
    "queue_item_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "decision" "MatchStatus" NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scraping_jobs" (
    "id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "query" TEXT,
    "job_type" TEXT NOT NULL,
    "status" "ScrapingJobStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "scheduled_for" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scraping_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlist_items" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "canonical_product_id" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_alerts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "canonical_product_id" TEXT NOT NULL,
    "alert_type" "AlertType" NOT NULL,
    "threshold_value" DECIMAL(12,2) NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_checked_at" TIMESTAMP(3),
    "triggered_at" TIMESTAMP(3),
    "triggered_price" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_key" ON "sessions"("refresh_token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_refresh_token_idx" ON "sessions"("refresh_token");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- CreateIndex
CREATE INDEX "categories_slug_idx" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "platforms_slug_key" ON "platforms"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "canonical_products_slug_key" ON "canonical_products"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "canonical_products_gtin_key" ON "canonical_products"("gtin");

-- CreateIndex
CREATE UNIQUE INDEX "canonical_products_upc_key" ON "canonical_products"("upc");

-- CreateIndex
CREATE UNIQUE INDEX "canonical_products_ean_key" ON "canonical_products"("ean");

-- CreateIndex
CREATE INDEX "canonical_products_category_id_idx" ON "canonical_products"("category_id");

-- CreateIndex
CREATE INDEX "canonical_products_brand_model_idx" ON "canonical_products"("brand", "model");

-- CreateIndex
CREATE INDEX "canonical_products_gtin_idx" ON "canonical_products"("gtin");

-- CreateIndex
CREATE INDEX "canonical_products_normalized_title_idx" ON "canonical_products"("normalized_title");

-- CreateIndex
CREATE INDEX "source_listings_canonical_product_id_idx" ON "source_listings"("canonical_product_id");

-- CreateIndex
CREATE INDEX "source_listings_match_status_idx" ON "source_listings"("match_status");

-- CreateIndex
CREATE INDEX "source_listings_normalized_title_idx" ON "source_listings"("normalized_title");

-- CreateIndex
CREATE INDEX "source_listings_extracted_gtin_idx" ON "source_listings"("extracted_gtin");

-- CreateIndex
CREATE UNIQUE INDEX "source_listings_platform_id_external_id_key" ON "source_listings"("platform_id", "external_id");

-- CreateIndex
CREATE INDEX "price_history_canonical_product_id_recorded_at_idx" ON "price_history"("canonical_product_id", "recorded_at");

-- CreateIndex
CREATE INDEX "price_history_source_listing_id_recorded_at_idx" ON "price_history"("source_listing_id", "recorded_at");

-- CreateIndex
CREATE INDEX "match_decisions_source_listing_id_idx" ON "match_decisions"("source_listing_id");

-- CreateIndex
CREATE INDEX "match_decisions_candidate_id_idx" ON "match_decisions"("candidate_id");

-- CreateIndex
CREATE INDEX "review_queue_resolved_at_idx" ON "review_queue"("resolved_at");

-- CreateIndex
CREATE INDEX "review_queue_priority_idx" ON "review_queue"("priority");

-- CreateIndex
CREATE INDEX "scraping_jobs_platform_id_status_idx" ON "scraping_jobs"("platform_id", "status");

-- CreateIndex
CREATE INDEX "scraping_jobs_status_scheduled_for_idx" ON "scraping_jobs"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "watchlist_items_user_id_idx" ON "watchlist_items"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "watchlist_items_user_id_canonical_product_id_key" ON "watchlist_items"("user_id", "canonical_product_id");

-- CreateIndex
CREATE INDEX "price_alerts_user_id_idx" ON "price_alerts"("user_id");

-- CreateIndex
CREATE INDEX "price_alerts_canonical_product_id_status_idx" ON "price_alerts"("canonical_product_id", "status");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_products" ADD CONSTRAINT "canonical_products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_listings" ADD CONSTRAINT "source_listings_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_listings" ADD CONSTRAINT "source_listings_canonical_product_id_fkey" FOREIGN KEY ("canonical_product_id") REFERENCES "canonical_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_canonical_product_id_fkey" FOREIGN KEY ("canonical_product_id") REFERENCES "canonical_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_source_listing_id_fkey" FOREIGN KEY ("source_listing_id") REFERENCES "source_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_decisions" ADD CONSTRAINT "match_decisions_source_listing_id_fkey" FOREIGN KEY ("source_listing_id") REFERENCES "source_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_queue" ADD CONSTRAINT "review_queue_source_listing_id_fkey" FOREIGN KEY ("source_listing_id") REFERENCES "source_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_queue" ADD CONSTRAINT "review_queue_canonical_product_id_fkey" FOREIGN KEY ("canonical_product_id") REFERENCES "canonical_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_queue_item_id_fkey" FOREIGN KEY ("queue_item_id") REFERENCES "review_queue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scraping_jobs" ADD CONSTRAINT "scraping_jobs_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_canonical_product_id_fkey" FOREIGN KEY ("canonical_product_id") REFERENCES "canonical_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_canonical_product_id_fkey" FOREIGN KEY ("canonical_product_id") REFERENCES "canonical_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
