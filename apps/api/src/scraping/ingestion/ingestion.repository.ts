import { Injectable } from '@nestjs/common';
import { MatchStatus, Prisma, ScrapingJobStatus } from '@prisma/client';
import type { CanonicalProduct, Category, Platform } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  CANDIDATE_POOL_SIZE,
  CATEGORY_MEDIAN_TTL_MS,
  CandidateSource,
  ListingIdentifiers,
  MIN_LISTINGS_FOR_CATEGORY_FLOOR,
  PricedOffer,
  identifierLookupClauses,
} from '../../matching/pipeline';

const ACCEPTED_STATUSES: MatchStatus[] = [MatchStatus.ACCEPTED, MatchStatus.MANUAL_ACCEPT];

const toJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

/**
 * Every database read and write ingestion does. The services above it hold
 * no Prisma calls, so the ingestion flow reads as a sequence of decisions.
 */
@Injectable()
export class IngestionRepository {
  private readonly categoryMedians = new Map<string, { median: number | null; at: number }>();

  constructor(private readonly prisma: PrismaService) {}

  // ─── Platforms and categories ─────────────────────────────────────────

  findActivePlatforms(slugs: string[]): Promise<Platform[]> {
    return this.prisma.platform.findMany({
      where: { slug: { in: slugs }, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  findAllActivePlatforms(): Promise<Platform[]> {
    return this.prisma.platform.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  findActivePlatformSlugs(): Promise<Array<{ slug: string }>> {
    return this.prisma.platform.findMany({ where: { isActive: true }, select: { slug: true } });
  }

  /** Leaf categories, in sweep order. */
  findSweepCategories(): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { level: { gt: 0 } },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });
  }

  /** Leaf categories in database order (the query resolver's fallback is the first). */
  findLeafCategories(): Promise<Category[]> {
    return this.prisma.category.findMany({ where: { level: { gt: 0 } } });
  }

  // ─── Scraping job log ─────────────────────────────────────────────────

  async startJob(platformId: string, payload: Record<string, unknown>): Promise<string> {
    const job = await this.prisma.scrapingJob.create({
      data: {
        platformId,
        jobType: 'LIVE_INGESTION',
        status: ScrapingJobStatus.RUNNING,
        priority: 10,
        payload: toJson(payload),
        startedAt: new Date(),
      },
    });
    return job.id;
  }

  async completeJob(jobId: string, result: unknown): Promise<void> {
    await this.prisma.scrapingJob.update({
      where: { id: jobId },
      data: { status: ScrapingJobStatus.COMPLETED, completedAt: new Date(), result: toJson(result) },
    });
  }

  async failJob(jobId: string, error: string, result: unknown): Promise<void> {
    await this.prisma.scrapingJob.update({
      where: { id: jobId },
      data: { status: ScrapingJobStatus.FAILED, completedAt: new Date(), error, result: toJson(result) },
    });
  }

  // ─── Store coverage ───────────────────────────────────────────────────

  /** Products with their category and the platforms that already list them. */
  findProductsWithCoverage(productIds: string[]) {
    return this.prisma.canonicalProduct.findMany({
      where: { id: { in: productIds } },
      include: {
        category: true,
        sourceListings: { select: { platformId: true } },
      },
    });
  }

  findProductForExpansion(productId: string) {
    return this.prisma.canonicalProduct.findUnique({
      where: { id: productId },
      include: {
        category: true,
        sourceListings: { select: { platformId: true, priceUsd: true } },
      },
    });
  }

  /**
   * Products below `minStores` priced, in-stock stores that the sweep has not
   * tried since `cooldownCutoff`, worst-covered first.
   */
  findUnderCoveredProducts(minStores: number, cooldownCutoff: Date, limit: number): Promise<Array<{ id: string }>> {
    return this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT cp.id
      FROM canonical_products cp
      JOIN source_listings sl
        ON sl.canonical_product_id = cp.id
        AND sl.price_usd IS NOT NULL AND sl.price_usd > 0 AND sl.in_stock IS NOT FALSE
      WHERE cp.last_coverage_attempt_at IS NULL
         OR cp.last_coverage_attempt_at < ${cooldownCutoff}
      GROUP BY cp.id
      HAVING COUNT(DISTINCT sl.platform_id) < ${minStores}
      ORDER BY COUNT(DISTINCT sl.platform_id) ASC, cp.last_coverage_attempt_at ASC NULLS FIRST
      LIMIT ${limit}
    `);
  }

  async markCoverageAttempt(productId: string): Promise<void> {
    await this.prisma.canonicalProduct.update({
      where: { id: productId },
      data: { lastCoverageAttemptAt: new Date() },
    });
  }

  // ─── Matching reads ───────────────────────────────────────────────────

  /** Pipeline steps 6-9 candidate lookup. */
  readonly candidates: CandidateSource<CanonicalProduct> = {
    findByIdentifier: (identifiers: ListingIdentifiers) => {
      const clauses = identifierLookupClauses(identifiers);
      if (clauses.length === 0) {
        return Promise.resolve(null);
      }
      return this.prisma.canonicalProduct.findFirst({ where: { OR: clauses } });
    },
    findInCategory: (categoryId: string) =>
      this.prisma.canonicalProduct.findMany({ where: { categoryId }, take: CANDIDATE_POOL_SIZE }),
  };

  /**
   * Median accepted price in a category, cached for an hour; null while the
   * category has too few listings for its median to mean anything.
   */
  async categoryMedianPrice(categoryId: string): Promise<number | null> {
    const cached = this.categoryMedians.get(categoryId);
    if (cached && Date.now() - cached.at < CATEGORY_MEDIAN_TTL_MS) return cached.median;

    const [row] = await this.prisma.$queryRaw<Array<{ median: number | null; n: bigint }>>(Prisma.sql`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY sl.price_usd)::float AS median, COUNT(*) AS n
      FROM source_listings sl
      JOIN canonical_products cp ON cp.id = sl.canonical_product_id
      WHERE cp.category_id = ${categoryId}
        AND sl.match_status IN ('ACCEPTED', 'MANUAL_ACCEPT')
        AND sl.price_usd > 0
    `);
    const median = row && Number(row.n) >= MIN_LISTINGS_FOR_CATEGORY_FLOOR ? row.median : null;
    this.categoryMedians.set(categoryId, { median, at: Date.now() });
    return median;
  }

  /** A product's other accepted, priced offers (pipeline step 10). */
  async otherAcceptedOffers(canonicalProductId: string, platformId: string, externalId: string): Promise<PricedOffer[]> {
    const others = await this.prisma.sourceListing.findMany({
      where: {
        canonicalProductId,
        matchStatus: { in: ACCEPTED_STATUSES },
        priceUsd: { not: null },
        NOT: { platformId, externalId },
      },
      select: { priceUsd: true, platformId: true },
    });
    return others.map((other) => ({ price: Number(other.priceUsd), store: other.platformId }));
  }

  // ─── Writes ───────────────────────────────────────────────────────────

  /**
   * Marks an earlier-accepted (or pending) copy of this listing REJECTED.
   * Returns how many rows changed: 0 when it was never stored.
   */
  async rejectStoredListing(platformId: string, externalId: string): Promise<number> {
    const { count } = await this.prisma.sourceListing.updateMany({
      where: {
        platformId,
        externalId,
        matchStatus: { in: [MatchStatus.ACCEPTED, MatchStatus.PENDING] },
      },
      data: { matchStatus: MatchStatus.REJECTED, lastSeenAt: new Date(), lastScrapedAt: new Date() },
    });
    return count;
  }

  async createCanonicalProduct(
    data: Omit<Prisma.CanonicalProductUncheckedCreateInput, 'slug'> & { baseSlug: string },
  ): Promise<CanonicalProduct> {
    const { baseSlug, ...rest } = data;
    const slug = await this.ensureUniqueSlug(baseSlug);
    return this.prisma.canonicalProduct.create({ data: { ...rest, slug } });
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

  /** Inserts or refreshes the listing row keyed by (platform, external id). */
  upsertSourceListing(
    platformId: string,
    externalId: string,
    fields: Omit<Prisma.SourceListingUncheckedCreateInput, 'platformId' | 'externalId'>,
  ) {
    return this.prisma.sourceListing.upsert({
      where: { platformId_externalId: { platformId, externalId } },
      create: { platformId, externalId, ...fields },
      update: fields,
      include: { canonicalProduct: true },
    });
  }

  /**
   * Appends a price point unless the listing's latest one has the same price.
   * Returns whether a row was written.
   */
  async appendPriceHistoryIfChanged(entry: {
    sourceListingId: string;
    canonicalProductId: string;
    priceUsd: string;
    currency: string;
    originalPrice: string | null;
    inStock: boolean;
  }): Promise<boolean> {
    const lastEntry = await this.prisma.priceHistory.findFirst({
      where: { sourceListingId: entry.sourceListingId },
      orderBy: { recordedAt: 'desc' },
    });

    if (lastEntry && Number(lastEntry.priceUsd) === Number(entry.priceUsd)) {
      return false;
    }

    await this.prisma.priceHistory.create({ data: entry });
    return true;
  }

  async recordMatchDecision(data: Prisma.MatchDecisionUncheckedCreateInput): Promise<void> {
    await this.prisma.matchDecision.create({ data });
  }
}
