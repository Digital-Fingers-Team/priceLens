import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus, ProductTier, Prisma, ScrapingJobStatus, Platform, Category } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NormalizerService } from '../matching/normalizer.service';
import { FuzzyMatcherService } from '../matching/fuzzy-matcher.service';
import { SemanticService } from '../matching/semantic.service';
import { AmazonConnector } from './connectors/amazon.connector';
import { AlibabaConnector } from './connectors/alibaba.connector';
import { AliExpressConnector } from './connectors/aliexpress.connector';
import { NoonConnector } from './connectors/noon.connector';
import { JumiaConnector } from './connectors/jumia.connector';
import { CarrefourConnector } from './connectors/carrefour.connector';
import { TwoBConnector } from './connectors/twob.connector';
import { ElarabyConnector } from './connectors/elaraby.connector';
import { RetailerConnector } from './interfaces/retailer-connector.interface';
import { RetailerListing } from './interfaces/retailer-listing.interface';

/**
 * Minimum combined fuzzy score (token overlap + Jaccard + edit similarity) for
 * merging a scraped listing into an existing canonical product from another store.
 * High on purpose: a wrong merge (two different products shown as one) is worse
 * than a missed merge (same product shown twice).
 */
const FUZZY_MATCH_THRESHOLD = 0.85;

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
    private readonly fuzzyMatcher: FuzzyMatcherService,
    private readonly semantic: SemanticService,
    private readonly amazonConnector: AmazonConnector,
    private readonly alibabaConnector: AlibabaConnector,
    private readonly aliExpressConnector: AliExpressConnector,
    private readonly noonConnector: NoonConnector,
    private readonly jumiaConnector: JumiaConnector,
    private readonly carrefourConnector: CarrefourConnector,
    private readonly twoBConnector: TwoBConnector,
    private readonly elarabyConnector: ElarabyConnector,
    private readonly configService: ConfigService,
  ) {
    const connectors: RetailerConnector[] = [
      this.amazonConnector,
      this.alibabaConnector,
      this.aliExpressConnector,
      this.noonConnector,
      this.jumiaConnector,
      this.carrefourConnector,
      this.twoBConnector,
      this.elarabyConnector,
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

    const categoryQueries = categories.map((category) => ({
      category,
      queries: this.buildQueriesForCategory(category),
    }));

    return this.runIngestionJob(platform, connector, limitPerQuery, categoryQueries, {
      categoryCount: categories.length,
    });
  }

  /**
   * Ingests listings for a single ad hoc search term (what the user actually typed)
   * against one resolved category, instead of sweeping every category's canned queries.
   */
  async runQueryIngestion(
    query: string,
    options: LiveIngestionOptions = {},
  ): Promise<IngestionReport> {
    const startedAt = new Date();
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return { startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), platforms: [], skippedPlatforms: [] };
    }

    const availableConnectorSlugs = Array.from(this.connectorsBySlug.keys());
    const requestedPlatforms = options.platformSlugs?.length
      ? options.platformSlugs.map((slug) => slug.toLowerCase())
      : availableConnectorSlugs;

    const limitPerQuery = Math.max(
      1,
      options.limitPerQuery ?? this.configService.get<number>('retailers.liveIngestionLimit', 25),
    );

    const platforms = await this.prisma.platform.findMany({
      where: { slug: { in: requestedPlatforms }, isActive: true },
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

    const category = await this.resolveCategoryForQuery(trimmedQuery);

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
      if (!category) {
        skippedPlatforms.push({ slug: platform.slug, reason: 'no_matching_category' });
        continue;
      }

      try {
        summaries.push(
          await this.runIngestionJob(platform, connector, limitPerQuery, [
            { category, queries: [trimmedQuery] },
          ]),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        skippedPlatforms.push({ slug: platform.slug, reason: `ingestion_failed:${message}` });
      }
    }

    return {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      platforms: summaries,
      skippedPlatforms,
    };
  }

  private async runIngestionJob(
    platform: Platform,
    connector: RetailerConnector,
    limitPerQuery: number,
    categoryQueries: Array<{ category: Category; queries: string[] }>,
    extraPayload: Record<string, unknown> = {},
  ): Promise<IngestionSummary> {
    const job = await this.prisma.scrapingJob.create({
      data: {
        platformId: platform.id,
        jobType: 'LIVE_INGESTION',
        status: ScrapingJobStatus.RUNNING,
        priority: 10,
        payload: this.toJson({
          connector: connector.slug,
          limitPerQuery,
          ...extraPayload,
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
      for (const { category, queries } of categoryQueries) {
        for (const query of queries) {
          summary.queriesRun += 1;

          const listings = await connector.searchListings(query, limitPerQuery);

          for (const listing of listings) {
            if (seenExternalIds.has(listing.externalId)) {
              continue;
            }
            seenExternalIds.add(listing.externalId);

            if (listing.priceUsd == null || !Number.isFinite(listing.priceUsd) || listing.priceUsd <= 0) {
              this.logger.warn(
                `Skipping listing "${listing.title}" from ${connector.slug} — no usable price (likely a scrape error, not a real product)`,
              );
              continue;
            }

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

  private async resolveCategoryForQuery(query: string): Promise<Category | null> {
    const normalizedQuery = query.trim().toLowerCase();
    const queryTerms = normalizedQuery.split(/\s+/).filter(Boolean);

    const categories = await this.prisma.category.findMany({ where: { level: { gt: 0 } } });

    const match = categories.find((category) => {
      const name = category.name.toLowerCase();
      if (name.includes(normalizedQuery) || normalizedQuery.includes(name)) {
        return true;
      }
      return category.searchTerms.some((term) => {
        const normalizedTerm = term.toLowerCase();
        return normalizedQuery.includes(normalizedTerm) || queryTerms.includes(normalizedTerm);
      });
    });

    return match ?? categories[0] ?? null;
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

    // Computed once and threaded through both the match lookup and (if nothing
    // matches) the new-product creation, so we never call Ollama twice for the
    // same listing.
    const listingEmbedding = await this.semantic.embed(listing.title);

    const canonicalMatch = await this.findCanonicalMatch(category.id, normalized, extracted, listing, listingEmbedding);
    const matchedExistingCanonicalProduct = !!canonicalMatch;

    const canonicalProduct =
      canonicalMatch ??
      (await this.createCanonicalProduct(category, listing, normalized, extracted, listingEmbedding));

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
    listingEmbedding: number[] | null,
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

    const listingBrand = listing.brand?.trim().toLowerCase() ?? extracted.brand?.trim().toLowerCase() ?? null;
    const listingModel = listing.model?.trim().toLowerCase() ?? extracted.model?.trim().toLowerCase() ?? null;
    const listingIsAccessory = this.normalizer.isAccessory(listing.title);

    for (const candidate of candidates) {
      const candidateNormalized = candidate.normalizedTitle.trim().toLowerCase();
      if (candidateNormalized !== normalized.normalized) {
        continue;
      }

      const candidateBrand = candidate.brand?.trim().toLowerCase() ?? null;
      if (candidateBrand && listingBrand && candidateBrand !== listingBrand) {
        continue;
      }

      const candidateModel = candidate.model?.trim().toLowerCase() ?? null;
      if (candidateModel && listingModel && candidateModel !== listingModel) {
        continue;
      }

      if (this.hasIdentifierConflict(listing, candidate)) {
        continue;
      }

      return candidate;
    }

    // Ask the local LLM about the handful of candidates whose titles are closest
    // by meaning (embedding similarity) — it isn't fooled by marketing filler the
    // way plain text-overlap scoring is. Only falls through to the legacy fuzzy
    // pass below if Ollama itself is unreachable.
    if (listingEmbedding) {
      const aiMatch = await this.findMatchViaLocalAi(
        listing,
        extracted,
        listingBrand,
        listingIsAccessory,
        listingEmbedding,
        categoryId,
      );
      if (aiMatch !== undefined) {
        return aiMatch;
      }
    }

    // Legacy fallback (regex/text-overlap heuristic) — used only when Ollama is
    // unreachable, so ingestion never silently stops matching entirely.
    let best: { candidate: (typeof candidates)[number]; score: number } | null = null;

    for (const candidate of candidates) {
      const candidateBrand = candidate.brand?.trim().toLowerCase() ?? null;
      if (candidateBrand && listingBrand && candidateBrand !== listingBrand) {
        continue;
      }

      // An accessory's title routinely *names* the product it's compatible with
      // ("Case for Samsung Galaxy S26 Ultra") — that would otherwise satisfy the
      // brand/model/title checks below and merge a phone case into the phone.
      if (listingIsAccessory !== this.normalizer.isAccessory(candidate.title)) {
        continue;
      }

      if (this.fuzzyMatcher.detectVariantConflict(listing.title, candidate.title)) {
        continue;
      }

      if (this.hasIdentifierConflict(listing, candidate)) {
        continue;
      }

      const candidateAttributes = (candidate.attributes ?? {}) as Record<string, unknown>;
      const candidateStorage = typeof candidateAttributes.storage === 'string' ? candidateAttributes.storage : undefined;
      const candidateRam = typeof candidateAttributes.ram === 'string' ? candidateAttributes.ram : undefined;
      const candidateColor = typeof candidateAttributes.color === 'string' ? candidateAttributes.color : undefined;
      if (
        this.fuzzyMatcher.detectStorageConflict(extracted.storage ?? undefined, candidateStorage) ||
        this.fuzzyMatcher.detectRamConflict(extracted.ram ?? undefined, candidateRam) ||
        this.fuzzyMatcher.detectColorConflict(extracted.color ?? undefined, candidateColor)
      ) {
        continue;
      }

      const candidateTitle = this.normalizer.normalizeTitle(candidate.title);
      const titleScore = this.fuzzyMatcher.combinedScore(
        normalized.normalized,
        normalized.tokens,
        candidateTitle.normalized,
        candidateTitle.tokens,
      );

      // Retailers pad titles wildly differently ("Samsung Galaxy S26 - 256GB - Sky
      // Blue" vs "Samsung Galaxy S26, Unlocked Android Smartphone... Galaxy AI...
      // Sky Blue"), which tanks raw title token-overlap even for the exact same SKU.
      // If brand, model number, storage, RAM and color all agree (and none of the
      // conflict guards above rejected the pair), that structured agreement is
      // stronger evidence of a true match than the noisy title text is.
      const candidateModel = candidate.model?.trim().toLowerCase() ?? null;
      const modelsAgree = !!candidateModel && !!listingModel && candidateModel === listingModel;
      const score = modelsAgree ? Math.max(titleScore, 1) : titleScore;

      if (score > (best?.score ?? 0)) {
        best = { candidate, score };
      }
    }

    if (best && best.score >= FUZZY_MATCH_THRESHOLD) {
      return best.candidate;
    }

    return null;
  }

  /**
   * Finds the nearest canonical products by title-embedding similarity, filters
   * them through the same hard conflict guards as the legacy matcher (brand,
   * variant, identifier, storage/RAM/color), then asks the local LLM to confirm
   * whichever survive, closest first. Returns:
   * - a canonical product if the LLM confirms a match,
   * - `null` if it checked plausible neighbors and confirmed none of them match,
   * - `undefined` if Ollama isn't reachable, so the caller should fall back to
   *   the legacy heuristic matcher instead.
   */
  private async findMatchViaLocalAi(
    listing: RetailerListing,
    extracted: ReturnType<NormalizerService['extractAttributes']>,
    listingBrand: string | null,
    listingIsAccessory: boolean,
    listingEmbedding: number[],
    categoryId: string,
  ) {
    const nearest = await this.semantic.findSimilarProducts(listingEmbedding, 8, categoryId);
    if (nearest.length === 0) {
      return null;
    }

    const nearestCandidates = await this.prisma.canonicalProduct.findMany({
      where: { id: { in: nearest.map((n) => n.id) } },
    });
    const candidateById = new Map(nearestCandidates.map((c) => [c.id, c]));

    for (const { id } of nearest) {
      const candidate = candidateById.get(id);
      if (!candidate) continue;

      const candidateBrand = candidate.brand?.trim().toLowerCase() ?? null;
      if (candidateBrand && listingBrand && candidateBrand !== listingBrand) {
        continue;
      }
      if (listingIsAccessory !== this.normalizer.isAccessory(candidate.title)) {
        continue;
      }
      if (this.fuzzyMatcher.detectVariantConflict(listing.title, candidate.title)) {
        continue;
      }
      if (this.hasIdentifierConflict(listing, candidate)) {
        continue;
      }

      const candidateAttributes = (candidate.attributes ?? {}) as Record<string, unknown>;
      const candidateStorage = typeof candidateAttributes.storage === 'string' ? candidateAttributes.storage : undefined;
      const candidateRam = typeof candidateAttributes.ram === 'string' ? candidateAttributes.ram : undefined;
      const candidateColor = typeof candidateAttributes.color === 'string' ? candidateAttributes.color : undefined;
      if (
        this.fuzzyMatcher.detectStorageConflict(extracted.storage ?? undefined, candidateStorage) ||
        this.fuzzyMatcher.detectRamConflict(extracted.ram ?? undefined, candidateRam) ||
        this.fuzzyMatcher.detectColorConflict(extracted.color ?? undefined, candidateColor)
      ) {
        continue;
      }

      const verdict = await this.semantic.judgeSameProduct(listing.title, candidate.title);
      if (verdict === null) {
        return undefined;
      }
      if (verdict) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Same store, near-identical titles, different SKUs (e.g. ELARABY's many
   * "Remote Control TORNADO LED TV Black" remotes) must never merge: when both
   * sides carry the same kind of identifier and the values differ, they are
   * different products no matter how similar the titles look.
   */
  private hasIdentifierConflict(
    listing: RetailerListing,
    candidate: { gtin: string | null; upc: string | null; ean: string | null; mpn: string | null },
  ): boolean {
    const pairs: Array<[string | null | undefined, string | null]> = [
      [listing.identifiers.gtin, candidate.gtin],
      [listing.identifiers.upc, candidate.upc],
      [listing.identifiers.ean, candidate.ean],
      [listing.identifiers.mpn, candidate.mpn],
    ];

    return pairs.some(
      ([listingId, candidateId]) =>
        !!listingId && !!candidateId && listingId.trim().toLowerCase() !== candidateId.trim().toLowerCase(),
    );
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
    listingEmbedding: number[] | null,
  ) {
    const baseSlug = this.toSlug(
      [listing.brand ?? extracted.brand, listing.model ?? extracted.model, listing.title]
        .filter(Boolean)
        .join(' '),
    );
    const slug = await this.ensureUniqueSlug(baseSlug || `product-${listing.externalId}`);

    const price = listing.priceUsd ?? null;

    const product = await this.prisma.canonicalProduct.create({
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

    // Stored so the next listing that might be this same product on another
    // store doesn't need to re-embed every existing candidate's title to compare.
    if (listingEmbedding) {
      await this.semantic.storeCanonicalEmbedding(product.id, listingEmbedding);
    }

    return product;
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
