import { createHash } from 'crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../database/prisma.service';
import { AffiliateConfigService } from './affiliate-config.service';
import { AffiliateProviderRegistry } from './providers/affiliate-provider.registry';
import { isStoreUrl } from './store-url';

export interface CreateRedirectInput {
  sourceListingId: string;
  userId?: string | null;
  ip: string;
  userAgent?: string | null;
}

/**
 * Orchestrates the "Go to Store" flow: never hands back the retailer's raw
 * URL directly. Every call records a tracking click first, then returns the
 * affiliate URL to redirect to -- see AffiliateController for the 302.
 */
@Injectable()
export class AffiliateService {
  private readonly logger = new Logger(AffiliateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly affiliateConfigService: AffiliateConfigService,
    private readonly providerRegistry: AffiliateProviderRegistry,
  ) {}

  async createRedirect(input: CreateRedirectInput): Promise<string> {
    const listing = await this.prisma.sourceListing.findUnique({
      where: { id: input.sourceListingId },
      include: { platform: { select: { slug: true, baseUrl: true } } },
    });
    if (!listing) {
      throw new NotFoundException(`Listing with id "${input.sourceListingId}" not found`);
    }

    // The URL was scraped from the store's HTML. Only send people to that
    // store: anything else would make this route an open redirect under our
    // domain, or run a javascript: URL (S-09).
    if (!isStoreUrl(listing.externalUrl, [listing.platform.baseUrl, this.connectorBaseUrl(listing.platform.slug)])) {
      this.logger.warn(`Refusing redirect for listing ${listing.id}: URL is not on ${listing.platform.slug}'s domain`);
      throw new NotFoundException('This store link is not available');
    }

    const config = await this.affiliateConfigService.getActiveConfig(listing.platformId);
    const clickId = uuidv4();

    let affiliateUrl: string;
    if (config) {
      const provider = this.providerRegistry.resolve(config.providerKey);
      affiliateUrl = provider.buildAffiliateUrl({
        externalUrl: listing.externalUrl,
        affiliateId: config.affiliateId,
        trackingParams: config.trackingParams,
        clickId,
      });
    } else {
      // No affiliate deal configured for this store yet -- still track the
      // click and redirect (never straight to the retailer with no record),
      // just with no monetization params attached.
      this.logger.debug(`No active affiliate config for platform ${listing.platformId}; redirecting bare`);
      affiliateUrl = listing.externalUrl;
    }

    await this.prisma.affiliateClick.create({
      data: {
        id: clickId,
        sourceListingId: listing.id,
        canonicalProductId: listing.canonicalProductId,
        platformId: listing.platformId,
        userId: input.userId ?? null,
        ipHash: this.hashIp(input.ip),
        userAgent: input.userAgent ?? null,
        affiliateUrl,
      },
    });

    return affiliateUrl;
  }

  /** The storefront each connector actually scrapes (retailers config). */
  private connectorBaseUrl(platformSlug: string): string | undefined {
    const bases: Record<string, string | undefined> = {
      amazon: this.configService.get<string>('retailers.amazonBaseUrl'),
      alibaba: this.configService.get<string>('retailers.alibabaBaseUrl'),
      aliexpress: this.configService.get<string>('retailers.aliexpressBaseUrl'),
      noon: this.configService.get<string>('retailers.noonBaseUrl'),
      jumia: this.configService.get<string>('retailers.jumiaBaseUrl'),
      carrefour: this.configService.get<string>('retailers.carrefourBaseUrl'),
      '2b': this.configService.get<string>('retailers.twoBBaseUrl'),
      elaraby: this.configService.get<string>('retailers.elarabyBaseUrl'),
    };
    return bases[platformSlug];
  }

  private hashIp(ip: string): string {
    const salt = this.configService.get<string>('affiliate.ipHashSalt', '');
    return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
  }
}
