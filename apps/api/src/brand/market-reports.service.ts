import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CompetitorEventType, Prisma, ReportPeriod } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../seller/organizations.service';

export interface ReportSection {
  key: string;
  title: string;
  /** Rows the UI renders as a table. Empty is a legitimate result. */
  rows: Array<Record<string, string | number | null>>;
  /** Shown instead of the table when there is nothing to report. */
  emptyNote: string;
}

export interface MarketReportPayload {
  currency: string;
  periodLabel: string;
  headline: {
    productsMonitored: number;
    retailersSeen: number;
    priceChanges: number;
    newProducts: number;
    mapViolations: number;
    stockEvents: number;
  };
  sections: ReportSection[];
  /** Stated on every report, not buried. */
  dataNote: string;
}

/**
 * Generates a market report for a workspace from recorded data only.
 *
 * Two rules hold throughout:
 *   1. Every number traces to a row we stored. Nothing is estimated,
 *      extrapolated, or filled in to make a section look complete.
 *   2. An empty section says it is empty and why. A report that silently
 *      omits a section reads as "nothing happened" when the truth may be
 *      "we do not monitor that yet".
 *
 * The rendered payload is stored, not recomputed on open: a report dated last
 * week must keep saying what was true last week.
 */
@Injectable()
export class MarketReportsService {
  private readonly logger = new Logger(MarketReportsService.name);
  private readonly currency: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    config: ConfigService,
  ) {
    this.currency = config.get<string>('pricing.fxBaseCurrency', 'EGP');
  }

  /** Generates (or regenerates) the report covering a period. */
  async generate(orgId: string, period: ReportPeriod, periodEnd = new Date()) {
    const days = period === ReportPeriod.WEEKLY ? 7 : 30;
    // Normalised to a day boundary so the unique key is stable across re-runs.
    const end = new Date(periodEnd.toISOString().slice(0, 10) + 'T00:00:00.000Z');
    const start = new Date(end.getTime() - days * 86_400_000);

    const payload = await this.build(orgId, start, end, period);

    const report = await this.prisma.marketReport.upsert({
      where: { orgId_period_periodStart: { orgId, period, periodStart: start } },
      create: {
        orgId,
        period,
        periodStart: start,
        periodEnd: end,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
      update: {
        periodEnd: end,
        payload: payload as unknown as Prisma.InputJsonValue,
        generatedAt: new Date(),
      },
    });

    return { id: report.id, generatedAt: report.generatedAt.toISOString(), payload };
  }

  private async build(
    orgId: string,
    start: Date,
    end: Date,
    period: ReportPeriod,
  ): Promise<MarketReportPayload> {
    const window = { gte: start, lt: end };

    const [products, events, discoveries] = await Promise.all([
      this.prisma.sellerProduct.findMany({
        where: { orgId, isActive: true },
        select: { id: true, sku: true, name: true, currentPrice: true, canonicalProductId: true },
      }),
      this.prisma.competitorEvent.findMany({
        where: { orgId, detectedAt: window },
        include: {
          platform: { select: { name: true } },
          sellerProduct: { select: { sku: true, name: true } },
        },
        orderBy: { detectedAt: 'desc' },
      }),
      this.prisma.productDiscovery.findMany({
        where: { orgId, firstDetectedAt: window },
        include: { canonicalProduct: { select: { title: true } } },
        orderBy: { firstDetectedAt: 'desc' },
        take: 50,
      }),
    ]);

    const of = (type: CompetitorEventType) => events.filter((event) => event.type === type);
    const money = (value: number | null) =>
      value == null ? null : `${Math.round(value).toLocaleString('en-US')} ${this.currency}`;

    const drops = of(CompetitorEventType.PRICE_DROP);
    const rises = of(CompetitorEventType.PRICE_INCREASE);
    const undercuts = of(CompetitorEventType.UNDERCUT);
    const mapViolations = of(CompetitorEventType.MAP_VIOLATION);
    const stockEvents = [
      ...of(CompetitorEventType.OUT_OF_STOCK),
      ...of(CompetitorEventType.BACK_IN_STOCK),
    ];
    const entrants = of(CompetitorEventType.NEW_ENTRANT);

    const sections: ReportSection[] = [
      {
        key: 'biggest_drops',
        title: 'Largest competitor price drops',
        rows: [...drops]
          .sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0))
          .slice(0, 10)
          .map((event) => ({
            product: event.sellerProduct?.name ?? '—',
            retailer: event.platform.name,
            was: money(event.previousPrice != null ? Number(event.previousPrice) : null),
            now: money(event.newPrice != null ? Number(event.newPrice) : null),
            change: event.changePct != null ? `${event.changePct.toFixed(1)}%` : null,
            date: event.detectedAt.toISOString().slice(0, 10),
          })),
        emptyNote: 'No competitor price drops were recorded in this period.',
      },
      {
        key: 'biggest_rises',
        title: 'Largest competitor price increases',
        rows: [...rises]
          .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))
          .slice(0, 10)
          .map((event) => ({
            product: event.sellerProduct?.name ?? '—',
            retailer: event.platform.name,
            was: money(event.previousPrice != null ? Number(event.previousPrice) : null),
            now: money(event.newPrice != null ? Number(event.newPrice) : null),
            change: event.changePct != null ? `+${event.changePct.toFixed(1)}%` : null,
            date: event.detectedAt.toISOString().slice(0, 10),
          })),
        emptyNote: 'No competitor price increases were recorded in this period.',
      },
      {
        key: 'undercuts',
        title: 'Where you were undercut',
        rows: undercuts.slice(0, 10).map((event) => ({
          product: event.sellerProduct?.name ?? '—',
          retailer: event.platform.name,
          theirPrice: money(event.newPrice != null ? Number(event.newPrice) : null),
          yourPrice: money(event.ourPrice != null ? Number(event.ourPrice) : null),
          gap: event.changePct != null ? `${event.changePct.toFixed(1)}%` : null,
          date: event.detectedAt.toISOString().slice(0, 10),
        })),
        emptyNote:
          'No competitor was recorded below your price. This section needs your own price set on a product.',
      },
      {
        key: 'map_violations',
        title: 'MAP violations',
        rows: mapViolations.slice(0, 20).map((event) => ({
          product: event.sellerProduct?.name ?? '—',
          retailer: event.platform.name,
          map: money(event.ourPrice != null ? Number(event.ourPrice) : null),
          advertised: money(event.newPrice != null ? Number(event.newPrice) : null),
          difference: event.changePct != null ? `${event.changePct.toFixed(1)}%` : null,
          date: event.detectedAt.toISOString().slice(0, 10),
        })),
        emptyNote:
          'No MAP violations were recorded. MAP monitoring only runs on products with a MAP price set.',
      },
      {
        key: 'new_products',
        title: 'Products first detected this period',
        rows: discoveries.map((discovery) => ({
          product: discovery.canonicalProduct.title,
          brand: discovery.brand,
          category: discovery.categoryName,
          firstPrice: money(discovery.firstPrice != null ? Number(discovery.firstPrice) : null),
          store: discovery.firstStore,
          // Named "first detected", never "launched": we only know when we saw it.
          firstDetected: discovery.firstDetectedAt.toISOString().slice(0, 10),
        })),
        emptyNote:
          'No new products were detected in your watched brands. Add a brand watch to track this.',
      },
      {
        key: 'stock_events',
        title: 'Stock changes at competitors',
        rows: stockEvents.slice(0, 20).map((event) => ({
          product: event.sellerProduct?.name ?? '—',
          retailer: event.platform.name,
          change: event.type === CompetitorEventType.OUT_OF_STOCK ? 'Went out of stock' : 'Came back in stock',
          date: event.detectedAt.toISOString().slice(0, 10),
        })),
        emptyNote:
          'No stock changes were recorded. Most stores we track do not publish stock status, so this section is often empty.',
      },
      {
        key: 'new_entrants',
        title: 'Retailers that started carrying your products',
        rows: entrants.slice(0, 20).map((event) => ({
          product: event.sellerProduct?.name ?? '—',
          retailer: event.platform.name,
          price: money(event.newPrice != null ? Number(event.newPrice) : null),
          date: event.detectedAt.toISOString().slice(0, 10),
        })),
        emptyNote: 'No new retailers started carrying your monitored products in this period.',
      },
    ];

    const retailersSeen = new Set(events.map((event) => event.platformId)).size;

    return {
      currency: this.currency,
      periodLabel: `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`,
      headline: {
        productsMonitored: products.length,
        retailersSeen,
        priceChanges: drops.length + rises.length,
        newProducts: discoveries.length,
        mapViolations: mapViolations.length,
        stockEvents: stockEvents.length,
      },
      sections,
      dataNote:
        'Every figure in this report comes from prices and listings PriceLens recorded itself during ' +
        `the ${period === ReportPeriod.WEEKLY ? '7' : '30'}-day period. Nothing is estimated. An empty ` +
        'section means nothing of that kind was observed, not that nothing happened in the wider market.',
    };
  }

  async list(userId: string, orgId: string, limit = 20) {
    await this.organizations.requireMembership(userId, orgId);

    const reports = await this.prisma.marketReport.findMany({
      where: { orgId },
      orderBy: { periodEnd: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      select: { id: true, period: true, periodStart: true, periodEnd: true, generatedAt: true },
    });

    return reports.map((report) => ({
      id: report.id,
      period: report.period,
      periodStart: report.periodStart.toISOString(),
      periodEnd: report.periodEnd.toISOString(),
      generatedAt: report.generatedAt.toISOString(),
    }));
  }

  async getOne(userId: string, orgId: string, reportId: string) {
    await this.organizations.requireMembership(userId, orgId);

    const report = await this.prisma.marketReport.findFirst({ where: { id: reportId, orgId } });
    if (!report) throw new NotFoundException('Report not found');

    return {
      id: report.id,
      period: report.period,
      periodStart: report.periodStart.toISOString(),
      periodEnd: report.periodEnd.toISOString(),
      generatedAt: report.generatedAt.toISOString(),
      payload: report.payload as unknown as MarketReportPayload,
    };
  }

  /** Generates this week's report for every workspace. Idempotent. */
  async generateForAllWorkspaces(): Promise<{ generated: number }> {
    const orgs = await this.prisma.organization.findMany({ select: { id: true } });

    let generated = 0;
    for (const org of orgs) {
      try {
        await this.generate(org.id, ReportPeriod.WEEKLY);
        generated += 1;
      } catch (error) {
        // One workspace failing must not stop the rest.
        this.logger.error(`Report generation failed for org ${org.id}: ${(error as Error).message}`);
      }
    }

    if (generated > 0) this.logger.log(`Generated ${generated} weekly report(s)`);
    return { generated };
  }
}
