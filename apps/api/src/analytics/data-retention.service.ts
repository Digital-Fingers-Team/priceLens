import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

/** Rows per DELETE, so a large first run never holds a long lock. */
const BATCH = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RetentionResult {
  pageViews: number;
  affiliateClicksDeleted: number;
  affiliateClicksAnonymised: number;
  sessions: number;
}

/**
 * Deletes personal data the privacy policy says is not kept forever
 * (apps/web/src/lib/legal, "How long we keep it"): page views and store
 * clicks once they are no longer useful for statistics, and sign-in
 * sessions long after they ended. Runs daily in the worker.
 *
 * A click that earned a commission is kept, because the conversion row
 * (the money record) cascades from it, but loses what identifies the
 * person: user, browser and IP hash.
 */
@Injectable()
export class DataRetentionService {
  private readonly logger = new Logger(DataRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async run(now = new Date()): Promise<RetentionResult> {
    const cutoff = (key: string, fallback: number) =>
      new Date(now.getTime() - this.config.get<number>(`retailers.${key}`, fallback) * DAY_MS);
    const analyticsCutoff = cutoff('pageViewRetentionDays', 395);
    const clickCutoff = cutoff('affiliateClickRetentionDays', 395);
    const sessionCutoff = cutoff('sessionRetentionDays', 90);

    const pageViews = await this.inBatches(
      Prisma.sql`DELETE FROM "page_views" WHERE "id" IN (
        SELECT "id" FROM "page_views" WHERE "created_at" < ${analyticsCutoff} LIMIT ${BATCH})`,
    );
    const affiliateClicksDeleted = await this.inBatches(
      Prisma.sql`DELETE FROM "affiliate_clicks" WHERE "id" IN (
        SELECT c."id" FROM "affiliate_clicks" c
        WHERE c."clicked_at" < ${clickCutoff}
          AND NOT EXISTS (SELECT 1 FROM "affiliate_conversions" v WHERE v."click_id" = c."id")
        LIMIT ${BATCH})`,
    );
    const affiliateClicksAnonymised = await this.prisma.$executeRaw(
      Prisma.sql`UPDATE "affiliate_clicks" SET "user_id" = NULL, "user_agent" = NULL, "ip_hash" = ''
        WHERE "clicked_at" < ${clickCutoff} AND "ip_hash" <> ''`,
    );
    // Ended = past its expiry or revoked (logout, rotation). Kept for a while
    // after that so a replayed refresh token can still be recognised (S-05).
    const sessions = await this.inBatches(
      Prisma.sql`DELETE FROM "sessions" WHERE "id" IN (
        SELECT "id" FROM "sessions"
        WHERE LEAST("expires_at", COALESCE("revoked_at", "expires_at")) < ${sessionCutoff}
        LIMIT ${BATCH})`,
    );

    const result = { pageViews, affiliateClicksDeleted, affiliateClicksAnonymised, sessions };
    this.logger.log(`Data retention: ${JSON.stringify(result)}`);
    return result;
  }

  private async inBatches(statement: Prisma.Sql): Promise<number> {
    let total = 0;
    for (;;) {
      const deleted = await this.prisma.$executeRaw(statement);
      total += deleted;
      if (deleted < BATCH) return total;
    }
  }
}
