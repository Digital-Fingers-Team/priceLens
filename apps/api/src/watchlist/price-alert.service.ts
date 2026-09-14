import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlertStatus, AlertType, MatchStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface EvaluationResult {
  checked: number;
  triggered: number;
  notified: number;
}

/** Per-product market snapshot used to evaluate every alert on that product. */
interface MarketSnapshot {
  bestPrice: number;
  /** BOOL_OR across live listings; null when no store publishes stock. */
  inStock: boolean | null;
  storeCount: number;
}

/** Per-product historical aggregates, fetched once for the whole batch. */
interface HistoryAggregate {
  allTimeLow: number | null;
  /** Median of the last 90 days of daily minimums. */
  trailingMedian: number | null;
  dayCount: number;
}

/** Per-alert baseline: what the product cost when the alert was created. */
interface AlertBaseline {
  alertId: string;
  baseline: number | null;
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
    const needsHistory = alerts.some((alert) =>
      [AlertType.LOWEST_EVER, AlertType.MAJOR_DISCOUNT].includes(alert.alertType),
    );

    const [markets, histories, baselines] = await Promise.all([
      this.getMarketSnapshots(productIds),
      needsHistory ? this.getHistoryAggregates(productIds) : Promise.resolve(new Map<string, HistoryAggregate>()),
      this.getBaselines(
        alerts
          .filter((alert) =>
            [AlertType.PRICE_DROP_ABSOLUTE, AlertType.PRICE_DROP_PERCENT, AlertType.PRICE_INCREASE].includes(
              alert.alertType,
            ),
          )
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

      // No live priced listing at all. Still stamp lastCheckedAt so this
      // alert does not monopolise the head of the queue forever.
      if (!market) {
        await this.prisma.priceAlert.update({
          where: { id: alert.id },
          data: { lastCheckedAt: now },
        });
        continue;
      }

      const outcome = this.evaluate(alert, market, histories.get(alert.canonicalProductId), baselines.get(alert.id));

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

      triggered += 1;

      await this.prisma.priceAlert.update({
        where: { id: alert.id },
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
    market: MarketSnapshot,
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
   * Cheapest live price and aggregate stock per product.
   *
   * `inStock` is BOOL_OR so a product available anywhere counts as available;
   * it stays NULL when no store publishes stock at all, which the RESTOCK
   * rule relies on to stay quiet rather than guess.
   */
  private async getMarketSnapshots(productIds: string[]): Promise<Map<string, MarketSnapshot>> {
    if (productIds.length === 0) return new Map();

    const rows = await this.prisma.$queryRaw<
      Array<{ product_id: string; best: Prisma.Decimal; in_stock: boolean | null; store_count: bigint }>
    >`
      SELECT
        sl.canonical_product_id           AS product_id,
        MIN(sl.price_usd)                 AS best,
        BOOL_OR(sl.in_stock)              AS in_stock,
        COUNT(DISTINCT sl.platform_id)    AS store_count
      FROM source_listings sl
      WHERE sl.canonical_product_id = ANY(${productIds}::uuid[])
        AND sl.price_usd IS NOT NULL
        AND sl.price_usd > 0
        AND sl.match_status IN (${MatchStatus.ACCEPTED}::"MatchStatus", ${MatchStatus.MANUAL_ACCEPT}::"MatchStatus")
      GROUP BY 1
    `;

    const map = new Map<string, MarketSnapshot>();
    for (const row of rows) {
      map.set(row.product_id, {
        bestPrice: Number(row.best),
        inStock: row.in_stock,
        storeCount: Number(row.store_count),
      });
    }
    return map;
  }

  /** All-time low and 90-day trailing median of daily minimums, per product. */
  private async getHistoryAggregates(productIds: string[]): Promise<Map<string, HistoryAggregate>> {
    if (productIds.length === 0) return new Map();

    const rows = await this.prisma.$queryRaw<
      Array<{ product_id: string; all_time_low: Prisma.Decimal | null; trailing_median: number | null; day_count: bigint }>
    >`
      WITH daily AS (
        SELECT
          ph.canonical_product_id                  AS product_id,
          date_trunc('day', ph.recorded_at)::date  AS day,
          MIN(ph.price_usd)                        AS day_min
        FROM price_history ph
        WHERE ph.canonical_product_id = ANY(${productIds}::uuid[])
          AND ph.price_usd > 0
          AND ph.recorded_at >= NOW() - INTERVAL '90 days'
        GROUP BY 1, 2
      )
      SELECT
        d.product_id,
        MIN(d.day_min)                                                        AS all_time_low,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY d.day_min)                AS trailing_median,
        COUNT(*)                                                              AS day_count
      FROM daily d
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
   * What each product cost when its alert was created.
   *
   * A LATERAL join over the alert list resolves every baseline in one round
   * trip. Falls back to the most recent recorded price when the alert predates
   * any history, which is the same rule the previous implementation used.
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
          ${alertIds}::uuid[],
          ${productIds}::uuid[],
          ${createdAts}::timestamp[]
        ) AS t(alert_id, product_id, created_at)
      )
      SELECT
        w.alert_id,
        COALESCE(after_alert.price_usd, latest.price_usd) AS baseline
      FROM wanted w
      LEFT JOIN LATERAL (
        SELECT ph.price_usd
        FROM price_history ph
        WHERE ph.canonical_product_id = w.product_id
          AND ph.recorded_at >= w.created_at
          AND ph.price_usd > 0
        ORDER BY ph.recorded_at ASC
        LIMIT 1
      ) after_alert ON TRUE
      LEFT JOIN LATERAL (
        SELECT ph.price_usd
        FROM price_history ph
        WHERE ph.canonical_product_id = w.product_id
          AND ph.price_usd > 0
        ORDER BY ph.recorded_at DESC
        LIMIT 1
      ) latest ON TRUE
    `;

    const map = new Map<string, number | null>();
    for (const row of rows) {
      map.set(row.alert_id, row.baseline != null ? Number(row.baseline) : null);
    }
    return map;
  }
}

export type { AlertBaseline };
