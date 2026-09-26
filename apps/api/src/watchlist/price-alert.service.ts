import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlertStatus, AlertType, MatchStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OfferPolicy, liveOffers, offerCutoff } from '../prices/offer-rules';

export interface EvaluationResult {
  checked: number;
  triggered: number;
  notified: number;
}

/** Alert types whose evaluation needs historical aggregates. */
const HISTORY_BACKED_TYPES: ReadonlySet<AlertType> = new Set([
  AlertType.LOWEST_EVER,
  AlertType.MAJOR_DISCOUNT,
]);

/** Alert types measured against the price when the alert was created. */
const BASELINE_BACKED_TYPES: ReadonlySet<AlertType> = new Set([
  AlertType.PRICE_DROP_ABSOLUTE,
  AlertType.PRICE_DROP_PERCENT,
  AlertType.PRICE_INCREASE,
]);

/** Per-product market snapshot used to evaluate every alert on that product. */
interface MarketSnapshot {
  /** Cheapest live offer (offer-rules); null when every fresh listing is sold out. */
  bestPrice: number | null;
  /**
   * Any fresh listing in stock -> true; all that report stock are sold out ->
   * false; no store publishes stock -> null.
   */
  inStock: boolean | null;
  storeCount: number;
}

/** Per-product historical aggregates, fetched once for the whole batch. */
interface HistoryAggregate {
  /** Lowest price ever recorded for a listing matched to the product. */
  allTimeLow: number | null;
  /** Median of the last 90 days of daily minimums. */
  trailingMedian: number | null;
  /** Days between the first recorded price and now. */
  dayCount: number;
}

interface TriggerOutcome {
  triggered: boolean;
  /** Filled in only when triggered; drives the notification copy. */
  headline?: string;
  detail?: string;
}

/**
 * Evaluates active price alerts and tells the user when one fires.
 *
 * Previously this only flipped a status column — nothing ever reached the
 * user, which made the entire "track → detect → alert" loop a no-op. Alerts
 * now dispatch through NotificationsService, and support the full set of
 * trigger types.
 *
 * The sweep is idempotent and restartable: it orders by `lastCheckedAt` and
 * stamps it on every alert it touches, so a crash mid-batch resumes where it
 * left off rather than starving the tail of the table.
 */
@Injectable()
export class PriceAlertService {
  private readonly logger = new Logger(PriceAlertService.name);
  private readonly currency: string;
  private readonly offerPolicy: OfferPolicy;
  private readonly marketTimeZone: string;
  /** Depth of drop vs trailing median that counts as a "major" discount. */
  private static readonly MAJOR_DISCOUNT_PCT = 15;
  /** Tolerance for "at its lowest ever", so a 1-piastre gap still counts. */
  private static readonly LOWEST_EVER_TOLERANCE = 1.005;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    config: ConfigService,
  ) {
    this.currency = config.get<string>('pricing.fxBaseCurrency', 'EGP');
    this.offerPolicy = { maxAgeDays: config.get<number>('pricing.offerMaxAgeDays', 7) };
    this.marketTimeZone = config.get<string>('pricing.marketTimeZone', 'Africa/Cairo');
  }

  async evaluateActiveAlerts(batchSize = 500): Promise<EvaluationResult> {
    const alerts = await this.prisma.priceAlert.findMany({
      where: { status: AlertStatus.ACTIVE },
      orderBy: { lastCheckedAt: { sort: 'asc', nulls: 'first' } },
      take: batchSize,
      include: {
        canonicalProduct: { select: { id: true, title: true, slug: true, imageUrl: true } },
      },
    });

    if (alerts.length === 0) return { checked: 0, triggered: 0, notified: 0 };

    const productIds = [...new Set(alerts.map((alert) => alert.canonicalProductId))];

    // Three batched lookups for the whole sweep, rather than per-alert
    // queries. At batchSize=500 the old shape issued well over a thousand
    // round trips per run.
    const needsHistory = alerts.some((alert) => HISTORY_BACKED_TYPES.has(alert.alertType));

    const [markets, histories, baselines] = await Promise.all([
      this.getMarketSnapshots(productIds),
      needsHistory ? this.getHistoryAggregates(productIds) : Promise.resolve(new Map<string, HistoryAggregate>()),
      this.getBaselines(
        alerts
          .filter((alert) => BASELINE_BACKED_TYPES.has(alert.alertType))
          .map((alert) => ({
            alertId: alert.id,
            productId: alert.canonicalProductId,
            createdAt: alert.createdAt,
          })),
      ),
    ]);

    const now = new Date();
    let triggered = 0;
    let notified = 0;

    for (const alert of alerts) {
      const market = markets.get(alert.canonicalProductId);

      // No fresh listing at all. Still stamp lastCheckedAt so this
      // alert does not monopolise the head of the queue forever.
      if (!market) {
        await this.prisma.priceAlert.update({
          where: { id: alert.id },
          data: { lastCheckedAt: now },
        });
        continue;
      }

      // Everything fresh is sold out: nothing can trigger, but the stock
      // state is recorded so RESTOCK sees the transition later.
      if (market.bestPrice === null) {
        await this.prisma.priceAlert.update({
          where: { id: alert.id },
          data: { lastCheckedAt: now, ...(market.inStock !== null ? { lastSeenInStock: market.inStock } : {}) },
        });
        continue;
      }

      const outcome = this.evaluate(
        alert,
        { ...market, bestPrice: market.bestPrice },
        histories.get(alert.canonicalProductId),
        baselines.get(alert.id),
      );

      if (!outcome.triggered) {
        await this.prisma.priceAlert.update({
          where: { id: alert.id },
          data: {
            lastCheckedAt: now,
            // Track stock so RESTOCK can see the transition next time.
            ...(market.inStock !== null ? { lastSeenInStock: market.inStock } : {}),
          },
        });
        continue;
      }

      // Cooldown applies to repeating alerts so an oscillating price cannot
      // notify the user every sweep.
      if (alert.repeatable && alert.lastNotifiedAt) {
        const elapsedHours = (now.getTime() - alert.lastNotifiedAt.getTime()) / 3_600_000;
        if (elapsedHours < alert.cooldownHours) {
          await this.prisma.priceAlert.update({
            where: { id: alert.id },
            data: {
              lastCheckedAt: now,
              ...(market.inStock !== null ? { lastSeenInStock: market.inStock } : {}),
            },
          });
          continue;
        }
      }

      // Compare-and-set: the trigger only counts if the alert is still in the
      // state this sweep read. Two overlapping sweeps (the job can outlive
      // its 30-minute schedule, and up to 12 queue jobs run at once) would
      // otherwise both fire it and both notify (audit 02, L-17).
      const { count: won } = await this.prisma.priceAlert.updateMany({
        where: { id: alert.id, status: AlertStatus.ACTIVE, lastNotifiedAt: alert.lastNotifiedAt },
        data: {
          // A repeating alert re-arms; a one-shot parks in TRIGGERED.
          status: alert.repeatable ? AlertStatus.ACTIVE : AlertStatus.TRIGGERED,
          triggeredAt: now,
          triggeredPrice: new Prisma.Decimal(market.bestPrice.toFixed(2)),
          lastCheckedAt: now,
          lastNotifiedAt: now,
          ...(market.inStock !== null ? { lastSeenInStock: market.inStock } : {}),
        },
      });
      if (won === 0) continue;
      triggered += 1;

      // A notification failure must not roll back the trigger, or the alert
      // would fire again on the next sweep and spam on recovery.
      try {
        const result = await this.notifications.dispatch({
          userId: alert.userId,
          type: 'price_alert.triggered',
          title: outcome.headline ?? 'Price alert',
          body: outcome.detail ?? '',
          path: `/products/${alert.canonicalProduct.slug}`,
          priceAlertId: alert.id,
          data: {
            productId: alert.canonicalProductId,
            productTitle: alert.canonicalProduct.title,
            imageUrl: alert.canonicalProduct.imageUrl,
            alertType: alert.alertType,
            price: market.bestPrice,
            currency: this.currency,
            threshold: Number(alert.thresholdValue),
          },
          // One notification per alert per cooldown window, even if the
          // sweep somehow evaluates it twice.
          dedupeKey: `alert:${alert.id}:${Math.floor(now.getTime() / (alert.cooldownHours * 3_600_000 || 3_600_000))}`,
          dedupeWindowMinutes: Math.max(alert.cooldownHours * 60, 60),
        });
        if (result.notificationId) notified += 1;
      } catch (error) {
        this.logger.error(`Alert ${alert.id} fired but could not be delivered: ${(error as Error).message}`);
      }
    }

    return { checked: alerts.length, triggered, notified };
  }

  // ─── Trigger rules ──────────────────────────────────────────────────────

  private evaluate(
    alert: {
      id: string;
      alertType: AlertType;
      thresholdValue: Prisma.Decimal;
      lastSeenInStock: boolean | null;
      canonicalProduct: { title: string };
    },
    market: MarketSnapshot & { bestPrice: number },
    history: HistoryAggregate | undefined,
    baseline: number | null | undefined,
  ): TriggerOutcome {
    const price = market.bestPrice;
    const threshold = Number(alert.thresholdValue);
    const title = alert.canonicalProduct.title;
    const money = (value: number) => `${value.toLocaleString('en-US', { maximumFractionDigits: 0 })} ${this.currency}`;

    switch (alert.alertType) {
      case AlertType.PRICE_TARGET: {
        if (price > threshold) return { triggered: false };
        return {
          triggered: true,
          headline: `${title} hit your target price`,
          detail: `It is now ${money(price)}, at or below your target of ${money(threshold)}.`,
        };
      }

      case AlertType.PRICE_DROP_ABSOLUTE: {
        if (baseline == null || baseline <= 0) return { triggered: false };
        const drop = baseline - price;
        if (drop < threshold) return { triggered: false };
        return {
          triggered: true,
          headline: `${title} dropped by ${money(drop)}`,
          detail: `Down from ${money(baseline)} to ${money(price)} since you started tracking it.`,
        };
      }

      case AlertType.PRICE_DROP_PERCENT: {
        if (baseline == null || baseline <= 0) return { triggered: false };
        const dropPct = ((baseline - price) / baseline) * 100;
        if (dropPct < threshold) return { triggered: false };
        return {
          triggered: true,
          headline: `${title} is ${dropPct.toFixed(0)}% cheaper`,
          detail: `Down from ${money(baseline)} to ${money(price)} since you started tracking it.`,
        };
      }

      case AlertType.PRICE_INCREASE: {
        if (baseline == null || baseline <= 0) return { triggered: false };
        const risePct = ((price - baseline) / baseline) * 100;
        if (risePct < threshold) return { triggered: false };
        return {
          triggered: true,
          headline: `${title} went up ${risePct.toFixed(0)}%`,
          detail: `Up from ${money(baseline)} to ${money(price)}. If you were waiting, the window may be closing.`,
        };
      }

      case AlertType.LOWEST_EVER: {
        // Needs a real history to be a meaningful claim — without it every
        // first observation would be an "all-time low".
        if (!history?.allTimeLow || history.dayCount < 10) return { triggered: false };
        if (price > history.allTimeLow * PriceAlertService.LOWEST_EVER_TOLERANCE) return { triggered: false };
        return {
          triggered: true,
          headline: `${title} is at its lowest recorded price`,
          detail:
            `It is now ${money(price)} — the lowest we have recorded across ${history.dayCount} days of tracking ` +
            `(previous low ${money(history.allTimeLow)}).`,
        };
      }

      case AlertType.MAJOR_DISCOUNT: {
        if (!history?.trailingMedian || history.dayCount < 10) return { triggered: false };
        const dropPct = ((history.trailingMedian - price) / history.trailingMedian) * 100;
        const required = threshold > 0 ? threshold : PriceAlertService.MAJOR_DISCOUNT_PCT;
        if (dropPct < required) return { triggered: false };
        return {
          triggered: true,
          headline: `${title} is ${dropPct.toFixed(0)}% below its usual price`,
          detail:
            `Now ${money(price)}, against a typical ${money(history.trailingMedian)} over the last 90 days. ` +
            'This is measured against prices we actually recorded, not the store’s advertised discount.',
        };
      }

      case AlertType.RESTOCK: {
        // Only a genuine transition counts. A product that is simply in stock,
        // or whose stock we have never observed, must not fire.
        if (market.inStock !== true) return { triggered: false };
        if (alert.lastSeenInStock !== false) return { triggered: false };
        return {
          triggered: true,
          headline: `${title} is back in stock`,
          detail: `Available again at ${money(price)} across ${market.storeCount} store(s).`,
        };
      }

      default:
        return { triggered: false };
    }
  }

  // ─── Batched lookups ────────────────────────────────────────────────────

  /**
   * Cheapest live offer and stock state per product.
   *
   * The price is the product page's best price: live offers only (accepted,
   * priced, not sold out, seen within the offer window), deduplicated, and
   * without market outliers (offer-rules). An alert used to fire on a sold-out
   * or months-old price, or on a mismatched spare part (audit 02, L-17).
   *
   * Stock looks at every fresh listing, sold-out ones included, so a product
   * that sold out everywhere reads as `false` and RESTOCK can see it come
   * back.
   */
  private async getMarketSnapshots(productIds: string[]): Promise<Map<string, MarketSnapshot>> {
    if (productIds.length === 0) return new Map();

    const listings = await this.prisma.sourceListing.findMany({
      where: {
        canonicalProductId: { in: productIds },
        matchStatus: { in: [MatchStatus.ACCEPTED, MatchStatus.MANUAL_ACCEPT] },
        priceUsd: { gt: 0 },
        lastSeenAt: { gte: offerCutoff(this.offerPolicy) },
      },
      select: {
        canonicalProductId: true,
        priceUsd: true,
        inStock: true,
        matchStatus: true,
        lastSeenAt: true,
        platformId: true,
        rawTitle: true,
      },
    });

    const byProduct = new Map<string, typeof listings>();
    for (const listing of listings) {
      const bucket = byProduct.get(listing.canonicalProductId!) ?? [];
      bucket.push(listing);
      byProduct.set(listing.canonicalProductId!, bucket);
    }

    const map = new Map<string, MarketSnapshot>();
    for (const [productId, fresh] of byProduct) {
      const live = liveOffers(fresh, this.offerPolicy);
      const stock = fresh.map((listing) => listing.inStock).filter((value): value is boolean => value !== null);
      map.set(productId, {
        bestPrice: live.length ? Math.min(...live.map((listing) => Number(listing.priceUsd))) : null,
        inStock: stock.length === 0 ? null : stock.some(Boolean),
        storeCount: new Set(live.map((listing) => listing.platformId)).size,
      });
    }
    return map;
  }

  /**
   * Per product: the lowest price ever recorded, the 90-day trailing median
   * of daily minimums, and how many days the product has been tracked.
   * Only listings matched onto the product now count (not rejected junk, not
   * listings moved to another product); days are market days. "All-time"
   * used to mean the last 90 days, and "days of history" the number of days
   * with a price *change* (audit 02, L-17).
   */
  private async getHistoryAggregates(productIds: string[]): Promise<Map<string, HistoryAggregate>> {
    if (productIds.length === 0) return new Map();

    const rows = await this.prisma.$queryRaw<
      Array<{ product_id: string; all_time_low: Prisma.Decimal | null; trailing_median: number | null; day_count: number | Prisma.Decimal | null }>
    >`
      WITH points AS (
        SELECT
          sl.canonical_product_id AS product_id,
          ph.recorded_at,
          ph.price_usd
        FROM price_history ph
        JOIN source_listings sl ON sl.id = ph.source_listing_id
        WHERE sl.canonical_product_id = ANY(${productIds}::text[])
          AND sl.match_status IN ('ACCEPTED', 'MANUAL_ACCEPT')
          AND ph.price_usd > 0
      ),
      daily AS (
        SELECT
          product_id,
          ((recorded_at AT TIME ZONE 'UTC') AT TIME ZONE ${this.marketTimeZone})::date AS day,
          MIN(price_usd) AS day_min
        FROM points
        WHERE recorded_at >= NOW() - INTERVAL '90 days'
        GROUP BY 1, 2
      ),
      medians AS (
        SELECT product_id, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY day_min) AS trailing_median
        FROM daily
        GROUP BY 1
      )
      SELECT
        p.product_id,
        MIN(p.price_usd)                                                 AS all_time_low,
        MAX(m.trailing_median)                                           AS trailing_median,
        FLOOR(EXTRACT(EPOCH FROM (NOW() - MIN(p.recorded_at))) / 86400)  AS day_count
      FROM points p
      LEFT JOIN medians m ON m.product_id = p.product_id
      GROUP BY 1
    `;

    const map = new Map<string, HistoryAggregate>();
    for (const row of rows) {
      map.set(row.product_id, {
        allTimeLow: row.all_time_low != null ? Number(row.all_time_low) : null,
        trailingMedian: row.trailing_median != null ? Number(row.trailing_median) : null,
        dayCount: Number(row.day_count),
      });
    }
    return map;
  }

  /**
   * What each product cost when its alert was created: the best price
   * across its listings at that moment (each listing's last recorded price at
   * or before creation, the cheapest of those). When nothing was recorded
   * before the alert, the cheapest first price recorded after it.
   *
   * It used to be the first history row of ANY listing after creation, so a
   * dearer store's first point could become the baseline and a "drop" fire
   * on no drop at all (audit 02, L-17). One round trip for all alerts.
   */
  private async getBaselines(
    requests: Array<{ alertId: string; productId: string; createdAt: Date }>,
  ): Promise<Map<string, number | null>> {
    if (requests.length === 0) return new Map();

    const alertIds = requests.map((request) => request.alertId);
    const productIds = requests.map((request) => request.productId);
    const createdAts = requests.map((request) => request.createdAt);

    const rows = await this.prisma.$queryRaw<Array<{ alert_id: string; baseline: Prisma.Decimal | null }>>`
      WITH wanted AS (
        SELECT * FROM UNNEST(
          ${alertIds}::text[],
          ${productIds}::text[],
          ${createdAts}::timestamp[]
        ) AS t(alert_id, product_id, created_at)
      )
      SELECT
        w.alert_id,
        COALESCE(at_creation.best, after_creation.best) AS baseline
      FROM wanted w
      LEFT JOIN LATERAL (
        SELECT MIN(last_point.price_usd) AS best
        FROM (
          SELECT DISTINCT ON (ph.source_listing_id) ph.price_usd
          FROM price_history ph
          JOIN source_listings sl ON sl.id = ph.source_listing_id
          WHERE sl.canonical_product_id = w.product_id
            AND sl.match_status IN ('ACCEPTED', 'MANUAL_ACCEPT')
            AND ph.recorded_at <= w.created_at
            AND ph.price_usd > 0
          ORDER BY ph.source_listing_id, ph.recorded_at DESC
        ) last_point
      ) at_creation ON TRUE
      LEFT JOIN LATERAL (
        SELECT MIN(first_point.price_usd) AS best
        FROM (
          SELECT DISTINCT ON (ph.source_listing_id) ph.price_usd
          FROM price_history ph
          JOIN source_listings sl ON sl.id = ph.source_listing_id
          WHERE sl.canonical_product_id = w.product_id
            AND sl.match_status IN ('ACCEPTED', 'MANUAL_ACCEPT')
            AND ph.recorded_at > w.created_at
            AND ph.price_usd > 0
          ORDER BY ph.source_listing_id, ph.recorded_at ASC
        ) first_point
      ) after_creation ON TRUE
    `;

    const map = new Map<string, number | null>();
    for (const row of rows) {
      map.set(row.alert_id, row.baseline != null ? Number(row.baseline) : null);
    }
    return map;
  }
}
