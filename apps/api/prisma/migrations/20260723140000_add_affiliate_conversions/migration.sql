-- CreateEnum
CREATE TYPE "ConversionStatus" AS ENUM ('PENDING', 'APPROVED', 'REVERSED');

-- CreateTable
CREATE TABLE "affiliate_conversions" (
    "id" TEXT NOT NULL,
    "click_id" TEXT NOT NULL,
    "network_key" VARCHAR(64) NOT NULL,
    "external_action_id" TEXT NOT NULL,
    "status" "ConversionStatus" NOT NULL DEFAULT 'PENDING',
    "sale_amount" DECIMAL(12,2),
    "commission_amount" DECIMAL(12,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "reported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_conversions_network_key_external_action_id_key" ON "affiliate_conversions"("network_key", "external_action_id");

-- CreateIndex
CREATE INDEX "affiliate_conversions_click_id_idx" ON "affiliate_conversions"("click_id");

-- CreateIndex
CREATE INDEX "affiliate_conversions_status_idx" ON "affiliate_conversions"("status");

-- CreateIndex
CREATE INDEX "affiliate_conversions_occurred_at_idx" ON "affiliate_conversions"("occurred_at");

-- AddForeignKey
ALTER TABLE "affiliate_conversions" ADD CONSTRAINT "affiliate_conversions_click_id_fkey" FOREIGN KEY ("click_id") REFERENCES "affiliate_clicks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
