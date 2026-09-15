import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CompetitorEventType,
  EventSeverity,
  MatchStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface DetectionResult {
  productsScanned: number;
  eventsRecorded: number;
  notificationsSent: number;
}

/** One store's current state for a product, plus what it was before. */
interface CompetitorObservation {
  canonicalProductId: string;
  platformId: string;
  platformName: string;
  externalUrl: string;
  currentPrice: number;
  previousPrice: number | null;
  inStock: boolean | null;
  previouslyInStock: boolean | null;
  /** True when this store has no history for the product before today. */
  isNew: boolean;
  /** Typical day-to-day variation, used to judge "unusual". */
  volatility: number | null;
}

/**
 * Detects competitor changes for every monitored seller product.
 *
 * Runs as a scheduled sweep after ingestion. Every event is written with a
 * deterministic `dedupeKey`, so re-running the sweep -- after a crash, or
 * because two workers overlapped -- records nothing twice.
 *
 * Detection is separate from notification on purpose: events are the
 * evidence trail behind the dashboard and the reports whether or not anyone
 * asked to be alerted, and alert rules only decide what is worth interrupting
 * someone for.
 */
@Injectable()
export class CompetitorDetectionService {
  private readonly logger = new Logger(CompetitorDetectionService.name);
  private readonly currency: string;

  /** A move beyond this many multiples of normal variation is "unusual". */
  private static readonly UNUSUAL_SIGMA = 3;
  /** Ignore sub-percent noise; stores round prices constantly. */
  private static readonly MIN_CHANGE_PCT = 1;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    config: ConfigService,
  ) {
    this.currency = config.get<string>('pricing.fxBaseCurrency', 'EGP');
  }

  async detectForAllOrganizations(batchSize = 200): Promise<DetectionResult> {
    const products = await this.prisma.sellerProduct.findMany({
      where: { isActive: true, canonicalProductId: { not: null } },
      select: {
        id: true,
        orgId: true,
        canonicalProductId: true,
        name: true,
        currentPrice: true,
        organization: { select: { platformId: true } },
      },
      take: batchSize,
    });

    if (products.length === 0) return { productsScanned: 0, eventsRecorded: 0, notificationsSent: 0 };

    const canonicalIds = [...new Set(products.map((p) => p.canonicalProductId as string))];
    const observations = await this.observe(canonicalIds);

    let eventsRecorded = 0;
    let notificationsSent = 0;

    for (const product of products) {
      const forProduct = observations.get(product.canonicalProductId as string) ?? [];
      const ourPlatformId = product.organization.platformId;
      const ourPrice = product.currentPrice != null ? Number(product.currentPrice) : null;

      for (const observation of forProduct) {
        // Our own storefront is not a competitor.
        if (ourPlatformId && observation.platformId === ourPlatformId) continue;

        for (const candidate of this.classify(observation, ourPrice)) {
          const recorded = await this.record(product.orgId, product.id, observation, candidate);
          if (!recorded) continue;

          eventsRecorded += 1;
          notificationsSent += await this.maybeNotify(product.orgId, product.id, product.name, observation, candidate);
        }
      }
    }

    if (eventsRecorded > 0) {
      this.logger.log(
        `Competitor sweep: ${products.length} product(s), ${eventsRecorded} event(s), ${notificationsSent} notification(s)`,
      );
    }

    return { productsScanned: products.length, eventsRecorded, notificationsSent };
  }

  /**
   * Current vs previous state per (product, store).
   *
   * "Previous" is the most recent price recorded strictly before the current
   * one -- not yesterday's -- because price history is change-only and a
   * stable competitor simply has no recent row.
   */
  private async observe(canonicalIds: string[]): Promise<Map<string, CompetitorObservation[]>> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        canonical_product_id: string;
        platform_id: string;
        platform_name: string;
        external_url: string;
        current_price: Prisma.Decimal;
        in_stock: boolean | null;
        previous_price: Prisma.Decimal | null;
        previous_in_stock: boolean | null;
        first_seen_at: Date;
        stddev: number | null;
        avg_price: number | null;
      }>
    >`
      WITH live AS (
        SELECT DISTINCT ON (sl.canonical_product_id, sl.platform_id)
               sl.canonical_product_id,
               sl.platform_id,
               sl.id AS listing_id,
               sl.external_url,
               sl.price_usd AS current_price,
               sl.in_stock,
               sl.first_seen_at
        FROM source_listings sl
        WHERE sl.canonical_product_id = ANY(${canonicalIds}::text[])
          AND sl.price_usd IS NOT NULL
          AND sl.price_usd > 0
          AND sl.match_status IN (${MatchStatus.ACCEPTED}::"MatchStatus", ${MatchStatus.MANUAL_ACCEPT}::"MatchStatus")
        ORDER BY sl.canonical_product_id, sl.platform_id, sl.price_usd ASC
      )
      SELECT live.canonical_product_id,
             live.platform_id,
             p.name AS platform_name,
             live.external_url,
             live.current_price,
             live.in_stock,
             live.first_seen_at,
             prev.price_usd AS previous_price,
             prev.in_stock  AS previous_in_stock,
             stats.stddev,
             stats.avg_price
      FROM live
      JOIN platforms p ON p.id = live.platform_id
      -- The last DIFFERENT price this listing had. History is change-only, so
      -- this is the previous price however long ago it was set.
      LEFT JOIN LATERAL (
        SELECT ph.price_usd, ph.in_stock
        FROM price_history ph
        WHERE ph.source_listing_id = live.listing_id
          AND ph.price_usd <> live.current_price
        ORDER BY ph.recorded_at DESC
        LIMIT 1
      ) prev ON TRUE
      -- Normal variation for this listing, to judge an unusual move.
      LEFT JOIN LATERAL (
        SELECT STDDEV_SAMP(ph.price_usd)::float8 AS stddev,
               AVG(ph.price_usd)::float8         AS avg_price
        FROM price_history ph
        WHERE ph.source_listing_id = live.listing_id
          AND ph.recorded_at >= NOW() - INTERVAL '90 days'
      ) stats ON TRUE
    `;

    const map = new Map<string, CompetitorObservation[]>();
    const newEntrantCutoff = Date.now() - 2 * 86_400_000;

    for (const row of rows) {
      const bucket = map.get(row.canonical_product_id) ?? [];
      const avg = row.avg_price ?? 0;

      bucket.push({
        canonicalProductId: row.canonical_product_id,
        platformId: row.platform_id,
        platformName: row.platform_name,
        externalUrl: row.external_url,
        currentPrice: Number(row.current_price),
        previousPrice: row.previous_price != null ? Number(row.previous_price) : null,
        inStock: row.in_stock,
        previouslyInStock: row.previous_in_stock,
        isNew: row.first_seen_at.getTime() >= newEntrantCutoff,
        volatility: row.stddev != null && avg > 0 ? row.stddev / avg : null,
      });
      map.set(row.canonical_product_id, bucket);
    }

    return map;
  }

  /** Which events, if any, this observation represents. */
  private classify(
    observation: CompetitorObservation,
    ourPrice: number | null,
  ): Array<{ type: CompetitorEventType; severity: EventSeverity; changePct: number | null }> {
    const events: Array<{ type: CompetitorEventType; severity: EventSeverity; changePct: number | null }> = [];

    if (observation.isNew) {
      events.push({ type: CompetitorEventType.NEW_ENTRANT, severity: EventSeverity.INFO, changePct: null });
    }

    // Stock transitions require a genuine before-and-after; unknown stock
    // must not be read as a change.
    if (observation.previouslyInStock === true && observation.inStock === false) {
      events.push({ type: CompetitorEventType.OUT_OF_STOCK, severity: EventSeverity.INFO, changePct: null });
    } else if (observation.previouslyInStock === false && observation.inStock === true) {
      events.push({ type: CompetitorEventType.BACK_IN_STOCK, severity: EventSeverity.INFO, changePct: null });
    }

    const previous = observation.previousPrice;
    if (previous != null && previous > 0) {
      const changePct = ((observation.currentPrice - previous) / previous) * 100;

      if (Math.abs(changePct) >= CompetitorDetectionService.MIN_CHANGE_PCT) {
        const unusual =
          observation.volatility != null &&
          observation.volatility > 0 &&
          Math.abs(changePct) / 100 > observation.volatility * CompetitorDetectionService.UNUSUAL_SIGMA;

        events.push({
          type: changePct < 0 ? CompetitorEventType.PRICE_DROP : CompetitorEventType.PRICE_INCREASE,
          severity:
            Math.abs(changePct) >= 15
              ? EventSeverity.CRITICAL
              : Math.abs(changePct) >= 5
                ? EventSeverity.WARNING
                : EventSeverity.INFO,
          changePct,
        });

        if (unusual) {
          events.push({
            type: CompetitorEventType.UNUSUAL_MOVEMENT,
            severity: EventSeverity.WARNING,
            changePct,
          });
        }
      }
    }

    // Undercutting only means something once we know our own price.
    if (ourPrice != null && ourPrice > 0 && observation.currentPrice < ourPrice) {
      const gapPct = ((ourPrice - observation.currentPrice) / ourPrice) * 100;
      if (gapPct >= CompetitorDetectionService.MIN_CHANGE_PCT) {
        events.push({
          type: CompetitorEventType.UNDERCUT,
          severity: gapPct >= 10 ? EventSeverity.CRITICAL : EventSeverity.WARNING,
          changePct: -gapPct,
        });
      }
    }

    return events;
  }

  /** Returns false when the event already exists for today. */
  private async record(
    orgId: string,
    sellerProductId: string,
    observation: CompetitorObservation,
    candidate: { type: CompetitorEventType; severity: EventSeverity; changePct: number | null },
  ): Promise<boolean> {
    const day = new Date().toISOString().slice(0, 10);
    const dedupeKey = `${observation.canonicalProductId}:${observation.platformId}:${candidate.type}:${day}`;

    try {
      await this.prisma.competitorEvent.create({
        data: {
          orgId,
          sellerProductId,
          canonicalProductId: observation.canonicalProductId,
          platformId: observation.platformId,
          type: candidate.type,
          severity: candidate.severity,
          previousPrice: this.toDecimal(observation.previousPrice),
          newPrice: this.toDecimal(observation.currentPrice),
          changePct: candidate.changePct,
          dedupeKey,
          evidence: {
            store: observation.platformName,
            url: observation.externalUrl,
            inStock: observation.inStock,
            observedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
      return true;
    } catch (error) {
      // P2002 is the dedupe constraint doing its job, not a failure.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false;
      this.logger.error(`Could not record competitor event: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Notifies the workspace when a rule asks for it.
   *
   * Notifications go to every member, because a price change is workspace
   * news rather than one person's. The rule's cooldown stops a volatile
   * competitor generating a stream of interruptions.
   */
  private async maybeNotify(
    orgId: string,
    sellerProductId: string,
    productName: string,
    observation: CompetitorObservation,
    candidate: { type: CompetitorEventType; severity: EventSeverity; changePct: number | null },
  ): Promise<number> {
    const rule = await this.prisma.competitorAlertRule.findFirst({
      where: {
        orgId,
        type: candidate.type,
        isActive: true,
        OR: [{ sellerProductId }, { sellerProductId: null }],
      },
      // A product-specific rule wins over the catalogue-wide default.
      orderBy: { sellerProductId: { sort: 'desc', nulls: 'last' } },
    });

    if (!rule) return 0;

    if (candidate.changePct != null && Math.abs(candidate.changePct) < rule.thresholdPct) return 0;

    if (rule.lastFiredAt) {
      const elapsedHours = (Date.now() - rule.lastFiredAt.getTime()) / 3_600_000;
      if (elapsedHours < rule.cooldownHours) return 0;
    }

    const members = await this.prisma.organizationMember.findMany({
      where: { orgId },
      select: { userId: true },
    });

    const money = (value: number) => `${Math.round(value).toLocaleString('en-US')} ${this.currency}`;
    const title = this.headline(candidate.type, observation, productName);
    const body =
      candidate.changePct != null && observation.previousPrice != null
        ? `${observation.platformName}: ${money(observation.previousPrice)} → ${money(observation.currentPrice)} ` +
          `(${candidate.changePct > 0 ? '+' : ''}${candidate.changePct.toFixed(1)}%)`
        : `${observation.platformName} — now ${money(observation.currentPrice)}`;

    let sent = 0;
    for (const member of members) {
      const result = await this.notifications.dispatch({
        userId: member.userId,
        type: `competitor.${candidate.type.toLowerCase()}`,
        title,
        body,
        path: `/seller/${orgId}/products/${sellerProductId}`,
        data: {
          orgId,
          sellerProductId,
          eventType: candidate.type,
          platform: observation.platformName,
          price: observation.currentPrice,
          previousPrice: observation.previousPrice,
          changePct: candidate.changePct,
          currency: this.currency,
        },
        dedupeKey: `competitor:${orgId}:${sellerProductId}:${candidate.type}:${new Date().toISOString().slice(0, 10)}`,
        dedupeWindowMinutes: Math.max(rule.cooldownHours * 60, 60),
      });
      if (result.notificationId) sent += 1;
    }

    await this.prisma.competitorAlertRule.update({
      where: { id: rule.id },
      data: { lastFiredAt: new Date() },
    });

    return sent;
  }

  private headline(
    type: CompetitorEventType,
    observation: CompetitorObservation,
    productName: string,
  ): string {
    switch (type) {
      case CompetitorEventType.PRICE_DROP:
        return `${observation.platformName} cut the price of ${productName}`;
      case CompetitorEventType.PRICE_INCREASE:
        return `${observation.platformName} raised the price of ${productName}`;
      case CompetitorEventType.UNDERCUT:
        return `${observation.platformName} is undercutting you on ${productName}`;
      case CompetitorEventType.OUT_OF_STOCK:
        return `${observation.platformName} is out of stock on ${productName}`;
      case CompetitorEventType.BACK_IN_STOCK:
        return `${observation.platformName} restocked ${productName}`;
      case CompetitorEventType.NEW_ENTRANT:
        return `${observation.platformName} started selling ${productName}`;
      case CompetitorEventType.UNUSUAL_MOVEMENT:
        return `Unusual price movement on ${productName} at ${observation.platformName}`;
      default:
        return `Competitor change on ${productName}`;
    }
  }

  private toDecimal(value: number | null): Prisma.Decimal | null {
    if (value == null || !Number.isFinite(value) || value <= 0) return null;
    return new Prisma.Decimal(value.toFixed(2));
  }
}
