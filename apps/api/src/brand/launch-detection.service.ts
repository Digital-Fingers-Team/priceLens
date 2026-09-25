import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus, OrgRole, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrganizationsService } from '../seller/organizations.service';
import type { UpsertBrandWatchDto } from './dto/brand.dto';

export interface LaunchSweepResult {
  watchesChecked: number;
  productsDiscovered: number;
  notificationsSent: number;
}

/**
 * Detects products appearing for the first time inside a watched brand or
 * category.
 *
 * The honesty constraint here is sharp: we can only claim "first detected by
 * PriceLens", never "launched". A product may have been on sale for a year
 * before we started crawling the store that carries it. Every surface says
 * "first detected", the stored timestamp is named firstDetectedAt, and the
 * first sweep for a new watch back-fills silently rather than announcing the
 * brand's entire existing catalogue as new.
 */
@Injectable()
export class LaunchDetectionService {
  private readonly logger = new Logger(LaunchDetectionService.name);
  private readonly currency: string;

  /**
   * Products created before a watch existed are recorded but not announced.
   * Without this, adding a watch would notify a brand about hundreds of
   * products that are not news, and they would switch the feature off.
   */
  private static readonly ANNOUNCE_WINDOW_DAYS = 14;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly organizations: OrganizationsService,
    config: ConfigService,
  ) {
    this.currency = config.get<string>('pricing.fxBaseCurrency', 'EGP');
  }

  async runSweep(): Promise<LaunchSweepResult> {
    const watches = await this.prisma.brandWatch.findMany({
      where: { isActive: true },
      select: {
        id: true,
        orgId: true,
        brand: true,
        categoryId: true,
        createdAt: true,
      },
    });

    if (watches.length === 0) {
      return { watchesChecked: 0, productsDiscovered: 0, notificationsSent: 0 };
    }

    let productsDiscovered = 0;
    let notificationsSent = 0;

    for (const watch of watches) {
      const candidates = await this.prisma.canonicalProduct.findMany({
        where: {
          brand: { equals: watch.brand, mode: 'insensitive' },
          ...(watch.categoryId ? { categoryId: watch.categoryId } : {}),
          sourceListings: {
            some: { priceUsd: { not: null }, matchStatus: { in: [MatchStatus.ACCEPTED, MatchStatus.MANUAL_ACCEPT] } },
          },
        },
        select: {
          id: true,
          title: true,
          brand: true,
          createdAt: true,
          category: { select: { name: true } },
          sourceListings: {
            where: { priceUsd: { not: null } },
            select: { priceUsd: true, platform: { select: { name: true } } },
            orderBy: { priceUsd: 'asc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });

      for (const product of candidates) {
        const cheapest = product.sourceListings[0];

        try {
          await this.prisma.productDiscovery.create({
            data: {
              orgId: watch.orgId,
              canonicalProductId: product.id,
              brand: product.brand,
              categoryName: product.category.name,
              firstPrice: cheapest?.priceUsd ?? null,
              firstStore: cheapest?.platform.name ?? null,
            },
          });
        } catch (error) {
          // Already discovered for this org — the common case on every sweep
          // after the first.
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
          this.logger.error(`Could not record discovery: ${(error as Error).message}`);
          continue;
        }

        productsDiscovered += 1;

        // Only announce genuinely recent arrivals. Everything else is
        // back-fill, recorded so it is never announced later by mistake.
        const ageDays = (Date.now() - product.createdAt.getTime()) / 86_400_000;
        const watchAgeDays = (Date.now() - watch.createdAt.getTime()) / 86_400_000;
        const isRecent = ageDays <= LaunchDetectionService.ANNOUNCE_WINDOW_DAYS;
        const watchPredatesProduct = watch.createdAt.getTime() <= product.createdAt.getTime();

        if (!isRecent || (!watchPredatesProduct && watchAgeDays < 1)) continue;

        notificationsSent += await this.announce(watch.orgId, product, cheapest);
      }
    }

    if (productsDiscovered > 0) {
      this.logger.log(
        `Launch detection: ${watches.length} watch(es), ${productsDiscovered} product(s) discovered, ` +
          `${notificationsSent} notification(s)`,
      );
    }

    return { watchesChecked: watches.length, productsDiscovered, notificationsSent };
  }

  private async announce(
    orgId: string,
    product: { id: string; title: string; brand: string | null; category: { name: string } },
    cheapest: { priceUsd: Prisma.Decimal | null; platform: { name: string } } | undefined,
  ): Promise<number> {
    const members = await this.prisma.organizationMember.findMany({
      where: { orgId },
      select: { userId: true },
    });

    const price = cheapest?.priceUsd != null ? Number(cheapest.priceUsd) : null;
    const body = [
      `Brand: ${product.brand ?? 'unknown'}`,
      `Category: ${product.category.name}`,
      price != null
        ? `First seen at ${Math.round(price).toLocaleString('en-US')} ${this.currency}` +
          (cheapest?.platform.name ? ` on ${cheapest.platform.name}` : '')
        : 'No price observed yet',
    ].join('\n');

    let sent = 0;
    for (const member of members) {
      const result = await this.notifications.dispatch({
        userId: member.userId,
        // "Detected", not "launched" -- we only know when we first saw it.
        type: 'brand.new_product_detected',
        title: `New product detected: ${product.title}`,
        body,
        path: `/brand/${orgId}/discoveries`,
        data: { orgId, canonicalProductId: product.id, price, currency: this.currency },
        dedupeKey: `discovery:${orgId}:${product.id}`,
        dedupeWindowMinutes: 30 * 24 * 60,
      });
      if (result.notificationId) sent += 1;
    }

    await this.prisma.productDiscovery.updateMany({
      where: { orgId, canonicalProductId: product.id },
      data: { notifiedAt: new Date() },
    });

    return sent;
  }

  // ─── Brand watches (what the sweep looks for) ───────────────────────────

  async listWatches(userId: string, orgId: string) {
    await this.organizations.requireMembership(userId, orgId);
    const watches = await this.prisma.brandWatch.findMany({
      where: { orgId },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return watches.map((watch) => ({
      id: watch.id,
      brand: watch.brand,
      category: watch.category,
      isOwnBrand: watch.isOwnBrand,
      isActive: watch.isActive,
      createdAt: watch.createdAt.toISOString(),
    }));
  }

  async upsertWatch(userId: string, orgId: string, dto: UpsertBrandWatchDto) {
    await this.organizations.requireMembership(userId, orgId, OrgRole.ADMIN);

    // find-then-write: categoryId is nullable and Prisma's compound-unique
    // `where` type will not accept null for it.
    const existing = await this.prisma.brandWatch.findFirst({
      where: { orgId, brand: dto.brand, categoryId: dto.categoryId ?? null },
    });

    const watch = existing
      ? await this.prisma.brandWatch.update({
          where: { id: existing.id },
          data: {
            ...(dto.isOwnBrand != null ? { isOwnBrand: dto.isOwnBrand } : {}),
            ...(dto.isActive != null ? { isActive: dto.isActive } : {}),
          },
        })
      : await this.prisma.brandWatch.create({
          data: {
            orgId,
            brand: dto.brand.trim(),
            categoryId: dto.categoryId ?? null,
            isOwnBrand: dto.isOwnBrand ?? false,
            isActive: dto.isActive ?? true,
          },
        });

    return { id: watch.id, brand: watch.brand, isActive: watch.isActive };
  }

  async deleteWatch(userId: string, orgId: string, watchId: string) {
    await this.organizations.requireMembership(userId, orgId, OrgRole.ADMIN);
    await this.prisma.brandWatch.deleteMany({ where: { id: watchId, orgId } });
    return { ok: true };
  }

  async listDiscoveries(userId: string, orgId: string, limit = 100) {
    await this.organizations.requireMembership(userId, orgId);

    const discoveries = await this.prisma.productDiscovery.findMany({
      where: { orgId },
      include: { canonicalProduct: { select: { slug: true, title: true, imageUrl: true } } },
      orderBy: { firstDetectedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });

    return discoveries.map((discovery) => ({
      id: discovery.id,
      canonicalProductId: discovery.canonicalProductId,
      title: discovery.canonicalProduct.title,
      slug: discovery.canonicalProduct.slug,
      imageUrl: discovery.canonicalProduct.imageUrl,
      brand: discovery.brand,
      categoryName: discovery.categoryName,
      firstPrice: discovery.firstPrice != null ? Number(discovery.firstPrice) : null,
      firstStore: discovery.firstStore,
      firstDetectedAt: discovery.firstDetectedAt.toISOString(),
      currency: this.currency,
    }));
  }
}
