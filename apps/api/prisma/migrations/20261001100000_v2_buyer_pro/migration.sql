-- v2 plan, phase 2: browser push channel, landed-cost rules.
-- AlterEnum
ALTER TYPE "NotificationChannelType" ADD VALUE 'WEB_PUSH';

-- AlterTable
ALTER TABLE "notification_channels" ADD COLUMN     "push_subscription" JSONB;

-- CreateTable
CREATE TABLE "landed_cost_rules" (
    "id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "category_id" TEXT,
    "shipping_flat" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shipping_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "customs_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vat_pct" DOUBLE PRECISION NOT NULL DEFAULT 14,
    "handling_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "delivery_days" VARCHAR(32),
    "notes" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "landed_cost_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "landed_cost_rules_platform_id_category_id_key" ON "landed_cost_rules"("platform_id", "category_id");

-- AddForeignKey
ALTER TABLE "landed_cost_rules" ADD CONSTRAINT "landed_cost_rules_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landed_cost_rules" ADD CONSTRAINT "landed_cost_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Data: paid plans gain the browser push channel (free keeps inbox + email).
-- Additive and idempotent, like the phase 1 feature keys.
UPDATE "plans" SET "limits" = jsonb_set("limits", '{notificationChannels}', (
  SELECT COALESCE(jsonb_agg(DISTINCT c), '[]'::jsonb) FROM jsonb_array_elements_text(
    COALESCE("limits"->'notificationChannels', '[]'::jsonb) || '["WEB_PUSH"]'::jsonb
  ) AS c))
WHERE "tier" IN ('PLUS', 'SELLER', 'ENTERPRISE');

-- Data: a starting rule per cross-border store. PLACEHOLDER rates, shown to
-- buyers as an estimate with the assumptions spelled out; the owner reviews
-- them in /admin/landed-cost. Only stores that exist get one.
INSERT INTO "landed_cost_rules" ("id", "platform_id", "customs_pct", "vat_pct", "delivery_days", "notes", "updated_at")
SELECT gen_random_uuid()::text, p."id", 15, 14, d.days, 'Placeholder rates: review before relying on them', CURRENT_TIMESTAMP
FROM "platforms" p
JOIN (VALUES ('aliexpress', '10-25'), ('alibaba', '15-35'), ('ebay', '10-25'), ('walmart', '10-25')) AS d(slug, days) ON d.slug = p."slug"
WHERE NOT EXISTS (SELECT 1 FROM "landed_cost_rules" r WHERE r."platform_id" = p."id" AND r."category_id" IS NULL);
