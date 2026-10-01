import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { OPERATIONAL_FLAGS } from '../feature-flags/feature-flags.registry';

/** Days are Cairo days: a sale that starts at midnight local time is one day. */
export const ROLLUP_TIME_ZONE = 'Africa/Cairo';

/**
 * Rolls price_history (one row per price change) up into price_daily (one row
 * per listing per Cairo day: low, high, mean, close, stock at close).
 *
 * Re-rolls from the day before the newest rolled-up day, so the partial
 * current day and a late-arriving row are both corrected on the next run.
 * The first run, on an empty table, backfills everything. Idempotent.
 *
 * Raw rows are not pruned: they are written only on a change, so they grow
 * slowly, and the buy/wait verdict reads them. The rollup is what makes a
 * future retention window safe.
 */
@Injectable()
export class PriceRollupService {
  private readonly logger = new Logger(PriceRollupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
  ) {}

  async run(): Promise<{ rows: number; from: string | null }> {
    if (!(await this.flags.isEnabled(OPERATIONAL_FLAGS.PRICE_DAILY_ROLLUP))) return { rows: 0, from: null };

    const [{ latest }] = await this.prisma.$queryRaw<Array<{ latest: Date | null }>>`
      SELECT max("day") AS latest FROM "price_daily"`;
    const from = latest ? new Date(latest.getTime() - 24 * 60 * 60 * 1000) : null;

    // recorded_at is a UTC timestamp without a zone; the day is taken in Cairo.
    const rows = await this.prisma.$executeRaw`
      INSERT INTO "price_daily"
        ("source_listing_id", "day", "min_price", "max_price", "avg_price", "close_price", "in_stock")
      SELECT
        h."source_listing_id",
        (h."recorded_at" AT TIME ZONE 'UTC' AT TIME ZONE ${ROLLUP_TIME_ZONE})::date AS day,
        min(h."price_usd"),
        max(h."price_usd"),
        round(avg(h."price_usd"), 2),
        (array_agg(h."price_usd" ORDER BY h."recorded_at" DESC))[1],
        (array_agg(h."in_stock" ORDER BY h."recorded_at" DESC))[1]
      FROM "price_history" h
      WHERE ${from}::date IS NULL
         OR (h."recorded_at" AT TIME ZONE 'UTC' AT TIME ZONE ${ROLLUP_TIME_ZONE})::date >= ${from}::date
      GROUP BY 1, 2
      ON CONFLICT ("source_listing_id", "day") DO UPDATE SET
        "min_price" = EXCLUDED."min_price",
        "max_price" = EXCLUDED."max_price",
        "avg_price" = EXCLUDED."avg_price",
        "close_price" = EXCLUDED."close_price",
        "in_stock" = EXCLUDED."in_stock"`;

    this.logger.log(`Price rollup: ${rows} listing-day row(s) written${from ? ` from ${from.toISOString().slice(0, 10)}` : ' (backfill)'}`);
    return { rows, from: from?.toISOString().slice(0, 10) ?? null };
  }
}
