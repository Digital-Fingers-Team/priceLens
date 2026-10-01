-- v2 plan, phase 1: online invoices (PaymentProvider), feature flags,
-- workspace invites, the daily price rollup, and renewal reminders.
-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELED', 'REFUNDED');

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "renewal_reminder_sent_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "price_daily" (
    "source_listing_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "min_price" DECIMAL(12,2) NOT NULL,
    "max_price" DECIMAL(12,2) NOT NULL,
    "avg_price" DECIMAL(12,2) NOT NULL,
    "close_price" DECIMAL(12,2) NOT NULL,
    "in_stock" BOOLEAN NOT NULL,

    CONSTRAINT "price_daily_pkey" PRIMARY KEY ("source_listing_id","day")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "provider_ref" VARCHAR(128),
    "amount_minor" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "period_days" INTEGER NOT NULL,
    "paid_at" TIMESTAMP(3),
    "failure_reason" VARCHAR(255),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "key" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "description" VARCHAR(255),
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "organization_invites" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "token_hash" VARCHAR(64) NOT NULL,
    "invited_by_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "accepted_by" TEXT,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoices_user_id_created_at_idx" ON "invoices"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "invoices_status_created_at_idx" ON "invoices"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_provider_provider_ref_key" ON "invoices"("provider", "provider_ref");

-- CreateIndex
CREATE UNIQUE INDEX "organization_invites_token_hash_key" ON "organization_invites"("token_hash");

-- CreateIndex
CREATE INDEX "organization_invites_org_id_idx" ON "organization_invites"("org_id");

-- CreateIndex
CREATE INDEX "organization_invites_email_idx" ON "organization_invites"("email");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One rollup row per listing per day is written for every listing a price
-- moved on, so this is the access path the nightly job and the charts use.
CREATE INDEX "price_daily_day_idx" ON "price_daily"("day");

-- Data: the existing plan rows gain the v2 feature keys. PlansService only
-- inserts plans whose key is missing, so without this the live Plus, Seller
-- and Enterprise rows would never see them. Additive and idempotent: keys an
-- operator removed by hand before this ran are added back once, never twice.
UPDATE "plans" SET "limits" = jsonb_set("limits", '{features}', (
  SELECT COALESCE(jsonb_agg(DISTINCT f), '[]'::jsonb) FROM jsonb_array_elements_text(
    COALESCE("limits"->'features', '[]'::jsonb) ||
    '["realtime_alerts","landed_cost_detail","installment_comparison","card_offers","verified_coupons","review_summaries","cart_watch","image_search","advisor"]'::jsonb
  ) AS f))
WHERE "tier" IN ('PLUS', 'SELLER', 'ENTERPRISE');

UPDATE "plans" SET "limits" = jsonb_set("limits", '{features}', (
  SELECT COALESCE(jsonb_agg(DISTINCT f), '[]'::jsonb) FROM jsonb_array_elements_text(
    COALESCE("limits"->'features', '[]'::jsonb) ||
    '["profit_calculator","best_platform","repricer_suggest","rank_tracking"]'::jsonb
  ) AS f))
WHERE "tier" IN ('SELLER', 'ENTERPRISE');

UPDATE "plans" SET "limits" = jsonb_set("limits", '{features}', (
  SELECT COALESCE(jsonb_agg(DISTINCT f), '[]'::jsonb) FROM jsonb_array_elements_text(
    COALESCE("limits"->'features', '[]'::jsonb) ||
    '["repricer_auto","import_finder","trend_radar","fx_tracking","procurement_quotes"]'::jsonb
  ) AS f))
WHERE "tier" = 'ENTERPRISE';

-- Seller Plus (seeded on boot) sorts between Seller and Enterprise.
UPDATE "plans" SET "sort_order" = 4 WHERE "key" = 'enterprise_monthly' AND "sort_order" = 3;
