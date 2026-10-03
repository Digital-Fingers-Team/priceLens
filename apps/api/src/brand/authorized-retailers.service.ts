import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus, OrgRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../seller/organizations.service';

export interface UnauthorizedListing {
  retailer: string;
  retailerSlug: string;
  sku: string | null;
  productName: string;
  price: number;
  mapPrice: number | null;
  belowMap: boolean;
  listingUrl: string;
  lastSeenAt: string;
}

/**
 * The brand's list of approved stores, and who is selling outside it.
 *
 * Nothing is reported as unauthorized until the brand has declared at least
 * one authorized store: with no list, every seller would be "unauthorized",
 * which is noise and an accusation we have no basis for.
 */
@Injectable()
export class AuthorizedRetailersService {
  private readonly currency: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    config: ConfigService,
  ) {
    this.currency = config.get<string>('pricing.fxBaseCurrency', 'EGP');
  }

  /** Every store that carries the brand's products, marked authorized or not. */
  async list(userId: string, orgId: string) {
    await this.organizations.requireMembership(userId, orgId);
    const authorized = await this.prisma.authorizedRetailer.findMany({ where: { orgId } });
    const authorizedIds = new Set(authorized.map((row) => row.platformId));

    const canonicalIds = await this.monitoredCanonicalIds(orgId);
    const seen = canonicalIds.length
      ? await this.prisma.sourceListing.groupBy({
          by: ['platformId'],
          where: this.listingWhere(canonicalIds),
          _count: { _all: true },
        })
      : [];
    const counts = new Map(seen.map((row) => [row.platformId, row._count._all]));

    const platforms = await this.prisma.platform.findMany({
      where: { isActive: true, OR: [{ id: { in: [...counts.keys()] } }, { id: { in: [...authorizedIds] } }] },
      select: { id: true, name: true, slug: true, kind: true },
      orderBy: { name: 'asc' },
    });

    return {
      declared: authorized.length > 0,
      retailers: platforms.map((platform) => ({
        platformId: platform.id,
        name: platform.name,
        slug: platform.slug,
        kind: platform.kind,
        authorized: authorizedIds.has(platform.id),
        listings: counts.get(platform.id) ?? 0,
        note: authorized.find((row) => row.platformId === platform.id)?.note ?? null,
      })),
    };
  }

  /** Replaces the authorized list. An empty list switches the check off. */
  async setAuthorized(userId: string, orgId: string, platformIds: string[]) {
    await this.organizations.requireMembership(userId, orgId, OrgRole.ADMIN);
    const valid = await this.prisma.platform.findMany({
      where: { id: { in: platformIds } },
      select: { id: true },
    });
    const ids = valid.map((platform) => platform.id);

    await this.prisma.$transaction([
      this.prisma.authorizedRetailer.deleteMany({ where: { orgId, platformId: { notIn: ids } } }),
      ...ids.map((platformId) =>
        this.prisma.authorizedRetailer.upsert({
          where: { orgId_platformId: { orgId, platformId } },
          create: { orgId, platformId },
          update: {},
        }),
      ),
    ]);
    return { authorized: ids.length };
  }

  /** Listings of the brand's products at stores that are not on the list. */
  async listUnauthorized(userId: string, orgId: string): Promise<{ declared: boolean; listings: UnauthorizedListing[] }> {
    await this.organizations.requireMembership(userId, orgId);
    const authorized = await this.prisma.authorizedRetailer.findMany({ where: { orgId }, select: { platformId: true } });
    if (authorized.length === 0) return { declared: false, listings: [] };

    const products = await this.prisma.sellerProduct.findMany({
      where: { orgId, isActive: true, canonicalProductId: { not: null } },
      select: { sku: true, name: true, mapPrice: true, canonicalProductId: true },
    });
    const byCanonical = new Map(products.map((product) => [product.canonicalProductId as string, product]));
    if (byCanonical.size === 0) return { declared: true, listings: [] };

    const listings = await this.prisma.sourceListing.findMany({
      where: {
        ...this.listingWhere([...byCanonical.keys()]),
        platformId: { notIn: authorized.map((row) => row.platformId) },
      },
      select: {
        canonicalProductId: true,
        priceUsd: true,
        externalUrl: true,
        lastSeenAt: true,
        platform: { select: { name: true, slug: true } },
      },
      orderBy: [{ platformId: 'asc' }, { priceUsd: 'asc' }],
      take: 500,
    });

    return {
      declared: true,
      listings: listings.flatMap((listing) => {
        const product = byCanonical.get(listing.canonicalProductId as string);
        if (!product) return [];
        const price = Number(listing.priceUsd);
        const mapPrice = product.mapPrice != null ? Number(product.mapPrice) : null;
        return [
          {
            retailer: listing.platform.name,
            retailerSlug: listing.platform.slug,
            sku: product.sku,
            productName: product.name,
            price,
            mapPrice,
            belowMap: mapPrice != null && price < mapPrice,
            listingUrl: listing.externalUrl,
            lastSeenAt: listing.lastSeenAt.toISOString(),
          },
        ];
      }),
    };
  }

  currencyCode() {
    return this.currency;
  }

  private async monitoredCanonicalIds(orgId: string): Promise<string[]> {
    const products = await this.prisma.sellerProduct.findMany({
      where: { orgId, isActive: true, canonicalProductId: { not: null } },
      select: { canonicalProductId: true },
    });
    return products.map((product) => product.canonicalProductId as string);
  }

  private listingWhere(canonicalIds: string[]) {
    return {
      canonicalProductId: { in: canonicalIds },
      priceUsd: { gt: 0 },
      matchStatus: { in: [MatchStatus.ACCEPTED, MatchStatus.MANUAL_ACCEPT] },
    };
  }
}
