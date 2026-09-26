import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MatchStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

const MAX_PAGE_SIZE = 100;

/** A moderator's decision on one review-queue item (validated by ResolveReviewItemDto). */
export interface ResolveReviewItemInput {
  decision: 'ACCEPT' | 'REJECT';
  canonicalProductId?: string;
  notes?: string;
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** Aggregate counters for the admin dashboard. */
  async getDashboardStats() {
    const [
      products,
      listings,
      accepted,
      rejected,
      pendingReview,
      users,
      recentJobs,
    ] = await Promise.all([
      this.prisma.canonicalProduct.count(),
      this.prisma.sourceListing.count(),
      this.prisma.sourceListing.count({
        where: { matchStatus: { in: [MatchStatus.ACCEPTED, MatchStatus.MANUAL_ACCEPT] } },
      }),
      this.prisma.sourceListing.count({
        where: { matchStatus: { in: [MatchStatus.REJECTED, MatchStatus.MANUAL_REJECT] } },
      }),
      this.prisma.reviewQueue.count({ where: { resolvedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.scrapingJob.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          jobType: true,
          status: true,
          query: true,
          createdAt: true,
          completedAt: true,
          platform: { select: { name: true } },
        },
      }),
    ]);

    const decided = accepted + rejected;

    return {
      products: { total: products },
      listings: { total: listings, accepted, rejected },
      review: { pending: pendingReview },
      users: { total: users },
      // Share of decided listings that were accepted; '0.0' when nothing has
      // been decided yet, so the UI never has to render NaN.
      matchRate: decided === 0 ? '0.0' : ((accepted / decided) * 100).toFixed(1),
      recentJobs,
    };
  }

  /** Unresolved match decisions awaiting a human, highest priority first. */
  async getReviewQueue(page = 1, limit = 20) {
    const safePage = Math.max(1, Math.floor(Number(page)) || 1);
    const safeLimit = Math.min(Math.max(1, Math.floor(Number(limit)) || 20), MAX_PAGE_SIZE);

    const where: Prisma.ReviewQueueWhereInput = { resolvedAt: null };

    const [total, items] = await Promise.all([
      this.prisma.reviewQueue.count({ where }),
      this.prisma.reviewQueue.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
        include: {
          sourceListing: {
            include: { platform: { select: { id: true, name: true, slug: true } } },
          },
          canonicalProduct: {
            select: { id: true, title: true, slug: true, imageUrl: true, brand: true },
          },
        },
      }),
    ]);

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    };
  }

  /**
   * Applies a moderator's accept/reject to both the queue item and the
   * underlying listing, and records who decided it. Everything happens in one
   * transaction so a listing can never be re-pointed without an audit row.
   */
  async resolveReviewItem(queueItemId: string, userId: string, input: ResolveReviewItemInput) {
    const item = await this.prisma.reviewQueue.findUnique({
      where: { id: queueItemId },
      select: { id: true, resolvedAt: true, canonicalProductId: true, sourceListingId: true },
    });

    if (!item) throw new NotFoundException('Review queue item not found');
    if (item.resolvedAt) throw new BadRequestException('This item has already been resolved');

    const isAccept = input.decision === 'ACCEPT';
    const resolution = isAccept ? MatchStatus.MANUAL_ACCEPT : MatchStatus.MANUAL_REJECT;

    // An accept must end up pointing at a product: either the reviewer supplies
    // one, or the queue item already proposed one.
    const canonicalProductId = input.canonicalProductId ?? item.canonicalProductId;
    if (isAccept && !canonicalProductId) {
      throw new BadRequestException(
        'Accepting a match requires a canonicalProductId when the queue item has no proposed product',
      );
    }

    if (isAccept && input.canonicalProductId) {
      const exists = await this.prisma.canonicalProduct.findUnique({
        where: { id: input.canonicalProductId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Canonical product not found');
    }

    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.reviewQueue.update({
        where: { id: queueItemId },
        data: {
          resolvedAt: now,
          resolvedBy: userId,
          resolution,
          notes: input.notes ?? undefined,
          ...(isAccept && canonicalProductId ? { canonicalProductId } : {}),
        },
      }),
      this.prisma.reviewDecision.create({
        data: {
          queueItemId,
          userId,
          decision: resolution,
          notes: input.notes ?? undefined,
        },
      }),
      this.prisma.sourceListing.update({
        where: { id: item.sourceListingId },
        data: {
          matchStatus: resolution,
          matchedAt: now,
          // A rejection detaches the listing so it stops contributing prices to
          // a product it does not belong to.
          canonicalProductId: isAccept ? canonicalProductId : null,
        },
      }),
      // Audit trail: every accept/reject leaves a decision record.
      this.prisma.matchDecision.create({
        data: {
          sourceListingId: item.sourceListingId,
          candidateId: isAccept ? canonicalProductId : null,
          status: resolution,
          confidence: 1,
          engineVersion: 'manual-review',
          scores: {},
          reasoning: `Manual review by ${userId}${input.notes ? `: ${input.notes}` : ''}`,
          flags: ['MANUAL_REVIEW'],
        },
      }),
    ]);

    return { resolved: true, status: resolution };
  }

  /** Platform list with live listing counts, for the admin platforms view. */
  async getPlatforms() {
    const platforms = await this.prisma.platform.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { sourceListings: true } } },
    });

    return platforms.map(({ _count, ...platform }) => ({
      ...platform,
      listingCount: _count.sourceListings,
    }));
  }
}
