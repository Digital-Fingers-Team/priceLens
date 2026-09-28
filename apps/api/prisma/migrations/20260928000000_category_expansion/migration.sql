-- Category expansion: Arabic name, rollout wave, price floor override, sweep rotation.
ALTER TABLE "categories" ADD COLUMN "name_ar" VARCHAR(128);
ALTER TABLE "categories" ADD COLUMN "rollout_wave" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "categories" ADD COLUMN "min_price_egp" DECIMAL(12,2);
ALTER TABLE "categories" ADD COLUMN "last_swept_at" TIMESTAMP(3);

-- Every category that exists now is an original one: no price floor. New
-- categories keep NULL, which means the global MIN_LISTING_PRICE_EGP. Done
-- here, not only in the seed, so the floor never applies to the original
-- categories between this migration and the seed run.
UPDATE "categories" SET "min_price_egp" = 0;

CREATE INDEX "categories_rollout_wave_idx" ON "categories"("rollout_wave");
