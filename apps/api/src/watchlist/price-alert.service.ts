import { Injectable, Logger } from '@nestjs/common';
import { AlertStatus, AlertType, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export interface EvaluationResult {
  checked: number;
  triggered: number;
}

/**
 * Evaluates active price alerts against each product's current best price.
 *
 * Alerts were previously only ever created — nothing read them back — so
 * `lastCheckedAt` / `triggeredAt` / `triggeredPrice` were never populated and a
 * user could never actually be told their price target had been reached.
 */
@Injectable()
export class PriceAlertService {
  private readonly logger = new Logger(PriceAlertService.name);

  constructor(private readonly prisma: PrismaService) {}

  async evaluateActiveAlerts(batchSize = 500): Promise<EvaluationResult> {
    const alerts = await this.prisma.priceAlert.findMany({
      where: { status: AlertStatus.ACTIVE },
      orderBy: { lastCheckedAt: { sort: 'asc', nulls: 'first' } },
      take: batchSize,
    });

    if (alerts.length === 0) return { checked: 0, triggered: 0 };

    const productIds = [...new Set(alerts.map((alert) => alert.canonicalProductId))];
    const currentPrices = await this.getBestPrices(productIds);

    const now = new Date();
    let triggered = 0;

    for (const alert of alerts) {
      const currentPrice = currentPrices.get(alert.canonicalProductId);

      // No in-stock priced listing right now — record the check and move on.
      if (currentPrice == null) {
        await this.prisma.priceAlert.update({
          where: { id: alert.id },
          data: { lastCheckedAt: now },
        });
        continue;
      }

      const threshold = Number(alert.thresholdValue);
      const shouldTrigger = await this.shouldTrigger(alert.alertType, alert.canonicalProductId, alert.createdAt, currentPrice, threshold);

      await this.prisma.priceAlert.update({
        where: { id: alert.id },
        data: shouldTrigger
          ? {
              status: AlertStatus.TRIGGERED,
              triggeredAt: now,
              triggeredPrice: new Prisma.Decimal(currentPrice.toFixed(2)),
              lastCheckedAt: now,
            }
          : { lastCheckedAt: now },
      });

      if (shouldTrigger) triggered += 1;
    }

    return { checked: alerts.length, triggered };
  }

  private async shouldTrigger(
    alertType: AlertType,
    productId: string,
    alertCreatedAt: Date,
    currentPrice: number,
    threshold: number,
  ): Promise<boolean> {
    if (alertType === AlertType.PRICE_TARGET) {
      return currentPrice <= threshold;
    }

    // Drop alerts are relative to what the product cost when the alert was set.
    const baseline = await this.getBaselinePrice(productId, alertCreatedAt);
    if (baseline == null || baseline <= 0) return false;

    if (alertType === AlertType.PRICE_DROP_ABSOLUTE) {
      return baseline - currentPrice >= threshold;
    }

    if (alertType === AlertType.PRICE_DROP_PERCENT) {
      return ((baseline - currentPrice) / baseline) * 100 >= threshold;
    }

    return false;
  }

  /** Cheapest in-stock price per product, in one query for the whole batch. */
  private async getBestPrices(productIds: string[]): Promise<Map<string, number>> {
    const rows = await this.prisma.sourceListing.groupBy({
      by: ['canonicalProductId'],
      where: {
        canonicalProductId: { in: productIds },
        priceUsd: { not: null },
        // Most scraped listings leave stock unknown (null), and `not: false`
        // would discard those under SQL three-valued logic — which silently
        // hid the vast majority of listings from alert evaluation. Unknown is
        // treated as available, consistent with how search surfaces them.
        OR: [{ inStock: true }, { inStock: null }],
      },
      _min: { priceUsd: true },
    });

    const prices = new Map<string, number>();
    for (const row of rows) {
      const min = row._min.priceUsd;
      if (row.canonicalProductId && min != null) {
        prices.set(row.canonicalProductId, Number(min));
      }
    }
    return prices;
  }

  /** The product's price around the time the alert was created. */
  private async getBaselinePrice(productId: string, alertCreatedAt: Date): Promise<number | null> {
    const entry = await this.prisma.priceHistory.findFirst({
      where: { canonicalProductId: productId, recordedAt: { gte: alertCreatedAt } },
      orderBy: { recordedAt: 'asc' },
      select: { priceUsd: true },
    });

    if (entry) return Number(entry.priceUsd);

    // Alert predates any recorded history — fall back to the most recent point.
    const latest = await this.prisma.priceHistory.findFirst({
      where: { canonicalProductId: productId },
      orderBy: { recordedAt: 'desc' },
      select: { priceUsd: true },
    });

    return latest ? Number(latest.priceUsd) : null;
  }
}
