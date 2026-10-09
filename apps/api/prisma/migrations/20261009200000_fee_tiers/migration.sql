-- Tiered and minimum commissions for the sellers' fee tables. Additive.
ALTER TABLE "platform_fee_tables"
  ADD COLUMN "tier_up_to" DECIMAL(12,2),
  ADD COLUMN "commission_pct_above" DOUBLE PRECISION,
  ADD COLUMN "tier_whole_price" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "min_commission" DECIMAL(12,2) NOT NULL DEFAULT 0;
