import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CompetitorEventType, MatchStatus, Prisma, ReportPeriod } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../seller/organizations.service';
import { renderPdf, toCsv } from './export-formats';

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

    sections.push(...(await this.marketSections(products.map((p) => p.canonicalProductId), drops.length)));

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

  /**
   * Category prices, discount frequency and each store's share of offers, from
   * the listings we hold for the workspace's monitored products right now.
   */
  private async marketSections(
    canonicalIds: Array<string | null>,
    dropCount: number,
  ): Promise<ReportSection[]> {
    const ids = canonicalIds.filter((id): id is string => !!id);
    const listings = ids.length
      ? await this.prisma.sourceListing.findMany({
          where: {
            canonicalProductId: { in: ids },
            priceUsd: { not: null },
            matchStatus: { in: [MatchStatus.ACCEPTED, MatchStatus.MANUAL_ACCEPT] },
          },
          select: {
            canonicalProductId: true,
            priceUsd: true,
            advertisedPrice: true,
            platform: { select: { name: true } },
            canonicalProduct: { select: { category: { select: { name: true } } } },
          },
        })
      : [];

    const money = (value: number) => `${Math.round(value).toLocaleString('en-US')} ${this.currency}`;

    // Category: average of each product's lowest and highest current price.
    const lowestByProduct = new Map<string, { category: string; low: number; high: number }>();
    for (const listing of listings) {
      const id = listing.canonicalProductId as string;
      const price = Number(listing.priceUsd);
      const current = lowestByProduct.get(id);
      if (!current) {
        lowestByProduct.set(id, {
          category: listing.canonicalProduct?.category?.name ?? 'Uncategorised',
          low: price,
          high: price,
        });
      } else {
        current.low = Math.min(current.low, price);
        current.high = Math.max(current.high, price);
      }
    }
    const byCategory = new Map<string, { n: number; low: number; high: number }>();
    for (const product of lowestByProduct.values()) {
      const row = byCategory.get(product.category) ?? { n: 0, low: 0, high: 0 };
      row.n += 1;
      row.low += product.low;
      row.high += product.high;
      byCategory.set(product.category, row);
    }

    const byStore = new Map<string, { offers: number; discounted: number }>();
    for (const listing of listings) {
      const row = byStore.get(listing.platform.name) ?? { offers: 0, discounted: 0 };
      row.offers += 1;
      if (listing.advertisedPrice != null && Number(listing.advertisedPrice) > Number(listing.priceUsd)) {
        row.discounted += 1;
      }
      byStore.set(listing.platform.name, row);
    }
    const totalOffers = listings.length;

    return [
      {
        key: 'category_prices',
        title: 'Average prices by category',
        rows: [...byCategory.entries()]
          .sort((a, b) => b[1].n - a[1].n)
          .map(([category, row]) => ({
            category,
            products: row.n,
            avgLowest: money(row.low / row.n),
            avgHighest: money(row.high / row.n),
          })),
        emptyNote: 'No monitored product is matched to the catalogue yet, so there are no prices to average.',
      },
      {
        key: 'discount_frequency',
        title: 'Discount frequency by store',
        rows: [...byStore.entries()]
          .sort((a, b) => b[1].discounted / b[1].offers - a[1].discounted / a[1].offers)
          .map(([store, row]) => ({
            store,
            offers: row.offers,
            discounted: row.discounted,
            share: `${((row.discounted / row.offers) * 100).toFixed(0)}%`,
          })),
        emptyNote:
          `No offers to measure. ${dropCount} competitor price drop(s) were recorded in the period. ` +
          'A discount here means the store shows a struck-through price above the live one.',
      },
      {
        key: 'store_share',
        title: 'Share of offers per store',
        rows: [...byStore.entries()]
          .sort((a, b) => b[1].offers - a[1].offers)
          .map(([store, row]) => ({
            store,
            offers: row.offers,
            share: `${((row.offers / totalOffers) * 100).toFixed(1)}%`,
          })),
        emptyNote: 'No offers were found for the monitored products.',
      },
    ];
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

  /** Every section in one CSV: section, then the section's own columns. */
  async exportCsv(userId: string, orgId: string, reportId: string): Promise<string> {
    const report = await this.getOne(userId, orgId, reportId);
    const rows: Array<Array<string | number | null>> = [];
    for (const section of report.payload.sections) {
      rows.push([section.title]);
      if (section.rows.length === 0) {
        rows.push([section.emptyNote]);
      } else {
        const keys = Object.keys(section.rows[0]);
        rows.push(keys);
        for (const row of section.rows) rows.push(keys.map((key) => row[key] ?? null));
      }
      rows.push([]);
    }
    return toCsv([`Market report ${report.payload.periodLabel}`], rows);
  }

  async exportPdf(userId: string, orgId: string, reportId: string): Promise<Buffer> {
    const { organization } = await this.organizations.requireMembership(userId, orgId);
    const report = await this.getOne(userId, orgId, reportId);
    const { payload } = report;
    return renderPdf({
      title: `Market report: ${organization.name}`,
      subtitle: `${report.period === ReportPeriod.WEEKLY ? 'Weekly' : 'Monthly'} · ${payload.periodLabel} · generated ${report.generatedAt.slice(0, 10)}`,
      facts: [
        ['Products monitored', String(payload.headline.productsMonitored)],
        ['Price changes', String(payload.headline.priceChanges)],
        ['New products', String(payload.headline.newProducts)],
        ['MAP violations', String(payload.headline.mapViolations)],
      ],
      tables: payload.sections.map((section) => {
        const keys = section.rows[0] ? Object.keys(section.rows[0]) : [];
        return {
          title: section.title,
          headers: keys,
          rows: section.rows.map((row) => keys.map((key) => row[key] ?? null)),
          emptyNote: section.emptyNote,
        };
      }),
      footer: payload.dataNote,
    });
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
