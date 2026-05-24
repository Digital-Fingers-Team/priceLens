import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus, ProductTier, Prisma, ScrapingJobStatus, Platform, Category } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NormalizerService } from '../matching/normalizer.service';
import { BestBuyConnector } from './bestbuy.connector';
import { AmazonConnector } from './connectors/amazon.connector';
import { AlibabaConnector } from './connectors/alibaba.connector';
import { NoonConnector } from './connectors/noon.connector';
import { JumiaConnector } from './connectors/jumia.connector';
import { CarrefourConnector } from './connectors/carrefour.connector';
import { RetailerConnector } from './interfaces/retailer-connector.interface';
import { RetailerListing } from './interfaces/retailer-listing.interface';

export interface LiveIngestionOptions {
  platformSlugs?: string[];
  limitPerQuery?: number;
}

export interface IngestionSummary {
  platformSlug: string;
  platformName: string;
  jobId: string;
  queriesRun: number;
  listingsDiscovered: number;
  listingsUpserted: number;
  canonicalProductsCreated: number;
  canonicalProductsMatched: number;
  priceHistoryEntries: number;
}

export interface IngestionReport {
  startedAt: string;
  finishedAt: string;
  platforms: IngestionSummary[];
  skippedPlatforms: Array<{ slug: string; reason: string }>;
}

@Injectable()
export class LiveIngestionService {
  private readonly logger = new Logger(LiveIngestionService.name);
  private readonly connectorsBySlug: Map<string, RetailerConnector>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly normalizer: NormalizerService,
    private readonly bestBuyConnector: BestBuyConnector,
    private readonly amazonConnector: AmazonConnector,
    private readonly alibabaConnector: AlibabaConnector,
    private readonly noonConnector: NoonConnector,
    private readonly jumiaConnector: JumiaConnector,
    private readonly carrefourConnector: CarrefourConnector,
    private readonly configService: ConfigService,
  ) {
    const connectors: RetailerConnector[] = [
      this.bestBuyConnector,
      this.amazonConnector,
      this.alibabaConnector,
      this.noonConnector,
      this.jumiaConnector,
      this.carrefourConnector,
    ];
    this.connectorsBySlug = new Map(connectors.map((connector) => [connector.slug, connector]));
  }

  async runLiveIngestion(options: LiveIngestionOptions = {}): Promise<IngestionReport> {
    const startedAt = new Date();
    const availableConnectorSlugs = Array.from(this.connectorsBySlug.keys());
    const requestedPlatforms = options.platformSlugs?.length
      ? options.platformSlugs.map((slug) => slug.toLowerCase())
      : availableConnectorSlugs;

    const limitPerQuery = Math.max(
      1,
      options.limitPerQuery ?? this.configService.get<number>('retailers.liveIngestionLimit', 25),
    );

    const platforms = await this.prisma.platform.findMany({
      where: {
        slug: { in: requestedPlatforms },
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });

    const foundSlugs = new Set(platforms.map((platform) => platform.slug));

    const skippedPlatforms: Array<{ slug: string; reason: string }> = [];
    const summaries: IngestionSummary[] = [];

    for (const requestedSlug of requestedPlatforms) {
      if (!this.connectorsBySlug.has(requestedSlug)) {
        skippedPlatforms.push({ slug: requestedSlug, reason: 'unsupported_platform' });
      } else if (!foundSlugs.has(requestedSlug)) {
        skippedPlatforms.push({ slug: requestedSlug, reason: 'platform_not_found_or_inactive' });
      }
    }

    for (const platform of platforms) {
      const connector = this.connectorsBySlug.get(platform.slug);
      if (!connector) {
        skippedPlatforms.push({ slug: platform.slug, reason: 'connector_not_implemented' });
        continue;
      }
      if (!connector.isEnabled) {
        skippedPlatforms.push({ slug: platform.slug, reason: 'connector_disabled' });
        continue;
      }

      try {
        summaries.push(await this.ingestPlatform(platform, connector, limitPerQuery));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        skippedPlatforms.push({ slug: platform.slug, reason: `ingestion_failed:${message}` });
      }
    }

    const finishedAt = new Date();

    return {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      platforms: summaries,
      skippedPlatforms,
    };
  }

  private async ingestPlatform(
    platform: Platform,
    connector: RetailerConnector,
    limitPerQuery: number,
  ): Promise<IngestionSummary> {
    const categories = await this.prisma.category.findMany({
      where: { level: { gt: 0 } },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });

    const job = await this.prisma.scrapingJob.create({
      data: {
        platformId: platform.id,
        jobType: 'LIVE_INGESTION',
        status: ScrapingJobStatus.RUNNING,
        priority: 10,
        payload: this.toJson({
          connector: connector.slug,
          limitPerQuery,
          categoryCount: categories.length,
        }),
        startedAt: new Date(),
      },
    });

    const summary: IngestionSummary = {
      platformSlug: platform.slug,
      platformName: platform.name,
      jobId: job.id,
      queriesRun: 0,
      listingsDiscovered: 0,
      listingsUpserted: 0,
      canonicalProductsCreated: 0,
      canonicalProductsMatched: 0,
      priceHistoryEntries: 0,
    };

    const seenExternalIds = new Set<string>();

    try {
      for (const category of categories) {
        const queries = this.buildQueriesForCategory(category);

        for (const query of queries) {
          summary.queriesRun += 1;

          const listings = await connector.searchListings(query, limitPerQuery);

          for (const listing of listings) {
            if (seenExternalIds.has(listing.externalId)) {
              continue;
            }

            seenExternalIds.add(listing.externalId);
            summary.listingsDiscovered += 1;

            const result = await this.persistListing(platform, category, listing, connector.slug);
            summary.listingsUpserted += 1;
            summary.priceHistoryEntries += result.priceHistoryCreated ? 1 : 0;
            summary.canonicalProductsCreated += result.createdCanonicalProduct ? 1 : 0;
            summary.canonicalProductsMatched += result.matchedExistingCanonicalProduct ? 1 : 0;
          }
        }
      }

      await this.prisma.scrapingJob.update({
        where: { id: job.id },
        data: {
          status: ScrapingJobStatus.COMPLETED,
          completedAt: new Date(),
          result: this.toJson(summary),
        },
      });

      return summary;
    } catch (error) {
      this.logger.error(`Ingestion failed for platform ${platform.slug}`, error as Error);

      await this.prisma.scrapingJob.update({
        where: { id: job.id },
        data: {
          status: ScrapingJobStatus.FAILED,
          completedAt: new Date(),
          error: error instanceof Error ? error.message : String(error),
          result: this.toJson(summary),
        },
      });

      throw error;
    }
  }

  private buildQueriesForCategory(category: Category): string[] {
    const terms = [
      category.name,
      category.slug.replace(/-/g, ' '),
      ...category.searchTerms,
    ]
      .map((term) => term.trim())
      .filter((term) => term.length >= 2);

    return Array.from(new Set(terms)).slice(0, 3);
  }

  private async persistListing(
    platform: Platform,
    category: Category,
    listing: RetailerListing,
    sourceSlug: string,
  ): Promise<{
    createdCanonicalProduct: boolean;
    matchedExistingCanonicalProduct: boolean;
    priceHistoryCreated: boolean;
  }> {
    const normalized = this.normalizer.normalizeTitle(listing.title);
    const extracted = this.normalizer.extractAttributes(listing.title, {
      brand: listing.brand ?? undefined,
      model: listing.model ?? undefined,
      gtin: listing.identifiers.gtin ?? undefined,
      upc: listing.identifiers.upc ?? undefined,
      ean: listing.identifiers.ean ?? undefined,
      mpn: listing.identifiers.mpn ?? undefined,
    });

    const canonicalMatch = await this.findCanonicalMatch(category.id, normalized, extracted, listing);
    const matchedExistingCanonicalProduct = !!canonicalMatch;

    const canonicalProduct =
      canonicalMatch ??
      (await this.createCanonicalProduct(category, listing, normalized, extracted));

    const sourceListing = await this.prisma.sourceListing.upsert({
      where: {
        platformId_externalId: {
          platformId: platform.id,
          externalId: listing.externalId,
        },
      },
      create: {
        platformId: platform.id,
        canonicalProductId: canonicalProduct.id,
        externalId: listing.externalId,
        externalUrl: listing.externalUrl,
        rawTitle: listing.title,
        rawPrice: this.toDbDecimal(listing.priceUsd),
        rawCurrency: listing.currency,
        rawBrand: listing.brand,
        rawImageUrl: listing.imageUrl,
        rawAttributes: this.toJson(this.buildRawAttributes(listing, sourceSlug)),
        rawCategory: category.name,
        normalizedTitle: normalized.normalized,
        extractedGtin: listing.identifiers.gtin,
        extractedUpc: listing.identifiers.upc,
        extractedEan: listing.identifiers.ean,
        extractedMpn: listing.identifiers.mpn,
        extractedBrand: extracted.brand ?? listing.brand,
        extractedModel: extracted.model ?? listing.model,
        extractedAttributes: this.toJson(extracted),
        priceUsd: this.toDbDecimal(listing.priceUsd),
        inStock: listing.inStock,
        rating: listing.rating,
        reviewCount: listing.reviewCount,
        matchStatus: MatchStatus.ACCEPTED,
        matchConfidence: matchedExistingCanonicalProduct ? 1 : 0.98,
        matchedAt: new Date(),
        lastSeenAt: new Date(),
        lastScrapedAt: new Date(),
      },
      update: {
        canonicalProductId: canonicalProduct.id,
        externalUrl: listing.externalUrl,
        rawTitle: listing.title,
        rawPrice: this.toDbDecimal(listing.priceUsd),
        rawCurrency: listing.currency,
        rawBrand: listing.brand,
        rawImageUrl: listing.imageUrl,
        rawAttributes: this.toJson(this.buildRawAttributes(listing, sourceSlug)),
        rawCategory: category.name,
        normalizedTitle: normalized.normalized,
        extractedGtin: listing.identifiers.gtin,
        extractedUpc: listing.identifiers.upc,
        extractedEan: listing.identifiers.ean,
        extractedMpn: listing.identifiers.mpn,
        extractedBrand: extracted.brand ?? listing.brand,
        extractedModel: extracted.model ?? listing.model,
        extractedAttributes: this.toJson(extracted),
        priceUsd: this.toDbDecimal(listing.priceUsd),
        inStock: listing.inStock,
        rating: listing.rating,
        reviewCount: listing.reviewCount,
        matchStatus: MatchStatus.ACCEPTED,
        matchConfidence: matchedExistingCanonicalProduct ? 1 : 0.98,
        matchedAt: new Date(),
        lastSeenAt: new Date(),
        lastScrapedAt: new Date(),
      },
      include: { canonicalProduct: true },
    });

    const priceHistoryCreated = await this.appendPriceHistory(sourceListing.id, canonicalProduct.id, listing);

    await this.prisma.matchDecision.create({
      data: {
        sourceListingId: sourceListing.id,
        candidateId: canonicalProduct.id,
        status: MatchStatus.ACCEPTED,
        confidence: matchedExistingCanonicalProduct ? 1 : 0.98,
        engineVersion: `live-ingestion-${sourceSlug}-v1`,
        scores: this.toJson({
          strategy: matchedExistingCanonicalProduct ? 'exact-match' : 'new-canonical-product',
          source: sourceSlug,
        }),
        reasoning: matchedExistingCanonicalProduct
          ? 'Matched by exact identifier or conservative canonical title comparison.'
          : 'Created a new canonical product because no exact-safe match was found.',
        flags: [],
      },
    });

    return {
      createdCanonicalProduct: !canonicalMatch,
      matchedExistingCanonicalProduct,
      priceHistoryCreated,
    };
  }

  private async findCanonicalMatch(
    categoryId: string,
    normalized: ReturnType<NormalizerService['normalizeTitle']>,
    extracted: ReturnType<NormalizerService['extractAttributes']>,
    listing: RetailerListing,
  ) {
    const identifierMatch = await this.findByIdentifier(listing.identifiers);
    if (identifierMatch) {
      return identifierMatch;
    }

    const candidates = await this.prisma.canonicalProduct.findMany({
      where: {
        categoryId,
      },
      take: 200,
    });

    for (const candidate of candidates) {
      const candidateNormalized = candidate.normalizedTitle.trim().toLowerCase();
      if (candidateNormalized !== normalized.normalized) {
        continue;
      }

      const candidateBrand = candidate.brand?.trim().toLowerCase() ?? null;
      const listingBrand = listing.brand?.trim().toLowerCase() ?? extracted.brand?.trim().toLowerCase() ?? null;
      if (candidateBrand && listingBrand && candidateBrand !== listingBrand) {
        continue;
      }

      const candidateModel = candidate.model?.trim().toLowerCase() ?? null;
      const listingModel = listing.model?.trim().toLowerCase() ?? extracted.model?.trim().toLowerCase() ?? null;
      if (candidateModel && listingModel && candidateModel !== listingModel) {
        continue;
      }

      return candidate;
    }

    return null;
  }

  private async findByIdentifier(identifiers: RetailerListing['identifiers']) {
    const clauses: Array<Record<string, string>> = [];
    if (identifiers.gtin) clauses.push({ gtin: identifiers.gtin });
    if (identifiers.upc) clauses.push({ upc: identifiers.upc });
    if (identifiers.ean) clauses.push({ ean: identifiers.ean });
    if (identifiers.mpn) clauses.push({ mpn: identifiers.mpn });

    if (clauses.length === 0) {
      return null;
    }

    return this.prisma.canonicalProduct.findFirst({
      where: {
        OR: clauses,
      },
    });
  }

  private async createCanonicalProduct(
    category: Category,
    listing: RetailerListing,
    normalized: ReturnType<NormalizerService['normalizeTitle']>,
    extracted: ReturnType<NormalizerService['extractAttributes']>,
  ) {
    const baseSlug = this.toSlug(
      [listing.brand ?? extracted.brand, listing.model ?? extracted.model, listing.title]
        .filter(Boolean)
        .join(' '),
    );
    const slug = await this.ensureUniqueSlug(baseSlug || `product-${listing.externalId}`);

    const price = listing.priceUsd ?? null;

    return this.prisma.canonicalProduct.create({
      data: {
        categoryId: category.id,
        slug,
        title: listing.title,
        normalizedTitle: normalized.normalized,
        brand: listing.brand ?? extracted.brand ?? null,
        model: listing.model ?? extracted.model ?? null,
        gtin: listing.identifiers.gtin ?? null,
        upc: listing.identifiers.upc ?? null,
        ean: listing.identifiers.ean ?? null,
        mpn: listing.identifiers.mpn ?? null,
        attributes: this.toJson(extracted),
        imageUrl: listing.imageUrl ?? null,
        thumbnailUrl: listing.imageUrl ?? null,
        tier: this.inferTier(price),
        isVerified: false,
      },
    });
  }

  private async ensureUniqueSlug(baseSlug: string): Promise<string> {
    let slug = baseSlug;
    let suffix = 1;

    while (await this.prisma.canonicalProduct.findUnique({ where: { slug } })) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    return slug;
  }

  private async appendPriceHistory(
    sourceListingId: string,
    canonicalProductId: string,
    listing: RetailerListing,
  ): Promise<boolean> {
    if (listing.priceUsd == null) {
      return false;
    }

    const lastEntry = await this.prisma.priceHistory.findFirst({
      where: {
        sourceListingId,
      },
      orderBy: { recordedAt: 'desc' },
    });

    const currentPrice = this.toDbDecimal(listing.priceUsd);
    if (!currentPrice) {
      return false;
    }

    if (lastEntry && Number(lastEntry.priceUsd) === Number(currentPrice)) {
      return false;
    }

    await this.prisma.priceHistory.create({
      data: {
        canonicalProductId,
        sourceListingId,
        priceUsd: currentPrice,
        currency: listing.currency,
        originalPrice: currentPrice,
        inStock: listing.inStock ?? true,
      },
    });

    return true;
  }

  private inferTier(priceUsd: number | null): ProductTier {
    if (priceUsd == null) return ProductTier.MID_RANGE;
    if (priceUsd < 300) return ProductTier.BUDGET;
    if (priceUsd < 900) return ProductTier.MID_RANGE;
    if (priceUsd < 1800) return ProductTier.PREMIUM;
    return ProductTier.ULTRA_PREMIUM;
  }

  private buildRawAttributes(listing: RetailerListing, source: string): Record<string, unknown> {
    return {
      source,
      brand: listing.brand,
      model: listing.model,
      identifiers: listing.identifiers,
      imageUrl: listing.imageUrl,
      inStock: listing.inStock,
      rating: listing.rating,
      reviewCount: listing.reviewCount,
      raw: listing.raw,
    };
  }

  private toDbDecimal(value: number | null): string | null {
    if (value == null || !Number.isFinite(value)) {
      return null;
    }

    return value.toFixed(2);
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }

  private toSlug(input: string): string {
    return input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');
  }
}
