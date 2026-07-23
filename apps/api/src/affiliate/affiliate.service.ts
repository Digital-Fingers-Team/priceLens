import { createHash } from 'crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../database/prisma.service';
import { AffiliateConfigService } from './affiliate-config.service';
import { AffiliateProviderRegistry } from './providers/affiliate-provider.registry';

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
    });
    if (!listing) {
      throw new NotFoundException(`Listing with id "${input.sourceListingId}" not found`);
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

  private hashIp(ip: string): string {
    const salt = this.configService.get<string>('affiliate.ipHashSalt', '');
    return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
  }
}
