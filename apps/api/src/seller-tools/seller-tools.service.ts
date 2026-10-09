import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrgRole, PriceChangeSource, Prisma, RepricerStrategy } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { PlanLimitExceededException } from '../billing/billing.errors';
import { isWithinLimit } from '../billing/plan-limits';
import { OrganizationsService } from '../seller/organizations.service';
import { SellerProductsService } from '../seller/seller-products.service';
import {
  FeeTerms,
  breakEvenPrice,
  computeProfit,
  listingKey,
  parseProductsCsv,
  suggestPrice,
  suggestionsCsv,
} from '../seller/seller-math';

const DAY_MS = 24 * 60 * 60 * 1000;
const money = (value: Prisma.Decimal | null | undefined): number | null => (value == null ? null : Number(value));
const decimal = (value: number | null | undefined) => (value == null ? null : new Prisma.Decimal(value.toFixed(2)));

export interface RepricerSettings {
  strategy: RepricerStrategy | null;
  offset?: number;
  floor?: number | null;
  ceiling?: number | null;
}

/**
 * Seller tools on top of the workspace: profit per platform, the best
 * platform to sell on, suggestion-mode repricing with an audit log, the
 * competitor timeline, and product import by CSV or link.
 *
 * Nothing here changes a price on any store. "Apply" records the seller's
 * decision; they change the store themselves (auto mode needs an official
 * seller API, and none is connected).
 */
@Injectable()
export class SellerToolsService {
  private readonly logger = new Logger(SellerToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly products: SellerProductsService,
    private readonly entitlements: EntitlementsService,
  ) {}

  // ── Fees and profit ─────────────────────────────────────────────────

  /** The fee table that applies: the product's category if one exists, else the platform default. */
  private pickFees<T extends { platformId: string; categoryKey: string }>(tables: T[], platformId: string, categorySlug: string | null): T | null {
    const forPlatform = tables.filter((t) => t.platformId === platformId);
    return forPlatform.find((t) => categorySlug && t.categoryKey === categorySlug) ?? forPlatform.find((t) => t.categoryKey === '') ?? null;
  }

  /**
   * One fee table per platform that has one for this category. The seeded
   * tables are per category with no platform default, so a platform without
   * this category is left out; it used to crash both tools (2026-10-09).
   */
  private applicableFees<T extends { platformId: string; categoryKey: string }>(tables: T[], categorySlug: string | null): T[] {
    return [...new Set(tables.map((t) => t.platformId))]
      .map((platformId) => this.pickFees(tables, platformId, categorySlug))
      .filter((table): table is T => table !== null);
  }

  private terms(table: {
    commissionPct: number;
    fixedFee: Prisma.Decimal;
    shippingFee: Prisma.Decimal;
    returnRatePct: number;
    vatPct: number;
    tierUpTo: Prisma.Decimal | null;
    commissionPctAbove: number | null;
    tierWholePrice: boolean;
    minCommission: Prisma.Decimal;
  }): FeeTerms {
    return {
      commissionPct: table.commissionPct,
      fixedFee: Number(table.fixedFee),
      shippingFee: Number(table.shippingFee),
      returnRatePct: table.returnRatePct,
      vatPct: table.vatPct,
      tierUpTo: money(table.tierUpTo),
      commissionPctAbove: table.commissionPctAbove,
      tierWholePrice: table.tierWholePrice,
      minCommission: Number(table.minCommission),
    };
  }

  private async loadProduct(userId: string, orgId: string, productId: string, role: OrgRole = OrgRole.MEMBER) {
    const { organization } = await this.organizations.requireMembership(userId, orgId, role);
    const product = await this.prisma.sellerProduct.findFirst({
      where: { id: productId, orgId },
      include: { canonicalProduct: { select: { id: true, title: true, category: { select: { slug: true } } } } },
    });
    if (!product) throw new NotFoundException('Product not found in this workspace');
    return { organization, product };
  }

  /**
   * Net profit on every platform with a fee table, at the given price (or
   * the seller's own), plus the break-even price there.
   */
  async profit(userId: string, orgId: string, productId: string, price?: number) {
    const { product } = await this.loadProduct(userId, orgId, productId);
    const at = price ?? money(product.currentPrice);
    const cost = money(product.cost);
    const tables = await this.prisma.platformFeeTable.findMany({ include: { platform: { select: { id: true, name: true } } } });
    const category = product.canonicalProduct?.category.slug ?? null;
    const rows = this.applicableFees(tables, category)
      .map((table) => ({
        platform: table.platform,
        feesUpdatedAt: table.updatedAt.toISOString(),
        feesNotes: table.notes,
        fees: this.terms(table),
        breakdown: at === null ? null : computeProfit(at, cost, this.terms(table)),
        breakEven: cost === null ? null : breakEvenPrice(cost, this.terms(table)),
      }))
      .sort((a, b) => (b.breakdown?.netProfit ?? -Infinity) - (a.breakdown?.netProfit ?? -Infinity));
    return { price: at, cost, rows };
  }

  /**
   * Where this product earns most: on each platform with a fee table, the
   * price it sells for there now (that store's cheapest live offer), and the
   * seller's net profit at that price. Platforms without an offer use the
   * seller's own price and say so.
   */
  async bestPlatform(userId: string, orgId: string, productId: string) {
    const { product } = await this.loadProduct(userId, orgId, productId);
    const cost = money(product.cost);
    const own = money(product.currentPrice);
    const market = product.canonicalProductId
      ? ((await this.products.getCompetitorPrices([product.canonicalProductId])).get(product.canonicalProductId) ?? [])
      : [];
    const tables = await this.prisma.platformFeeTable.findMany({ include: { platform: { select: { id: true, name: true } } } });
    const category = product.canonicalProduct?.category.slug ?? null;

    const rows = this.applicableFees(tables, category).map((table) => {
      const offer = market.find((m) => m.platformId === table.platformId) ?? null;
      const price = offer?.price ?? own;
      return {
        platform: table.platform,
        marketPrice: offer?.price ?? null,
        priceUsed: price,
        priceSource: offer ? ('MARKET' as const) : price !== null ? ('YOURS' as const) : null,
        netProfit: price === null ? null : computeProfit(price, cost, this.terms(table)).netProfit,
        marginPct: price === null ? null : computeProfit(price, cost, this.terms(table)).marginPct,
        feesUpdatedAt: table.updatedAt.toISOString(),
      };
    });
    rows.sort((a, b) => (b.netProfit ?? -Infinity) - (a.netProfit ?? -Infinity));
    return { cost, hasCost: cost !== null, rows };
  }

  // ── Competitor timeline ─────────────────────────────────────────────

  /** Each store's daily lowest for this product, the seller's own price changes, and the events. */
  async timeline(userId: string, orgId: string, productId: string, days = 90) {
    const { product } = await this.loadProduct(userId, orgId, productId);
    const since = new Date(Date.now() - Math.min(Math.max(days, 7), 365) * DAY_MS);
    const series = product.canonicalProductId
      ? await this.prisma.$queryRaw<Array<{ platform_id: string; platform_name: string; day: Date; price: Prisma.Decimal }>>`
          SELECT sl.platform_id, p.name AS platform_name, pd.day, MIN(pd.close_price) AS price
          FROM price_daily pd
          JOIN source_listings sl ON sl.id = pd.source_listing_id
          JOIN platforms p ON p.id = sl.platform_id
          WHERE sl.canonical_product_id = ${product.canonicalProductId}
            AND sl.match_status IN ('ACCEPTED', 'MANUAL_ACCEPT')
            AND pd.day >= ${since}::date
          GROUP BY sl.platform_id, p.name, pd.day
          ORDER BY pd.day`
      : [];
    const stores = new Map<string, { platformId: string; platformName: string; points: Array<{ day: string; price: number }> }>();
    for (const row of series) {
      const store = stores.get(row.platform_id) ?? { platformId: row.platform_id, platformName: row.platform_name, points: [] };
      store.points.push({ day: row.day.toISOString().slice(0, 10), price: Number(row.price) });
      stores.set(row.platform_id, store);
    }
    const [changes, events] = await Promise.all([
      this.prisma.priceChangeLog.findMany({
        where: { sellerProductId: product.id, createdAt: { gte: since }, source: { not: PriceChangeSource.SUGGESTED } },
        orderBy: { createdAt: 'asc' },
        select: { newPrice: true, createdAt: true, source: true },
      }),
      this.prisma.competitorEvent.findMany({
        where: { orgId, sellerProductId: product.id, detectedAt: { gte: since } },
        orderBy: { detectedAt: 'desc' },
        take: 50,
        select: { id: true, type: true, severity: true, previousPrice: true, newPrice: true, detectedAt: true, platform: { select: { name: true } } },
      }),
    ]);
    return {
      stores: [...stores.values()],
      ownChanges: changes.map((c) => ({ at: c.createdAt.toISOString(), price: money(c.newPrice), source: c.source })),
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        severity: e.severity,
        platformName: e.platform.name,
        previousPrice: money(e.previousPrice),
        newPrice: money(e.newPrice),
        detectedAt: e.detectedAt.toISOString(),
      })),
    };
  }

  // ── Repricer (suggestion mode) ──────────────────────────────────────

  async updateRepricer(userId: string, orgId: string, productId: string, settings: RepricerSettings) {
    const { product } = await this.loadProduct(userId, orgId, productId, OrgRole.ADMIN);
    const floor = settings.floor === undefined ? money(product.floorPrice) : settings.floor;
    const ceiling = settings.ceiling === undefined ? money(product.ceilingPrice) : settings.ceiling;
    if (floor !== null && ceiling !== null && floor > ceiling) throw new BadRequestException('The floor cannot be above the ceiling');
    await this.prisma.sellerProduct.update({
      where: { id: product.id },
      data: {
        repricerStrategy: settings.strategy,
        repricerOffset: settings.offset === undefined ? undefined : decimal(settings.offset)!,
        floorPrice: decimal(floor),
        ceilingPrice: decimal(ceiling),
      },
    });
    await this.refreshSuggestions(orgId, product.id);
    return this.repricerState(userId, orgId, product.id);
  }

  async repricerState(userId: string, orgId: string, productId: string) {
    const { product } = await this.loadProduct(userId, orgId, productId);
    const log = await this.prisma.priceChangeLog.findMany({
      where: { sellerProductId: product.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, oldPrice: true, newPrice: true, source: true, reason: true, createdAt: true, actorUserId: true },
    });
    return {
      strategy: product.repricerStrategy,
      offset: Number(product.repricerOffset),
      floor: money(product.floorPrice),
      ceiling: money(product.ceilingPrice),
      currentPrice: money(product.currentPrice),
      suggestedPrice: money(product.suggestedPrice),
      suggestionReason: product.suggestionReason,
      suggestedAt: product.suggestedAt?.toISOString() ?? null,
      // No platform offers an official seller API we are connected to yet.
      autoMode: { available: false, reason: 'NO_OFFICIAL_API' as const },
      log: log.map((l) => ({ ...l, oldPrice: money(l.oldPrice), newPrice: money(l.newPrice), createdAt: l.createdAt.toISOString() })),
    };
  }

  /** The seller accepted the suggestion: their price becomes it, logged. They update the store themselves. */
  async applySuggestion(userId: string, orgId: string, productId: string) {
    const { product } = await this.loadProduct(userId, orgId, productId, OrgRole.ADMIN);
    if (product.suggestedPrice === null) throw new BadRequestException('There is no suggested price to apply');
    await this.prisma.$transaction([
      this.prisma.sellerProduct.update({ where: { id: product.id }, data: { currentPrice: product.suggestedPrice } }),
      this.prisma.priceChangeLog.create({
        data: {
          orgId,
          sellerProductId: product.id,
          oldPrice: product.currentPrice,
          newPrice: product.suggestedPrice,
          source: PriceChangeSource.APPLIED,
          reason: product.suggestionReason ?? 'APPLIED',
          actorUserId: userId,
        },
      }),
    ]);
    return this.repricerState(userId, orgId, product.id);
  }

  /** Every product with a suggestion, as CSV for a seller centre upload. */
  async exportSuggestions(userId: string, orgId: string): Promise<string> {
    await this.organizations.requireMembership(userId, orgId);
    const rows = await this.prisma.sellerProduct.findMany({
      where: { orgId, isActive: true, repricerStrategy: { not: null } },
      orderBy: { sku: 'asc' },
      select: { sku: true, name: true, currentPrice: true, suggestedPrice: true, suggestionReason: true },
    });
    return suggestionsCsv(
      rows.map((r) => ({ sku: r.sku, name: r.name, currentPrice: money(r.currentPrice), suggestedPrice: money(r.suggestedPrice), reason: r.suggestionReason ?? '' })),
    );
  }

  /**
   * Recomputes suggestions (all workspaces, or one product). A changed
   * suggestion is written to the audit log; an unchanged one is not.
   */
  async refreshSuggestions(orgId?: string, productId?: string): Promise<{ checked: number; changed: number }> {
    const products = await this.prisma.sellerProduct.findMany({
      where: { isActive: true, repricerStrategy: { not: null }, canonicalProductId: { not: null }, ...(orgId ? { orgId } : {}), ...(productId ? { id: productId } : {}) },
      include: { organization: { select: { platformId: true } } },
      take: 5000,
    });
    const market = await this.products.getCompetitorPrices([...new Set(products.map((p) => p.canonicalProductId!))]);
    let changed = 0;
    for (const product of products) {
      const competitors = this.products
        .excludeOurOwnListing(market.get(product.canonicalProductId!) ?? [], product.organization.platformId)
        .filter((c) => c.inStock !== false);
      const lowest = competitors.length ? Math.min(...competitors.map((c) => c.price)) : null;
      const suggestion = suggestPrice({
        strategy: product.repricerStrategy!,
        offset: Number(product.repricerOffset),
        floor: money(product.floorPrice),
        ceiling: money(product.ceilingPrice),
        currentPrice: money(product.currentPrice),
        lowestCompetitor: lowest,
      });
      const same = money(product.suggestedPrice) === suggestion.price && product.suggestionReason === suggestion.reason;
      if (same) continue;
      changed++;
      await this.prisma.$transaction([
        this.prisma.sellerProduct.update({
          where: { id: product.id },
          data: { suggestedPrice: decimal(suggestion.price), suggestionReason: suggestion.reason, suggestedAt: new Date() },
        }),
        this.prisma.priceChangeLog.create({
          data: {
            orgId: product.orgId,
            sellerProductId: product.id,
            oldPrice: product.currentPrice,
            newPrice: decimal(suggestion.price),
            source: PriceChangeSource.SUGGESTED,
            reason: suggestion.reason,
          },
        }),
      ]);
    }
    if (!orgId) this.logger.log(`Repricer: ${products.length} products checked, ${changed} new suggestions`);
    return { checked: products.length, changed };
  }

  // ── Import ──────────────────────────────────────────────────────────

  /** The catalogue product behind a store link we already track, if any. */
  async resolveListing(url: string): Promise<{ canonicalProductId: string; title: string; platformId: string } | null> {
    const key = listingKey(url);
    if (!key) return null;
    const tail = key.split('/').filter(Boolean).pop() ?? '';
    if (tail.length < 3) return null;
    const candidates = await this.prisma.sourceListing.findMany({
      where: { externalUrl: { contains: tail, mode: 'insensitive' }, canonicalProductId: { not: null } },
      select: { externalUrl: true, platformId: true, canonicalProduct: { select: { id: true, title: true } } },
      take: 20,
    });
    const hit = candidates.find((c) => listingKey(c.externalUrl) === key);
    return hit?.canonicalProduct ? { canonicalProductId: hit.canonicalProduct.id, title: hit.canonicalProduct.title, platformId: hit.platformId } : null;
  }

  private async skuLimit(orgId: string, fallbackUserId: string) {
    const owner = await this.prisma.organizationMember.findFirst({ where: { orgId, role: OrgRole.OWNER }, select: { userId: true } });
    return (await this.entitlements.getEntitlements(owner?.userId ?? fallbackUserId)).limits.monitoredSkus;
  }

  /**
   * Products from a CSV: new SKUs are created (within the plan's product
   * limit), existing ones get only the columns the file fills in. A link we
   * already track connects the product to the catalogue.
   */
  async importCsv(userId: string, orgId: string, text: string) {
    await this.organizations.requireMembership(userId, orgId, OrgRole.ADMIN);
    const { rows, errors } = parseProductsCsv(text);
    const limit = await this.skuLimit(orgId, userId);
    let count = await this.prisma.sellerProduct.count({ where: { orgId } });
    let created = 0;
    let updated = 0;
    let linked = 0;

    for (const row of rows) {
      const resolved = row.url ? await this.resolveListing(row.url) : null;
      if (resolved) linked++;
      const existing = await this.prisma.sellerProduct.findUnique({ where: { orgId_sku: { orgId, sku: row.sku } } });
      if (existing) {
        await this.prisma.sellerProduct.update({
          where: { id: existing.id },
          data: {
            name: row.name,
            ...(row.cost !== null ? { cost: decimal(row.cost) } : {}),
            ...(row.price !== null ? { currentPrice: decimal(row.price) } : {}),
            ...(row.url ? { listingUrl: row.url } : {}),
            ...(resolved && !existing.canonicalProductId ? { canonicalProductId: resolved.canonicalProductId } : {}),
          },
        });
        if (row.price !== null && money(existing.currentPrice) !== row.price) {
          await this.logChange(orgId, existing.id, money(existing.currentPrice), row.price, PriceChangeSource.IMPORTED, userId);
        }
        updated++;
        continue;
      }
      if (!isWithinLimit(count, limit)) {
        errors.push({ line: 0, message: new PlanLimitExceededException('monitored products', count, limit as number).message });
        break;
      }
      const product = await this.prisma.sellerProduct.create({
        data: {
          orgId,
          sku: row.sku,
          name: row.name,
          cost: decimal(row.cost),
          currentPrice: decimal(row.price),
          listingUrl: row.url,
          canonicalProductId: resolved?.canonicalProductId ?? null,
        },
      });
      if (row.price !== null) await this.logChange(orgId, product.id, null, row.price, PriceChangeSource.IMPORTED, userId);
      count++;
      created++;
    }
    return { created, updated, linked, errors };
  }

  /**
   * One product from a store link. A link we track is connected to its
   * catalogue product and named after it; any other link is saved and
   * connected later by the nightly sweep once we have crawled it.
   */
  async importUrl(userId: string, orgId: string, input: { url: string; sku?: string; cost?: number | null; price?: number | null }) {
    await this.organizations.requireMembership(userId, orgId, OrgRole.ADMIN);
    const key = listingKey(input.url);
    if (!key) throw new BadRequestException('That is not a valid link');
    const existingByUrl = await this.prisma.sellerProduct.findFirst({ where: { orgId, listingUrl: input.url } });
    if (existingByUrl) return { id: existingByUrl.id, sku: existingByUrl.sku, linked: existingByUrl.canonicalProductId !== null, created: false };

    const limit = await this.skuLimit(orgId, userId);
    const count = await this.prisma.sellerProduct.count({ where: { orgId } });
    if (!isWithinLimit(count, limit)) throw new PlanLimitExceededException('monitored products', count, limit as number);

    const resolved = await this.resolveListing(input.url);
    const words = key.split('/').slice(1).join(' ').replace(/[-_+.]+/g, ' ').replace(/\s+/g, ' ').trim();
    const sku = (input.sku?.trim() || `LINK-${Buffer.from(key).toString('base64url').slice(-10)}`).slice(0, 128);
    if (await this.prisma.sellerProduct.findUnique({ where: { orgId_sku: { orgId, sku } } })) {
      throw new BadRequestException(`SKU ${sku} is already in this workspace`);
    }
    const product = await this.prisma.sellerProduct.create({
      data: {
        orgId,
        sku,
        name: (resolved?.title ?? (words || key)).slice(0, 255),
        listingUrl: input.url.slice(0, 1000),
        canonicalProductId: resolved?.canonicalProductId ?? null,
        cost: decimal(input.cost),
        currentPrice: decimal(input.price),
      },
    });
    if (input.price != null) await this.logChange(orgId, product.id, null, input.price, PriceChangeSource.IMPORTED, userId);
    return { id: product.id, sku: product.sku, linked: resolved !== null, created: true };
  }

  /** Links saved before we had crawled them: connect any we now track. */
  async connectPendingLinks(): Promise<number> {
    const pending = await this.prisma.sellerProduct.findMany({
      where: { canonicalProductId: null, listingUrl: { not: null }, isActive: true },
      select: { id: true, listingUrl: true },
      take: 1000,
    });
    let connected = 0;
    for (const product of pending) {
      const resolved = await this.resolveListing(product.listingUrl!);
      if (!resolved) continue;
      await this.prisma.sellerProduct.update({ where: { id: product.id }, data: { canonicalProductId: resolved.canonicalProductId } });
      connected++;
    }
    return connected;
  }

  async logChange(orgId: string, sellerProductId: string, oldPrice: number | null, newPrice: number | null, source: PriceChangeSource, actorUserId: string | null, reason: string = source) {
    await this.prisma.priceChangeLog.create({
      data: { orgId, sellerProductId, oldPrice: decimal(oldPrice), newPrice: decimal(newPrice), source, reason, actorUserId },
    });
  }

  // ── Admin: fee tables ───────────────────────────────────────────────

  listFeeTables() {
    return this.prisma.platformFeeTable
      .findMany({ include: { platform: { select: { id: true, name: true, slug: true } } }, orderBy: [{ platformId: 'asc' }, { categoryKey: 'asc' }] })
      .then((rows) => rows.map((r) => ({ ...r, ...this.feeNumbers(r) })));
  }

  /** Decimal money columns as numbers for the JSON response. */
  private feeNumbers(row: { fixedFee: Prisma.Decimal; shippingFee: Prisma.Decimal; tierUpTo: Prisma.Decimal | null; minCommission: Prisma.Decimal }) {
    return {
      fixedFee: Number(row.fixedFee),
      shippingFee: Number(row.shippingFee),
      tierUpTo: money(row.tierUpTo),
      minCommission: Number(row.minCommission),
    };
  }

  async upsertFeeTable(input: {
    platformId: string;
    categoryKey?: string;
    commissionPct: number;
    fixedFee?: number;
    shippingFee?: number;
    returnRatePct?: number;
    vatPct?: number;
    tierUpTo?: number | null;
    commissionPctAbove?: number | null;
    tierWholePrice?: boolean;
    minCommission?: number;
    notes?: string | null;
  }) {
    const platform = await this.prisma.platform.findUnique({ where: { id: input.platformId }, select: { id: true } });
    if (!platform) throw new BadRequestException('Unknown platform');
    const categoryKey = input.categoryKey?.trim().toLowerCase() ?? '';
    const data = {
      commissionPct: input.commissionPct,
      fixedFee: decimal(input.fixedFee ?? 0)!,
      shippingFee: decimal(input.shippingFee ?? 0)!,
      returnRatePct: input.returnRatePct ?? 0,
      vatPct: input.vatPct ?? 14,
      // Both tier fields or neither: half a tier is a flat rate.
      tierUpTo: input.tierUpTo != null && input.commissionPctAbove != null ? decimal(input.tierUpTo) : null,
      commissionPctAbove: input.tierUpTo != null && input.commissionPctAbove != null ? input.commissionPctAbove : null,
      tierWholePrice: input.tierWholePrice ?? false,
      minCommission: decimal(input.minCommission ?? 0)!,
      notes: input.notes ?? null,
    };
    const row = await this.prisma.platformFeeTable.upsert({
      where: { platformId_categoryKey: { platformId: input.platformId, categoryKey } },
      create: { platformId: input.platformId, categoryKey, ...data },
      update: data,
    });
    return { ...row, ...this.feeNumbers(row) };
  }

  async deleteFeeTable(id: string) {
    const { count } = await this.prisma.platformFeeTable.deleteMany({ where: { id } });
    if (count === 0) throw new NotFoundException('Fee table not found');
  }
}
