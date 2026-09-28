-- Category expansion: Arabic name, rollout wave, price floor override, sweep rotation.
ALTER TABLE "categories" ADD COLUMN "name_ar" VARCHAR(128);
ALTER TABLE "categories" ADD COLUMN "rollout_wave" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "categories" ADD COLUMN "min_price_egp" DECIMAL(12,2);
ALTER TABLE "categories" ADD COLUMN "last_swept_at" TIMESTAMP(3);

CREATE INDEX "categories_rollout_wave_idx" ON "categories"("rollout_wave");
