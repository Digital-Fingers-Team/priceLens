-- The store's advertised "was" price, normalised to the same base currency as
-- price_usd.
--
-- Fake-discount detection previously had no honest input: price_history's
-- `original_price` column, despite the name, holds the store's raw pre-FX
-- price (the same price in another currency), not a previous one. Nullable
-- with no backfill on purpose -- "no discount claimed" is the truthful answer
-- for every row we have not actually observed one for.
ALTER TABLE "source_listings" ADD COLUMN "advertised_price" DECIMAL(12,2);

-- Supports the "cheapest listing currently claiming a discount" lookup without
-- scanning the table; partial because the overwhelming majority of rows will
-- never have an advertised price.
CREATE INDEX "source_listings_advertised_price_idx"
  ON "source_listings"("canonical_product_id")
  WHERE "advertised_price" IS NOT NULL;
