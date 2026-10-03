import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrgRole, Prisma, ProcurementQuote, ProcurementQuoteItem, QuoteStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../seller/organizations.service';
import { SearchService } from '../search/search.service';
import { OfferPolicy, liveOfferWhere } from '../prices/offer-rules';
import { PdfTable, renderPdf, toCsv } from '../brand/export-formats';
import { CreateQuoteDto, UpdateQuoteItemDto } from './dto/procurement.dto';

export interface QuoteOffer {
  store: string;
  storeSlug: string;
  storeKind: string;
  unitPrice: number;
  inStock: boolean | null;
  url: string;
}

/** The cheapest offer per store for a product, cheapest first. */
export function cheapestPerStore(
  listings: Array<{
    priceUsd: Prisma.Decimal | null;
    inStock: boolean | null;
    externalUrl: string;
    platform: { name: string; slug: string; kind: string };
  }>,
): QuoteOffer[] {
  const best = new Map<string, QuoteOffer>();
  for (const listing of listings) {
    if (listing.priceUsd == null) continue;
    const price = Number(listing.priceUsd);
    const existing = best.get(listing.platform.slug);
    if (!existing || price < existing.unitPrice) {
      best.set(listing.platform.slug, {
        store: listing.platform.name,
        storeSlug: listing.platform.slug,
        storeKind: listing.platform.kind,
        unitPrice: price,
        inStock: listing.inStock,
        url: listing.externalUrl,
      });
    }
  }
  return [...best.values()].sort((a, b) => a.unitPrice - b.unitPrice);
}

/** Sum of unit price x quantity over the lines that found an offer. */
export function quoteTotal(items: Array<{ unitPrice: number | null; quantity: number }>): number | null {
  const priced = items.filter((item) => item.unitPrice != null);
  if (priced.length === 0) return null;
  return Math.round(priced.reduce((sum, item) => sum + (item.unitPrice as number) * item.quantity, 0) * 100) / 100;
}

type QuoteWithItems = ProcurementQuote & { items: ProcurementQuoteItem[] };

const ALTERNATIVES_SHOWN = 4;

/**
 * Company shopping lists priced across the stores we track.
 *
 * Each line is matched to the catalogue by search; the company can pin a line
 * to a different product. The chosen offer is stored with the quote so it
 * keeps saying what was true when it was priced. We do not hold delivery
 * terms for any store, so the document says to confirm them and carries the
 * company's own per-line note instead of inventing a delivery time.
 */
@Injectable()
export class ProcurementService {
  private readonly currency: string;
  private readonly offerPolicy: OfferPolicy;

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly search: SearchService,
    config: ConfigService,
  ) {
    this.currency = config.get<string>('pricing.fxBaseCurrency', 'EGP');
    this.offerPolicy = { maxAgeDays: config.get<number>('pricing.offerMaxAgeDays', 7) };
  }

  async create(userId: string, orgId: string, dto: CreateQuoteDto) {
    await this.organizations.requireMembership(userId, orgId, OrgRole.MEMBER);
    const quote = await this.prisma.procurementQuote.create({
      data: {
        orgId,
        createdBy: userId,
        title: dto.title.trim(),
        notes: dto.notes?.trim() || null,
        currency: this.currency,
        items: {
          create: dto.items.map((item, position) => ({
            position,
            query: item.query.trim(),
            specs: item.specs?.trim() || null,
            quantity: item.quantity ?? 1,
            maxUnitPrice: item.maxUnitPrice != null ? new Prisma.Decimal(item.maxUnitPrice) : null,
            note: item.note?.trim() || null,
          })),
        },
      },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    return this.price(quote);
  }

  async list(userId: string, orgId: string) {
    await this.organizations.requireMembership(userId, orgId);
    const quotes = await this.prisma.procurementQuote.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { _count: { select: { items: true } } },
    });
    return quotes.map((quote) => ({
      id: quote.id,
      title: quote.title,
      status: quote.status,
      itemCount: quote._count.items,
      total: quote.totalAmount != null ? Number(quote.totalAmount) : null,
      currency: quote.currency,
      createdAt: quote.createdAt.toISOString(),
    }));
  }

  async get(userId: string, orgId: string, quoteId: string) {
    await this.organizations.requireMembership(userId, orgId);
    return this.view(await this.load(orgId, quoteId));
  }

  /** Prices the quote again against today's offers. */
  async reprice(userId: string, orgId: string, quoteId: string) {
    await this.organizations.requireMembership(userId, orgId, OrgRole.MEMBER);
    const quote = await this.load(orgId, quoteId);
    if (quote.status === QuoteStatus.FINAL) throw new BadRequestException('A final quote is not repriced; copy it instead');
    return this.price(quote);
  }

  async updateItem(userId: string, orgId: string, quoteId: string, itemId: string, dto: UpdateQuoteItemDto) {
    await this.organizations.requireMembership(userId, orgId, OrgRole.MEMBER);
    const quote = await this.load(orgId, quoteId);
    if (quote.status === QuoteStatus.FINAL) throw new BadRequestException('A final quote cannot be edited');
    const item = quote.items.find((row) => row.id === itemId);
    if (!item) throw new NotFoundException('Line not found');

    await this.prisma.procurementQuoteItem.update({
      where: { id: itemId },
      data: {
        ...(dto.quantity != null ? { quantity: dto.quantity } : {}),
        ...(dto.note !== undefined ? { note: dto.note.trim() || null } : {}),
        ...(dto.maxUnitPrice != null ? { maxUnitPrice: new Prisma.Decimal(dto.maxUnitPrice) } : {}),
        ...(dto.canonicalProductId ? { canonicalProductId: dto.canonicalProductId } : {}),
      },
    });
    return this.price(await this.load(orgId, quoteId));
  }

  async finalize(userId: string, orgId: string, quoteId: string) {
    await this.organizations.requireMembership(userId, orgId, OrgRole.MEMBER);
    await this.load(orgId, quoteId);
    await this.prisma.procurementQuote.update({ where: { id: quoteId }, data: { status: QuoteStatus.FINAL } });
    return this.view(await this.load(orgId, quoteId));
  }

  async remove(userId: string, orgId: string, quoteId: string) {
    await this.organizations.requireMembership(userId, orgId, OrgRole.MEMBER);
    await this.load(orgId, quoteId);
    await this.prisma.procurementQuote.delete({ where: { id: quoteId } });
    return { ok: true };
  }

  async exportCsv(userId: string, orgId: string, quoteId: string): Promise<string> {
    await this.organizations.requireMembership(userId, orgId);
    const quote = this.view(await this.load(orgId, quoteId));
    return toCsv(
      ['#', 'request', 'specs', 'quantity', 'matched_product', 'store', 'unit_price', 'line_total', 'in_stock', 'note', 'url'],
      quote.items.map((item, index) => [
        index + 1,
        item.query,
        item.specs,
        item.quantity,
        item.matchedTitle,
        item.store,
        item.unitPrice,
        item.lineTotal,
        item.inStock == null ? 'unknown' : item.inStock ? 'yes' : 'no',
        item.note,
        item.listingUrl,
      ]),
    );
  }

  async exportPdf(userId: string, orgId: string, quoteId: string): Promise<Buffer> {
    const { organization } = await this.organizations.requireMembership(userId, orgId);
    const quote = this.view(await this.load(orgId, quoteId));
    const money = (value: number | null) =>
      value == null ? '—' : `${Math.round(value).toLocaleString('en-US')} ${quote.currency}`;

    const table: PdfTable = {
      title: 'Items',
      headers: ['#', 'Request', 'Matched product', 'Store', 'Qty', 'Unit price', 'Total', 'Stock'],
      rows: quote.items.map((item, index) => [
        index + 1,
        item.query + (item.note ? ` (${item.note})` : ''),
        item.matchedTitle ?? 'No match found',
        item.store ?? '—',
        item.quantity,
        money(item.unitPrice),
        money(item.lineTotal),
        item.inStock == null ? 'unknown' : item.inStock ? 'in stock' : 'out of stock',
      ]),
    };

    return renderPdf({
      title: `Quotation: ${quote.title}`,
      subtitle: `${organization.name} · priced ${quote.pricedAt?.slice(0, 10) ?? 'not yet'}`,
      facts: [
        ['Items', String(quote.items.length)],
        ['Total (best offers)', money(quote.total)],
        ...(quote.unpricedCount > 0 ? [['Lines without an offer', String(quote.unpricedCount)] as [string, string]] : []),
      ],
      tables: [table],
      footer:
        'Prices are the lowest live offers PriceLens recorded when this quote was priced; stores can change them ' +
        'at any time. Delivery terms are not included: confirm delivery and invoicing with each store before ordering. ' +
        (quote.notes ? `Notes: ${quote.notes}` : ''),
    });
  }

  // ─── internals ───────────────────────────────────────────────────────────

  private async load(orgId: string, quoteId: string): Promise<QuoteWithItems> {
    const quote = await this.prisma.procurementQuote.findFirst({
      where: { id: quoteId, orgId },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    if (!quote) throw new NotFoundException('Quote not found');
    return quote;
  }

  /** Prices every line. A line keeps the product it was matched or pinned to. */
  private async price(quote: QuoteWithItems) {
    for (const item of quote.items) {
      await this.priceItem(item);
    }
    const fresh = await this.load(quote.orgId, quote.id);
    const total = quoteTotal(
      fresh.items.map((item) => ({
        unitPrice: item.unitPrice != null ? Number(item.unitPrice) : null,
        quantity: item.quantity,
      })),
    );
    await this.prisma.procurementQuote.update({
      where: { id: quote.id },
      data: { totalAmount: total != null ? new Prisma.Decimal(total.toFixed(2)) : null, pricedAt: new Date() },
    });
    return this.view(await this.load(quote.orgId, quote.id));
  }

  private async priceItem(item: ProcurementQuoteItem): Promise<void> {
    let productId = item.canonicalProductId;
    let title = item.matchedTitle;

    if (!productId) {
      const top = await this.bestMatch([item.query, item.specs].filter(Boolean).join(' '));
      if (top) {
        productId = top.id;
        title = top.title ?? null;
      }
    }

    if (!productId) {
      await this.prisma.procurementQuoteItem.update({
        where: { id: item.id },
        data: { canonicalProductId: null, matchedTitle: null, store: null, storeSlug: null, storeKind: null, unitPrice: null, inStock: null, listingUrl: null, alternatives: [], pricedAt: new Date() },
      });
      return;
    }

    const product = await this.prisma.canonicalProduct.findUnique({ where: { id: productId }, select: { title: true } });
    const listings = await this.prisma.sourceListing.findMany({
      where: { canonicalProductId: productId, ...liveOfferWhere(this.offerPolicy) },
      select: {
        priceUsd: true,
        inStock: true,
        externalUrl: true,
        platform: { select: { name: true, slug: true, kind: true } },
      },
    });
    const offers = cheapestPerStore(listings);
    const best = offers[0];

    await this.prisma.procurementQuoteItem.update({
      where: { id: item.id },
      data: {
        canonicalProductId: productId,
        matchedTitle: product?.title ?? title,
        store: best?.store ?? null,
        storeSlug: best?.storeSlug ?? null,
        storeKind: best?.storeKind ?? null,
        unitPrice: best ? new Prisma.Decimal(best.unitPrice.toFixed(2)) : null,
        inStock: best?.inStock ?? null,
        listingUrl: best?.url ?? null,
        alternatives: offers.slice(1, 1 + ALTERNATIVES_SHOWN) as unknown as Prisma.InputJsonValue,
        pricedAt: new Date(),
      },
    });
  }

  /**
   * Search needs every word to match, so a detailed request ("... i5 8GB 512")
   * can find nothing while a shorter one finds the product. Drop trailing
   * words down to two; the matched title is shown next to the request so a
   * looser match is visible and can be corrected.
   */
  private async bestMatch(text: string): Promise<{ id: string; title?: string } | undefined> {
    const words = text.split(/\s+/).filter(Boolean);
    for (let count = words.length; count >= Math.min(2, words.length); count -= 1) {
      const result = await this.search.search({ q: words.slice(0, count).join(' '), limit: 3, page: 1 } as never, {
        liveFetch: false,
      });
      const top = (result.hits as Array<{ id: string; title?: string }>)[0];
      if (top) return top;
    }
    return undefined;
  }

  private view(quote: QuoteWithItems) {
    const items = quote.items.map((item) => {
      const unitPrice = item.unitPrice != null ? Number(item.unitPrice) : null;
      const maxUnitPrice = item.maxUnitPrice != null ? Number(item.maxUnitPrice) : null;
      return {
        id: item.id,
        query: item.query,
        specs: item.specs,
        quantity: item.quantity,
        maxUnitPrice,
        overBudget: unitPrice != null && maxUnitPrice != null && unitPrice > maxUnitPrice,
        note: item.note,
        canonicalProductId: item.canonicalProductId,
        matchedTitle: item.matchedTitle,
        store: item.store,
        storeSlug: item.storeSlug,
        storeKind: item.storeKind,
        unitPrice,
        lineTotal: unitPrice != null ? Math.round(unitPrice * item.quantity * 100) / 100 : null,
        inStock: item.inStock,
        listingUrl: item.listingUrl,
        alternatives: item.alternatives as unknown as QuoteOffer[],
      };
    });
    return {
      id: quote.id,
      title: quote.title,
      notes: quote.notes,
      status: quote.status,
      currency: quote.currency,
      total: quote.totalAmount != null ? Number(quote.totalAmount) : null,
      pricedAt: quote.pricedAt?.toISOString() ?? null,
      createdAt: quote.createdAt.toISOString(),
      unpricedCount: items.filter((item) => item.unitPrice == null).length,
      items,
    };
  }
}
