import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BuyerExtrasService, LiveOffer } from './buyer-extras.service';

const MAX_CARTS = 20;
const MAX_ITEMS = 30;

export interface BasketTotal {
  total: number | null;
  /** The store, when the whole basket is bought in one place. */
  store: string | null;
  /** Items no store currently prices; the total leaves them out. */
  missing: string[];
  lines: Array<{ productId: string; qty: number; store: string | null; price: number | null }>;
}

/**
 * The cheapest way to buy a basket: each item at its own cheapest store, or
 * everything from the one store that carries it all for least. Pure, so the
 * rule is tested directly.
 */
export function basketTotal(
  items: Array<{ productId: string; qty: number }>,
  offersByProduct: Map<string, LiveOffer[]>,
  acrossStores: boolean,
): BasketTotal {
  if (acrossStores) {
    const lines = items.map((item) => {
      const best = offersByProduct.get(item.productId)?.[0] ?? null;
      return { productId: item.productId, qty: item.qty, store: best?.store ?? null, price: best?.price ?? null };
    });
    const missing = lines.filter((l) => l.price === null).map((l) => l.productId);
    const total = lines.reduce((sum, l) => sum + (l.price ?? 0) * l.qty, 0);
    return { total: lines.length > missing.length ? Math.round(total * 100) / 100 : null, store: null, missing, lines };
  }

  // One store for everything: only stores that carry every item qualify.
  const stores = new Map<string, { name: string; total: number; prices: Map<string, number> }>();
  items.forEach((item, index) => {
    const cheapestHere = new Map<string, LiveOffer>();
    for (const offer of offersByProduct.get(item.productId) ?? []) {
      if (!cheapestHere.has(offer.platformId)) cheapestHere.set(offer.platformId, offer);
    }
    for (const [platformId, offer] of cheapestHere) {
      if (index === 0) stores.set(platformId, { name: offer.store, total: 0, prices: new Map() });
      const entry = stores.get(platformId);
      if (!entry) continue;
      entry.total += offer.price * item.qty;
      entry.prices.set(item.productId, offer.price);
    }
    for (const platformId of [...stores.keys()]) if (!cheapestHere.has(platformId)) stores.delete(platformId);
  });
  const best = [...stores.values()].sort((a, b) => a.total - b.total)[0];
  if (!best) {
    return { total: null, store: null, missing: items.map((i) => i.productId), lines: items.map((i) => ({ ...i, store: null, price: null })) };
  }
  return {
    total: Math.round(best.total * 100) / 100,
    store: best.name,
    missing: [],
    lines: items.map((i) => ({ productId: i.productId, qty: i.qty, store: best.name, price: best.prices.get(i.productId) ?? null })),
  };
}

@Injectable()
export class CartWatchService {
  private readonly logger = new Logger(CartWatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly extras: BuyerExtrasService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(userId: string) {
    const carts = await this.prisma.cartWatch.findMany({
      where: { userId },
      include: { items: { include: { canonicalProduct: { select: { id: true, slug: true, title: true, titleAr: true, imageUrl: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(carts.map((cart) => this.describe(cart)));
  }

  async create(userId: string, input: { name: string; targetTotal: number; acrossStores?: boolean; items: Array<{ productId: string; qty?: number }> }) {
    if ((await this.prisma.cartWatch.count({ where: { userId } })) >= MAX_CARTS) {
      throw new BadRequestException(`You can watch up to ${MAX_CARTS} baskets.`);
    }
    const items = this.cleanItems(input.items);
    const found = await this.prisma.canonicalProduct.count({ where: { id: { in: items.map((i) => i.productId) } } });
    if (found !== items.length) throw new BadRequestException('One of the products no longer exists');

    const cart = await this.prisma.cartWatch.create({
      data: {
        userId,
        name: input.name.trim().slice(0, 80) || 'Basket',
        targetTotal: new Prisma.Decimal(input.targetTotal),
        acrossStores: input.acrossStores ?? true,
        items: { create: items.map((i) => ({ canonicalProductId: i.productId, qty: i.qty })) },
      },
    });
    return this.get(userId, cart.id);
  }

  async update(userId: string, id: string, input: { name?: string; targetTotal?: number; acrossStores?: boolean; isActive?: boolean; items?: Array<{ productId: string; qty?: number }> }) {
    await this.own(userId, id);
    const items = input.items ? this.cleanItems(input.items) : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.cartWatch.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim().slice(0, 80) || 'Basket' } : {}),
          ...(input.targetTotal !== undefined ? { targetTotal: new Prisma.Decimal(input.targetTotal), lastNotifiedAt: null } : {}),
          ...(input.acrossStores !== undefined ? { acrossStores: input.acrossStores } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      if (items) {
        await tx.cartWatchItem.deleteMany({ where: { cartId: id } });
        await tx.cartWatchItem.createMany({ data: items.map((i) => ({ cartId: id, canonicalProductId: i.productId, qty: i.qty })) });
      }
    });
    return this.get(userId, id);
  }

  async remove(userId: string, id: string) {
    await this.own(userId, id);
    await this.prisma.cartWatch.delete({ where: { id } });
  }

  async get(userId: string, id: string) {
    const cart = await this.prisma.cartWatch.findFirst({
      where: { id, userId },
      include: { items: { include: { canonicalProduct: { select: { id: true, slug: true, title: true, titleAr: true, imageUrl: true } } } } },
    });
    if (!cart) throw new NotFoundException('Basket not found');
    return this.describe(cart);
  }

  /**
   * The sweep: re-price every active basket, notify once when it drops to or
   * under its target, and re-arm when it goes back above.
   */
  async evaluateAll(batchSize = 200): Promise<{ checked: number; notified: number }> {
    const carts = await this.prisma.cartWatch.findMany({
      where: { isActive: true },
      include: { items: true },
      orderBy: { lastCheckedAt: { sort: 'asc', nulls: 'first' } },
      take: batchSize,
    });
    let notified = 0;
    for (const cart of carts) {
      const offers = await this.offersFor(cart.items.map((i) => i.canonicalProductId));
      const result = basketTotal(cart.items.map((i) => ({ productId: i.canonicalProductId, qty: i.qty })), offers, cart.acrossStores);
      const target = Number(cart.targetTotal);
      const reached = result.total !== null && result.missing.length === 0 && result.total <= target;

      await this.prisma.cartWatch.update({
        where: { id: cart.id },
        data: {
          lastCheckedAt: new Date(),
          lastTotal: result.total === null ? null : new Prisma.Decimal(result.total),
          // Above the target again: the next drop is news again.
          ...(!reached && cart.lastNotifiedAt ? { lastNotifiedAt: null } : {}),
        },
      });
      if (!reached || cart.lastNotifiedAt) continue;

      await this.prisma.cartWatch.update({ where: { id: cart.id }, data: { lastNotifiedAt: new Date() } });
      await this.notifications
        .dispatch({
          userId: cart.userId,
          type: 'cart_watch.reached',
          title: `سلة "${cart.name}" وصلت لسعرك`,
          body: `الإجمالي الآن ${result.total} ج.م${result.store ? ` من ${result.store}` : ''} (هدفك ${target} ج.م).`,
          path: '/cart-watch',
          data: { cartId: cart.id, total: result.total, target },
          dedupeKey: `cart:${cart.id}:${result.total}`,
          dedupeWindowMinutes: 24 * 60,
          digestable: true,
        })
        .then(() => (notified += 1))
        .catch((error: Error) => this.logger.warn(`Cart ${cart.id} notification failed: ${error.message}`));
    }
    return { checked: carts.length, notified };
  }

  private async describe(cart: {
    id: string;
    name: string;
    targetTotal: Prisma.Decimal;
    acrossStores: boolean;
    isActive: boolean;
    lastNotifiedAt: Date | null;
    createdAt: Date;
    items: Array<{ canonicalProductId: string; qty: number; canonicalProduct: { id: string; slug: string; title: string; titleAr: string | null; imageUrl: string | null } }>;
  }) {
    const offers = await this.offersFor(cart.items.map((i) => i.canonicalProductId));
    const result = basketTotal(cart.items.map((i) => ({ productId: i.canonicalProductId, qty: i.qty })), offers, cart.acrossStores);
    const target = Number(cart.targetTotal);
    return {
      id: cart.id,
      name: cart.name,
      targetTotal: target,
      acrossStores: cart.acrossStores,
      isActive: cart.isActive,
      total: result.total,
      store: result.store,
      reached: result.total !== null && result.missing.length === 0 && result.total <= target,
      createdAt: cart.createdAt.toISOString(),
      items: cart.items.map((item) => {
        const line = result.lines.find((l) => l.productId === item.canonicalProductId);
        return { product: item.canonicalProduct, qty: item.qty, store: line?.store ?? null, price: line?.price ?? null };
      }),
    };
  }

  private async offersFor(productIds: string[]): Promise<Map<string, LiveOffer[]>> {
    const entries = await Promise.all(productIds.map(async (id) => [id, await this.extras.liveOffers(id)] as const));
    return new Map(entries);
  }

  private cleanItems(items: Array<{ productId: string; qty?: number }>) {
    const merged = new Map<string, number>();
    for (const item of items) merged.set(item.productId, Math.min(99, Math.max(1, Math.floor(item.qty ?? 1))));
    if (merged.size === 0) throw new BadRequestException('A basket needs at least one product');
    if (merged.size > MAX_ITEMS) throw new BadRequestException(`A basket can hold up to ${MAX_ITEMS} products`);
    return [...merged].map(([productId, qty]) => ({ productId, qty }));
  }

  private async own(userId: string, id: string) {
    const cart = await this.prisma.cartWatch.findFirst({ where: { id, userId }, select: { id: true } });
    if (!cart) throw new NotFoundException('Basket not found');
  }
}
