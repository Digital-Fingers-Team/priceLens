-- Seller/brand workspaces: organizations, members, mapped products, and the
-- competitor event trail.
--
-- NOTE: `prisma migrate diff` again proposed dropping six indexes that exist
-- in production but are not expressible in the Prisma datamodel -- the pgvector
-- HNSW index on canonical_products.title_embedding, the pg_trgm indexes on
-- canonical_products.title and source_listings.raw_title, and the covering /
-- BRIN indexes on price_history. They are created by earlier raw-SQL
-- migrations and are load-bearing for search and semantic matching. They are
-- deliberately NOT dropped here.

-- CreateEnum
CREATE TYPE "OrgType" AS ENUM ('SELLER', 'BRAND');

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "CompetitorEventType" AS ENUM ('PRICE_DROP', 'PRICE_INCREASE', 'UNDERCUT', 'OUT_OF_STOCK', 'BACK_IN_STOCK', 'NEW_ENTRANT', 'UNUSUAL_MOVEMENT', 'MAP_VIOLATION');

-- CreateEnum
CREATE TYPE "EventSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "type" "OrgType" NOT NULL DEFAULT 'SELLER',
    "platform_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_products" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "canonical_product_id" TEXT,
    "sku" VARCHAR(128) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "cost" DECIMAL(12,2),
    "current_price" DECIMAL(12,2),
    "target_margin_pct" DOUBLE PRECISION,
    "min_margin_pct" DOUBLE PRECISION,
    "map_price" DECIMAL(12,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_events" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "seller_product_id" TEXT,
    "canonical_product_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "type" "CompetitorEventType" NOT NULL,
    "severity" "EventSeverity" NOT NULL DEFAULT 'INFO',
    "previous_price" DECIMAL(12,2),
    "new_price" DECIMAL(12,2),
    "change_pct" DOUBLE PRECISION,
    "our_price" DECIMAL(12,2),
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "dedupe_key" VARCHAR(255) NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by" TEXT,

    CONSTRAINT "competitor_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_alert_rules" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "type" "CompetitorEventType" NOT NULL,
    "threshold_pct" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "seller_product_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "cooldown_hours" INTEGER NOT NULL DEFAULT 12,
    "last_fired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitor_alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_platform_id_idx" ON "organizations"("platform_id");

-- CreateIndex
CREATE INDEX "organization_members_user_id_idx" ON "organization_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_org_id_user_id_key" ON "organization_members"("org_id", "user_id");

-- CreateIndex
CREATE INDEX "seller_products_org_id_is_active_idx" ON "seller_products"("org_id", "is_active");

-- CreateIndex
CREATE INDEX "seller_products_canonical_product_id_idx" ON "seller_products"("canonical_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "seller_products_org_id_sku_key" ON "seller_products"("org_id", "sku");

-- CreateIndex
CREATE INDEX "competitor_events_org_id_detected_at_idx" ON "competitor_events"("org_id", "detected_at");

-- CreateIndex
CREATE INDEX "competitor_events_org_id_acknowledged_at_idx" ON "competitor_events"("org_id", "acknowledged_at");

-- CreateIndex
CREATE INDEX "competitor_events_seller_product_id_detected_at_idx" ON "competitor_events"("seller_product_id", "detected_at");

-- CreateIndex
CREATE UNIQUE INDEX "competitor_events_org_id_dedupe_key_key" ON "competitor_events"("org_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "competitor_alert_rules_org_id_is_active_idx" ON "competitor_alert_rules"("org_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "competitor_alert_rules_org_id_type_seller_product_id_key" ON "competitor_alert_rules"("org_id", "type", "seller_product_id");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_products" ADD CONSTRAINT "seller_products_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_products" ADD CONSTRAINT "seller_products_canonical_product_id_fkey" FOREIGN KEY ("canonical_product_id") REFERENCES "canonical_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_events" ADD CONSTRAINT "competitor_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_events" ADD CONSTRAINT "competitor_events_seller_product_id_fkey" FOREIGN KEY ("seller_product_id") REFERENCES "seller_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_events" ADD CONSTRAINT "competitor_events_canonical_product_id_fkey" FOREIGN KEY ("canonical_product_id") REFERENCES "canonical_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_events" ADD CONSTRAINT "competitor_events_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_alert_rules" ADD CONSTRAINT "competitor_alert_rules_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

