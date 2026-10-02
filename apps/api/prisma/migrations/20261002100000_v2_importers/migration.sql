-- CreateEnum
CREATE TYPE "FxSource" AS ENUM ('CBE', 'MARKET');

-- CreateEnum
CREATE TYPE "TrendScope" AS ENUM ('CATEGORY', 'PRODUCT');

-- CreateTable
CREATE TABLE "fx_rates" (
    "id" TEXT NOT NULL,
    "source" "FxSource" NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "buy" DECIMAL(14,4),
    "sell" DECIMAL(14,4),
    "mid" DECIMAL(14,4) NOT NULL,
    "rate_date" DATE NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_opportunities" (
    "id" TEXT NOT NULL,
    "canonical_product_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "source_listing_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "import_price" DECIMAL(12,2) NOT NULL,
    "landed_cost" DECIMAL(12,2) NOT NULL,
    "local_lowest" DECIMAL(12,2) NOT NULL,
    "local_median" DECIMAL(12,2) NOT NULL,
    "local_stores" INTEGER NOT NULL,
    "margin_egp" DECIMAL(12,2) NOT NULL,
    "margin_pct" DOUBLE PRECISION NOT NULL,
    "volatility_pct" DOUBLE PRECISION,
    "interest" INTEGER NOT NULL DEFAULT 0,
    "review_count" INTEGER,
    "demand_score" DOUBLE PRECISION NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trend_signals" (
    "id" TEXT NOT NULL,
    "week_start" DATE NOT NULL,
    "scope" "TrendScope" NOT NULL,
    "category_id" TEXT,
    "canonical_product_id" TEXT,
    "price_change_pct" DOUBLE PRECISION,
    "supply" INTEGER NOT NULL,
    "supply_before" INTEGER NOT NULL,
    "interest" INTEGER NOT NULL,
    "interest_before" INTEGER NOT NULL,
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "score" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trend_signals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fx_rates_currency_rate_date_idx" ON "fx_rates"("currency", "rate_date");

-- CreateIndex
CREATE UNIQUE INDEX "fx_rates_source_currency_rate_date_key" ON "fx_rates"("source", "currency", "rate_date");

-- CreateIndex
CREATE UNIQUE INDEX "import_opportunities_canonical_product_id_key" ON "import_opportunities"("canonical_product_id");

-- CreateIndex
CREATE INDEX "import_opportunities_score_idx" ON "import_opportunities"("score");

-- CreateIndex
CREATE INDEX "import_opportunities_category_id_score_idx" ON "import_opportunities"("category_id", "score");

-- CreateIndex
CREATE INDEX "trend_signals_week_start_scope_score_idx" ON "trend_signals"("week_start", "scope", "score");

-- CreateIndex
CREATE INDEX "trend_signals_category_id_idx" ON "trend_signals"("category_id");

-- CreateIndex
CREATE INDEX "trend_signals_canonical_product_id_idx" ON "trend_signals"("canonical_product_id");

-- AddForeignKey
ALTER TABLE "import_opportunities" ADD CONSTRAINT "import_opportunities_canonical_product_id_fkey" FOREIGN KEY ("canonical_product_id") REFERENCES "canonical_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_opportunities" ADD CONSTRAINT "import_opportunities_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_opportunities" ADD CONSTRAINT "import_opportunities_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trend_signals" ADD CONSTRAINT "trend_signals_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trend_signals" ADD CONSTRAINT "trend_signals_canonical_product_id_fkey" FOREIGN KEY ("canonical_product_id") REFERENCES "canonical_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

