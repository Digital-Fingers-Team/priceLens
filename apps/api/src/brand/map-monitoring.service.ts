import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CompetitorEventType,
  EventSeverity,
  MatchStatus,
  OrgType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrganizationsService } from '../seller/organizations.service';

export interface MapSweepResult {
  productsChecked: number;
  violationsFound: number;
  notificationsSent: number;
}

export interface MapViolation {
  eventId: string;
  sellerProductId: string;
  sku: string;
  productName: string;
  retailer: string;
  retailerSlug: string;
  mapPrice: number;
  advertisedPrice: number;
  /** How far below MAP, as a negative percentage. */
  differencePct: number;
  severity: EventSeverity;
  listingUrl: string | null;
  detectedAt: string;
  acknowledgedAt: string | null;
}

/**
 * Minimum Advertised Price monitoring.
 *
 * A MAP violation is an accusation against a named retailer, so the bar for
 * making one is deliberately high:
 *   - a MAP must be set explicitly on the product; nothing is inferred
 *   - the advertised price must be below it by more than a rounding tolerance
 *   - every violation stores the listing URL and the observed price, so the
 *     brand can show the retailer what we saw rather than just asserting it
 *
 * Violations are recorded as CompetitorEvent rows, which gives them the same
 * dedupe, acknowledgement and reporting machinery as everything else.
 */
@Injectable()
export class MapMonitoringService {
  private readonly logger = new Logger(MapMonitoringService.name);
  private readonly currency: string;

  /**
   * Tolerance below MAP before it counts as a violation.
   *
   * Currency conversion and store-side rounding both move prices by a few
   * tenths of a percent. Flagging those would bury the real violations in
   * noise and make the feature untrustworthy.
   */
  private static readonly TOLERANCE_PCT = 0.5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly organizations: OrganizationsService,
    config: ConfigService,
  ) {
    this.currency = config.get<string>('pricing.fxBaseCurrency', 'EGP');
  }

  /**
   * Checks every product with a MAP against every store advertising it.
   *
   * Idempotent: one violation per (product, retailer, day), enforced by the
   * event dedupe key, so re-running the sweep records nothing twice.
   */
  async runSweep(batchSize = 500): Promise<MapSweepResult> {
    const products = await this.prisma.sellerProduct.findMany({
      where: {
        isActive: true,
        mapPrice: { not: null },
        canonicalProductId: { not: null },
        organization: { type: OrgType.BRAND },
      },
      select: {
        id: true,
        orgId: true,
        sku: true,
        name: true,
        mapPrice: true,
        canonicalProductId: true,
      },
      take: batchSize,
    });

    if (products.length === 0) {
      return { productsChecked: 0, violationsFound: 0, notificationsSent: 0 };
    }

    const listings = await this.prisma.sourceListing.findMany({
      where: {
        canonicalProductId: { in: products.map((product) => product.canonicalProductId as string) },
        priceUsd: { not: null },
        matchStatus: { in: [MatchStatus.ACCEPTED, MatchStatus.MANUAL_ACCEPT] },
      },
      select: {
        canonicalProductId: true,
        platformId: true,
        priceUsd: true,
        advertisedPrice: true,
        externalUrl: true,
        lastSeenAt: true,
        platform: { select: { name: true, slug: true } },
      },
    });

    const byProduct = new Map<string, typeof listings>();
    for (const listing of listings) {
      if (!listing.canonicalProductId) continue;
      const bucket = byProduct.get(listing.canonicalProductId) ?? [];
      bucket.push(listing);
      byProduct.set(listing.canonicalProductId, bucket);
    }

    let violationsFound = 0;
    let notificationsSent = 0;

    for (const product of products) {
      const mapPrice = Number(product.mapPrice);
      if (!Number.isFinite(mapPrice) || mapPrice <= 0) continue;

      const floor = mapPrice * (1 - MapMonitoringService.TOLERANCE_PCT / 100);

      for (const listing of byProduct.get(product.canonicalProductId as string) ?? []) {
        // The advertised price is what MAP governs. Where a store publishes a
        // struck-through "was" price, the live price is still the advertised
        // one -- so priceUsd is the figure checked.
        const advertised = Number(listing.priceUsd);
        if (!Number.isFinite(advertised) || advertised <= 0 || advertised >= floor) continue;

        const differencePct = ((advertised - mapPrice) / mapPrice) * 100;
        const severity =
          differencePct <= -15
            ? EventSeverity.CRITICAL
            : differencePct <= -5
              ? EventSeverity.WARNING
              : EventSeverity.INFO;

        const recorded = await this.recordViolation(product, listing, mapPrice, differencePct, severity);
        if (!recorded) continue;

        violationsFound += 1;
        notificationsSent += await this.notify(product, listing, mapPrice, advertised, differencePct);
      }
    }

    if (violationsFound > 0) {
      this.logger.log(
        `MAP sweep: ${products.length} product(s) checked, ${violationsFound} violation(s), ` +
          `${notificationsSent} notification(s)`,
      );
    }

    return { productsChecked: products.length, violationsFound, notificationsSent };
  }

  private async recordViolation(
    product: { id: string; orgId: string; canonicalProductId: string | null },
    listing: {
      platformId: string;
      priceUsd: Prisma.Decimal | null;
      externalUrl: string;
      platform: { name: string; slug: string };
    },
    mapPrice: number,
    differencePct: number,
    severity: EventSeverity,
  ): Promise<boolean> {
    const day = new Date().toISOString().slice(0, 10);
    const dedupeKey = `${product.canonicalProductId}:${listing.platformId}:MAP_VIOLATION:${day}`;

    try {
      await this.prisma.competitorEvent.create({
        data: {
          orgId: product.orgId,
          sellerProductId: product.id,
          canonicalProductId: product.canonicalProductId as string,
          platformId: listing.platformId,
          type: CompetitorEventType.MAP_VIOLATION,
          severity,
          newPrice: listing.priceUsd,
          ourPrice: new Prisma.Decimal(mapPrice.toFixed(2)),
          changePct: differencePct,
          dedupeKey,
          // Evidence, not assertion: this is what the brand shows the retailer.
          evidence: {
            retailer: listing.platform.name,
            retailerSlug: listing.platform.slug,
            url: listing.externalUrl,
            mapPrice,
            advertisedPrice: Number(listing.priceUsd),
            currency: this.currency,
            observedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false;
      this.logger.error(`Could not record MAP violation: ${(error as Error).message}`);
      return false;
    }
  }

  private async notify(
    product: { orgId: string; id: string; name: string },
    listing: { platform: { name: string } },
    mapPrice: number,
    advertised: number,
    differencePct: number,
  ): Promise<number> {
    const members = await this.prisma.organizationMember.findMany({
      where: { orgId: product.orgId },
      select: { userId: true },
    });

    const money = (value: number) => `${Math.round(value).toLocaleString('en-US')} ${this.currency}`;

    let sent = 0;
    for (const member of members) {
      const result = await this.notifications.dispatch({
        userId: member.userId,
        type: 'brand.map_violation',
        title: `MAP violation: ${listing.platform.name} on ${product.name}`,
        body:
          `Advertised at ${money(advertised)} against a MAP of ${money(mapPrice)} ` +
          `(${differencePct.toFixed(1)}%).`,
        path: `/brand/${product.orgId}/map`,
        data: {
          orgId: product.orgId,
          sellerProductId: product.id,
          retailer: listing.platform.name,
          mapPrice,
          advertisedPrice: advertised,
          differencePct,
          currency: this.currency,
        },
        dedupeKey: `map:${product.orgId}:${product.id}:${listing.platform.name}:${new Date().toISOString().slice(0, 10)}`,
        dedupeWindowMinutes: 24 * 60,
      });
      if (result.notificationId) sent += 1;
    }

    return sent;
  }

  /** The violation list for a brand workspace. */
  async listViolations(
    userId: string,
    orgId: string,
    options: { unacknowledgedOnly?: boolean; limit?: number } = {},
  ): Promise<MapViolation[]> {
    await this.organizations.requireMembership(userId, orgId);

    const events = await this.prisma.competitorEvent.findMany({
      where: {
        orgId,
        type: CompetitorEventType.MAP_VIOLATION,
        ...(options.unacknowledgedOnly ? { acknowledgedAt: null } : {}),
      },
      include: {
        platform: { select: { name: true, slug: true } },
        sellerProduct: { select: { id: true, sku: true, name: true } },
      },
      orderBy: { detectedAt: 'desc' },
      take: Math.min(Math.max(options.limit ?? 100, 1), 500),
    });

    return events.map((event) => {
      const evidence = (event.evidence ?? {}) as Record<string, unknown>;
      return {
        eventId: event.id,
        sellerProductId: event.sellerProduct?.id ?? '',
        sku: event.sellerProduct?.sku ?? '—',
        productName: event.sellerProduct?.name ?? '—',
        retailer: event.platform.name,
        retailerSlug: event.platform.slug,
        mapPrice: event.ourPrice != null ? Number(event.ourPrice) : 0,
        advertisedPrice: event.newPrice != null ? Number(event.newPrice) : 0,
        differencePct: event.changePct ?? 0,
        severity: event.severity,
        listingUrl: typeof evidence.url === 'string' ? evidence.url : null,
        detectedAt: event.detectedAt.toISOString(),
        acknowledgedAt: event.acknowledgedAt?.toISOString() ?? null,
      };
    });
  }
}
