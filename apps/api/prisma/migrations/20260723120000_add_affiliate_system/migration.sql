-- CreateTable
CREATE TABLE "affiliate_configs" (
    "id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "provider_key" VARCHAR(64) NOT NULL,
    "affiliate_id" TEXT NOT NULL,
    "tracking_params" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_clicks" (
    "id" TEXT NOT NULL,
    "source_listing_id" TEXT NOT NULL,
    "canonical_product_id" TEXT,
    "platform_id" TEXT NOT NULL,
    "user_id" TEXT,
    "ip_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "affiliate_url" TEXT NOT NULL,
    "clicked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_configs_platform_id_key" ON "affiliate_configs"("platform_id");

-- CreateIndex
CREATE INDEX "affiliate_clicks_source_listing_id_idx" ON "affiliate_clicks"("source_listing_id");

-- CreateIndex
CREATE INDEX "affiliate_clicks_canonical_product_id_idx" ON "affiliate_clicks"("canonical_product_id");

-- CreateIndex
CREATE INDEX "affiliate_clicks_platform_id_idx" ON "affiliate_clicks"("platform_id");

-- CreateIndex
CREATE INDEX "affiliate_clicks_user_id_idx" ON "affiliate_clicks"("user_id");

-- CreateIndex
CREATE INDEX "affiliate_clicks_clicked_at_idx" ON "affiliate_clicks"("clicked_at");

-- AddForeignKey
ALTER TABLE "affiliate_configs" ADD CONSTRAINT "affiliate_configs_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_source_listing_id_fkey" FOREIGN KEY ("source_listing_id") REFERENCES "source_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_canonical_product_id_fkey" FOREIGN KEY ("canonical_product_id") REFERENCES "canonical_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
