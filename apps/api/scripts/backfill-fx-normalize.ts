// One-off backfill: recompute `priceUsd` (the base-currency, normalized
// comparison value) for every existing SourceListing and PriceHistory row.
// Needed because before FxRatesService existed, `priceUsd` was just a copy of
// the raw scraped amount in whatever currency the store used -- e.g. a
// Carrefour AED price and a 2B EGP price were stored as if they were the same
// unit, so cross-store min/max/avg/best-deal comparisons on existing rows are
// wrong until this runs once. New rows are normalized correctly going forward
// by live-ingestion.service.ts.
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { FxRatesService } from '../src/matching/fx-rates.service';
import pricingConfig from '../src/config/pricing.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [pricingConfig],
      envFilePath: ['../../.env.local', '../../.env'],
      cache: true,
    }),
  ],
  providers: [FxRatesService],
})
class FxBackfillModule {}

function toDbDecimal(value: number): string {
  return value.toFixed(2);
}

async function main() {
  const app = await NestFactory.createApplicationContext(FxBackfillModule, { logger: ['log', 'warn', 'error'] });
  const fxRates = app.get(FxRatesService);
  const prisma = new PrismaClient();

  const listings = await prisma.sourceListing.findMany({
    where: { rawPrice: { not: null } },
    select: { id: true, rawPrice: true, rawCurrency: true, priceUsd: true },
  });

  let listingsUpdated = 0;
  for (const listing of listings) {
    const raw = Number(listing.rawPrice);
    if (!Number.isFinite(raw)) continue;

    const normalized = await fxRates.convert(raw, listing.rawCurrency);
    const normalizedStr = toDbDecimal(normalized);
    if (listing.priceUsd == null || Number(listing.priceUsd) !== Number(normalizedStr)) {
      await prisma.sourceListing.update({
        where: { id: listing.id },
        data: { priceUsd: normalizedStr },
      });
      listingsUpdated += 1;
    }
  }
  console.log(`Updated ${listingsUpdated}/${listings.length} source listings.`);

  // `originalPrice` is treated as the immutable ground-truth raw amount (never
  // rewritten here or by live-ingestion.service.ts going forward) and the
  // listing's `rawCurrency` (joined, not PriceHistory.currency) is the
  // ground-truth original currency -- PriceHistory.currency itself gets
  // overwritten to the base currency below, so it can't be trusted as the
  // "from" currency on a second run of this script.
  const history = await prisma.priceHistory.findMany({
    select: {
      id: true,
      priceUsd: true,
      currency: true,
      originalPrice: true,
      sourceListing: { select: { rawCurrency: true } },
    },
  });

  let historyUpdated = 0;
  const baseCurrency = fxRates.base;
  for (const entry of history) {
    const rawAmount = entry.originalPrice != null ? Number(entry.originalPrice) : Number(entry.priceUsd);
    if (!Number.isFinite(rawAmount)) continue;
    const fromCurrency = entry.sourceListing?.rawCurrency;
    if (!fromCurrency) continue;

    const normalized = await fxRates.convert(rawAmount, fromCurrency);
    const normalizedStr = toDbDecimal(normalized);
    if (Number(entry.priceUsd) !== Number(normalizedStr) || entry.currency !== baseCurrency) {
      await prisma.priceHistory.update({
        where: { id: entry.id },
        data: { priceUsd: normalizedStr, currency: baseCurrency },
      });
      historyUpdated += 1;
    }
  }
  console.log(`Updated ${historyUpdated}/${history.length} price history rows.`);

  await prisma.$disconnect();
  await app.close();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
