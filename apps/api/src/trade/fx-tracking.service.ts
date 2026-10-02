import { Inject, Injectable, Logger } from '@nestjs/common';
import { FxRate, FxSource, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { FxRatesService } from '../matching/fx-rates.service';
import { FX_RATE_PROVIDERS, FxRateProvider, TRACKED_CURRENCIES } from './fx-rate.providers';
import { ImportFinderService } from './import-finder.service';
import { addDays, breakEvenRate, fxScenarios, zonedDay } from './trade-math';

const TIME_ZONE = 'Africa/Cairo';
/** How far the dollar is moved in the "what if" columns, in %. */
const SCENARIO_STEPS = [-10, -5, 5, 10, 20];
const MAX_IMPACT_PRODUCTS = 100;

/**
 * FX tracking: the CBE official and the market USD/EGP (and a few other)
 * rates, stored once per source per day, and what a move in the dollar does
 * to the landed cost and margin of the products a user tracks.
 */
@Injectable()
export class FxTrackingService {
  private readonly logger = new Logger(FxTrackingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly importFinder: ImportFinderService,
    private readonly fxRates: FxRatesService,
    @Inject(FX_RATE_PROVIDERS) private readonly providers: FxRateProvider[],
  ) {}

  /** Read every source and store today's rates. One failing source does not stop the other. */
  async refresh(): Promise<Record<string, number | string>> {
    const outcome: Record<string, number | string> = {};
    for (const provider of this.providers) {
      try {
        const quotes = await provider.fetchRates();
        for (const quote of quotes) {
          const rateDate = new Date(`${quote.rateDate}T00:00:00Z`);
          const values = {
            buy: quote.buy == null ? null : new Prisma.Decimal(quote.buy),
            sell: quote.sell == null ? null : new Prisma.Decimal(quote.sell),
            mid: new Prisma.Decimal(quote.mid),
            capturedAt: new Date(),
          };
          await this.prisma.fxRate.upsert({
            where: { source_currency_rateDate: { source: provider.source, currency: quote.currency, rateDate } },
            create: { source: provider.source, currency: quote.currency, rateDate, ...values },
            update: values,
          });
        }
        outcome[provider.source] = quotes.length;
      } catch (err) {
        outcome[provider.source] = (err as Error).message;
        this.logger.warn(`FX refresh from ${provider.source} failed: ${(err as Error).message}`);
      }
    }
    return outcome;
  }

  /** Latest rate per source and currency, with the change since the previous stored day. */
  async latest() {
    const rows = await this.prisma.$queryRaw<FxRate[]>`
      SELECT DISTINCT ON (source, currency) id, source, currency, buy, sell, mid, rate_date AS "rateDate", captured_at AS "capturedAt"
      FROM fx_rates ORDER BY source, currency, rate_date DESC`;
    const previous = await this.prisma.$queryRaw<Array<{ source: FxSource; currency: string; mid: Prisma.Decimal }>>`
      SELECT DISTINCT ON (r.source, r.currency) r.source, r.currency, r.mid
      FROM fx_rates r
      JOIN (SELECT source, currency, max(rate_date) AS last FROM fx_rates GROUP BY 1, 2) m
        ON m.source = r.source AND m.currency = r.currency AND r.rate_date < m.last
      ORDER BY r.source, r.currency, r.rate_date DESC`;
    const before = new Map(previous.map((row) => [`${row.source}|${row.currency}`, Number(row.mid)]));

    const order = (currency: string) => (TRACKED_CURRENCIES as readonly string[]).indexOf(currency);
    return {
      base: 'EGP',
      rates: rows
        .sort((a, b) => order(a.currency) - order(b.currency) || a.source.localeCompare(b.source))
        .map((row) => {
          const mid = Number(row.mid);
          const prev = before.get(`${row.source}|${row.currency}`);
          return {
            source: row.source,
            currency: row.currency,
            buy: row.buy == null ? null : Number(row.buy),
            sell: row.sell == null ? null : Number(row.sell),
            mid,
            rateDate: toDay(row.rateDate),
            changePct: prev ? Math.round(((mid - prev) / prev) * 10_000) / 100 : null,
          };
        }),
    };
  }

  /** Daily CBE and market mids for one currency, oldest first. */
  async history(currency: string, days: number) {
    const code = currency.toUpperCase();
    const since = new Date(`${addDays(zonedDay(new Date(), TIME_ZONE), -(days - 1))}T00:00:00Z`);
    const rows = await this.prisma.fxRate.findMany({
      where: { currency: code, rateDate: { gte: since } },
      orderBy: { rateDate: 'asc' },
      select: { source: true, mid: true, buy: true, sell: true, rateDate: true },
    });
    const byDay = new Map<string, { day: string; cbe: number | null; cbeBuy: number | null; cbeSell: number | null; market: number | null }>();
    for (const row of rows) {
      const day = toDay(row.rateDate);
      const point = byDay.get(day) ?? { day, cbe: null, cbeBuy: null, cbeSell: null, market: null };
      if (row.source === FxSource.CBE) {
        point.cbe = Number(row.mid);
        point.cbeBuy = row.buy == null ? null : Number(row.buy);
        point.cbeSell = row.sell == null ? null : Number(row.sell);
      } else {
        point.market = Number(row.mid);
      }
      byDay.set(day, point);
    }
    return { currency: code, base: 'EGP', points: [...byDay.values()] };
  }

  /**
   * Today's USD rate in EGP, and where it came from: the CBE sell rate
   * (what an importer's bank charges), else the market mid, else the rate
   * ingestion uses. Null only when nothing at all is known.
   */
  async usdToday(): Promise<{ rate: number; source: FxSource | 'INGESTION' } | null> {
    for (const source of [FxSource.CBE, FxSource.MARKET]) {
      const row = await this.prisma.fxRate.findFirst({ where: { source, currency: 'USD' }, orderBy: { rateDate: 'desc' } });
      if (row) return { rate: Number(source === FxSource.CBE ? (row.sell ?? row.mid) : row.mid), source };
    }
    const rate = await this.fxRates.getRateToBase('USD');
    return rate ? { rate, source: 'INGESTION' } : null;
  }

  /** The CBE (else market) USD mid `days` ago, for "since last month". */
  private async usdOn(daysAgo: number): Promise<number | null> {
    const day = new Date(`${addDays(zonedDay(new Date(), TIME_ZONE), -daysAgo)}T00:00:00Z`);
    for (const source of [FxSource.CBE, FxSource.MARKET]) {
      const row = await this.prisma.fxRate.findFirst({
        where: { source, currency: 'USD', rateDate: { lte: day } },
        orderBy: { rateDate: 'desc' },
      });
      if (row) return Number(source === FxSource.CBE ? (row.sell ?? row.mid) : row.mid);
    }
    return null;
  }

  /**
   * For the products a user tracks (watchlist and their workspaces' products)
   * that have a cross-border offer: the landed cost today, what it would be
   * if the dollar moved, the margin against the cheapest local price, and
   * the dollar rate at which importing stops paying.
   */
  async impact(userId: string) {
    const today = await this.usdToday();
    const [watched, sellerProducts] = await Promise.all([
      this.prisma.watchlistItem.findMany({ where: { userId }, select: { canonicalProductId: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.sellerProduct.findMany({
        where: { canonicalProductId: { not: null }, organization: { members: { some: { userId } } } },
        select: { canonicalProductId: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const ids = [...new Set([...watched, ...sellerProducts].map((row) => row.canonicalProductId!))].slice(0, MAX_IMPACT_PRODUCTS);
    if (!today || ids.length === 0) return { usd: today, rateMonthAgo: null, steps: SCENARIO_STEPS, tracked: ids.length, items: [] };

    const [quotes, monthAgo, products] = await Promise.all([
      this.importFinder.quote(ids),
      this.usdOn(30),
      this.prisma.canonicalProduct.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true, title: true, titleAr: true } }),
    ]);
    const productById = new Map(products.map((product) => [product.id, product]));

    const items = [...quotes.values()].map((quote) => {
      const landedAt = this.importFinder.landedAt(quote.import.rule);
      const local = quote.local[0]?.price ?? null;
      const rates = SCENARIO_STEPS.map((step) => today.rate * (1 + step / 100));
      return {
        product: productById.get(quote.productId)!,
        importStore: quote.import.store,
        importPrice: quote.import.price,
        landedCost: quote.import.landedCost,
        localLowest: local,
        localStore: quote.local[0]?.store ?? null,
        // The store's price follows the dollar, so a month ago it was price x (then / now).
        landedMonthAgo: monthAgo ? fxScenarios(quote.import.price, today.rate, [monthAgo], landedAt, local)[0]?.landedCost ?? null : null,
        scenarios: fxScenarios(quote.import.price, today.rate, rates, landedAt, local),
        breakEvenRate: local ? breakEvenRate(quote.import.price, today.rate, landedAt, local) : null,
      };
    });
    items.sort((a, b) => (a.breakEvenRate ?? Infinity) / today.rate - (b.breakEvenRate ?? Infinity) / today.rate);
    return { usd: today, rateMonthAgo: monthAgo, steps: SCENARIO_STEPS, tracked: ids.length, items };
  }
}

function toDay(value: Date | string): string {
  return (value instanceof Date ? value.toISOString() : String(value)).slice(0, 10);
}
