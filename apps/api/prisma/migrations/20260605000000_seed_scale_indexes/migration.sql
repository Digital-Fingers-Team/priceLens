-- Seed resume metadata
CREATE TABLE "seed_runs" (
    "id" TEXT NOT NULL,
    "profile" VARCHAR(32) NOT NULL,
    "seed_version" VARCHAR(64) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "counts" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "seed_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "seed_checkpoints" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "stage" VARCHAR(64) NOT NULL,
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "inserted_rows" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "seed_checkpoints_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "seed_runs_profile_status_idx" ON "seed_runs"("profile", "status");
CREATE INDEX "seed_runs_started_at_idx" ON "seed_runs"("started_at");
CREATE UNIQUE INDEX "seed_checkpoints_run_id_stage_key" ON "seed_checkpoints"("run_id", "stage");
CREATE INDEX "seed_checkpoints_stage_idx" ON "seed_checkpoints"("stage");

ALTER TABLE "seed_checkpoints"
  ADD CONSTRAINT "seed_checkpoints_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "seed_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Text search and matching indexes.
CREATE INDEX IF NOT EXISTS "canonical_products_title_trgm_idx"
  ON "canonical_products" USING GIN ("normalized_title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "canonical_products_brand_trgm_idx"
  ON "canonical_products" USING GIN ("brand" gin_trgm_ops)
  WHERE "brand" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "source_listings_title_trgm_idx"
  ON "source_listings" USING GIN ("normalized_title" gin_trgm_ops)
  WHERE "normalized_title" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "source_listings_raw_title_trgm_idx"
  ON "source_listings" USING GIN ("raw_title" gin_trgm_ops);

-- Current price lookup and min/max aggregation indexes.
CREATE INDEX IF NOT EXISTS "source_listings_canonical_price_idx"
  ON "source_listings"("canonical_product_id", "price_usd")
  WHERE "canonical_product_id" IS NOT NULL AND "price_usd" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "source_listings_platform_price_idx"
  ON "source_listings"("platform_id", "price_usd")
  WHERE "price_usd" IS NOT NULL;

-- Time-series history indexes. BRIN keeps the 20M+ row path compact.
CREATE INDEX IF NOT EXISTS "price_history_recorded_at_brin_idx"
  ON "price_history" USING BRIN ("recorded_at");

CREATE INDEX IF NOT EXISTS "price_history_product_recorded_price_idx"
  ON "price_history"("canonical_product_id", "recorded_at", "price_usd");

CREATE INDEX IF NOT EXISTS "price_history_listing_recorded_price_idx"
  ON "price_history"("source_listing_id", "recorded_at", "price_usd");
