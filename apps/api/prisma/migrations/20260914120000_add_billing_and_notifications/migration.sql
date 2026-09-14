-- Billing (plans / subscriptions) + notification delivery + richer price alerts.
--
-- NOTE: `prisma migrate diff` also proposed dropping six indexes that exist in
-- production but are not expressible in the Prisma datamodel -- the pgvector
-- HNSW index on canonical_products.title_embedding, the pg_trgm indexes on
-- canonical_products.title and source_listings.raw_title, and the covering /
-- BRIN indexes on price_history. Those were created by earlier raw-SQL
-- migrations and are load-bearing for semantic matching and search. They are
-- deliberately NOT dropped here.

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PLUS', 'SELLER', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'INCOMPLETE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "NotificationChannelType" AS ENUM ('IN_APP', 'EMAIL', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- AlterEnum: new alert types. PostgreSQL 12+ permits ADD VALUE inside a
-- transaction as long as the value is not *used* in the same transaction,
-- which it is not here.
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'LOWEST_EVER';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'PRICE_INCREASE';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'RESTOCK';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'MAJOR_DISCOUNT';

-- AlterTable
ALTER TABLE "price_alerts"
  ADD COLUMN "cooldown_hours"     INTEGER   NOT NULL DEFAULT 24,
  ADD COLUMN "last_notified_at"   TIMESTAMP(3),
  ADD COLUMN "last_seen_in_stock" BOOLEAN,
  ADD COLUMN "repeatable"         BOOLEAN   NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "tier" "PlanTier" NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "description" TEXT,
    "price_minor" INTEGER NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'EGP',
    "interval_days" INTEGER NOT NULL DEFAULT 30,
    "stripe_price_id" TEXT,
    "limits" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "trial_days" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "provider" VARCHAR(32) NOT NULL DEFAULT 'manual',
    "provider_customer_id" TEXT,
    "provider_subscription_id" TEXT,
    "current_period_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_period_end" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "canceled_at" TIMESTAMP(3),
    "trial_ends_at" TIMESTAMP(3),
    "limit_overrides" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_events" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "user_id" TEXT,
    "type" VARCHAR(64) NOT NULL,
    "from_plan_key" VARCHAR(64),
    "to_plan_key" VARCHAR(64),
    "provider" VARCHAR(32) NOT NULL DEFAULT 'manual',
    "provider_event_id" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_channels" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationChannelType" NOT NULL,
    "destination" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verify_token" VARCHAR(64),
    "verify_expires_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "price_alert_id" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "channel_id" TEXT,
    "channel_type" "NotificationChannelType" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_key_key" ON "plans"("key");
CREATE UNIQUE INDEX "plans_stripe_price_id_key" ON "plans"("stripe_price_id");
CREATE INDEX "plans_tier_is_active_idx" ON "plans"("tier", "is_active");

CREATE UNIQUE INDEX "subscriptions_provider_subscription_id_key" ON "subscriptions"("provider_subscription_id");
CREATE INDEX "subscriptions_user_id_status_idx" ON "subscriptions"("user_id", "status");
CREATE INDEX "subscriptions_status_current_period_end_idx" ON "subscriptions"("status", "current_period_end");
CREATE INDEX "subscriptions_provider_customer_id_idx" ON "subscriptions"("provider_customer_id");

-- A user may hold at most ONE entitlement-granting subscription at a time.
-- Enforced in the database rather than only in service code so a duplicate
-- Stripe webhook or a race between checkout and a manual grant cannot leave a
-- user with two live plans and an ambiguous limit resolution. Terminal states
-- (CANCELED / EXPIRED) are excluded so history is retained.
CREATE UNIQUE INDEX "subscriptions_one_live_per_user"
  ON "subscriptions"("user_id")
  WHERE "status" IN ('TRIALING', 'ACTIVE', 'PAST_DUE', 'INCOMPLETE');

CREATE INDEX "subscription_events_subscription_id_idx" ON "subscription_events"("subscription_id");
CREATE INDEX "subscription_events_user_id_created_at_idx" ON "subscription_events"("user_id", "created_at");
CREATE UNIQUE INDEX "subscription_events_provider_provider_event_id_key" ON "subscription_events"("provider", "provider_event_id");

CREATE INDEX "notification_channels_user_id_idx" ON "notification_channels"("user_id");
CREATE INDEX "notification_channels_verify_token_idx" ON "notification_channels"("verify_token");
CREATE UNIQUE INDEX "notification_channels_user_id_type_key" ON "notification_channels"("user_id", "type");

CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

CREATE INDEX "notification_deliveries_status_created_at_idx" ON "notification_deliveries"("status", "created_at");
CREATE UNIQUE INDEX "notification_deliveries_notification_id_channel_type_key" ON "notification_deliveries"("notification_id", "channel_type");

CREATE INDEX "price_alerts_status_last_checked_at_idx" ON "price_alerts"("status", "last_checked_at");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_price_alert_id_fkey" FOREIGN KEY ("price_alert_id") REFERENCES "price_alerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "notification_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
