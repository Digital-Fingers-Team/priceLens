import { Injectable, NotFoundException } from '@nestjs/common';
import { CompetitorEventType, OrgRole, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from './organizations.service';

@Injectable()
export class CompetitorEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
  ) {}

  async list(
    userId: string,
    orgId: string,
    options: {
      type?: CompetitorEventType;
      sellerProductId?: string;
      unacknowledgedOnly?: boolean;
      limit?: number;
      cursor?: string;
    } = {},
  ) {
    await this.organizations.requireMembership(userId, orgId);

    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);

    const where: Prisma.CompetitorEventWhereInput = {
      orgId,
      ...(options.type ? { type: options.type } : {}),
      ...(options.sellerProductId ? { sellerProductId: options.sellerProductId } : {}),
      ...(options.unacknowledgedOnly ? { acknowledgedAt: null } : {}),
    };

    const events = await this.prisma.competitorEvent.findMany({
      where,
      include: {
        platform: { select: { name: true, slug: true } },
        sellerProduct: { select: { id: true, sku: true, name: true } },
        canonicalProduct: { select: { slug: true, title: true } },
      },
      orderBy: { detectedAt: 'desc' },
      take: limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });

    const hasMore = events.length > limit;
    const page = hasMore ? events.slice(0, limit) : events;

    return {
      items: page.map((event) => ({
        id: event.id,
        type: event.type,
        severity: event.severity,
        platform: event.platform,
        sellerProduct: event.sellerProduct,
        canonicalProduct: event.canonicalProduct,
        previousPrice: event.previousPrice != null ? Number(event.previousPrice) : null,
        newPrice: event.newPrice != null ? Number(event.newPrice) : null,
        ourPrice: event.ourPrice != null ? Number(event.ourPrice) : null,
        changePct: event.changePct,
        evidence: event.evidence,
        detectedAt: event.detectedAt.toISOString(),
        acknowledgedAt: event.acknowledgedAt?.toISOString() ?? null,
      })),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    };
  }

  /** Acknowledging is scoped to the org in the same statement. */
  async acknowledge(userId: string, orgId: string, eventId: string) {
    await this.organizations.requireMembership(userId, orgId);

    const result = await this.prisma.competitorEvent.updateMany({
      where: { id: eventId, orgId, acknowledgedAt: null },
      data: { acknowledgedAt: new Date(), acknowledgedBy: userId },
    });

    if (result.count === 0) {
      throw new NotFoundException('Event not found, or already acknowledged');
    }
    return { ok: true };
  }

  async acknowledgeAll(userId: string, orgId: string) {
    await this.organizations.requireMembership(userId, orgId);
    const result = await this.prisma.competitorEvent.updateMany({
      where: { orgId, acknowledgedAt: null },
      data: { acknowledgedAt: new Date(), acknowledgedBy: userId },
    });
    return { count: result.count };
  }

  // ─── Alert rules ────────────────────────────────────────────────────────

  async listRules(userId: string, orgId: string) {
    await this.organizations.requireMembership(userId, orgId);
    const rules = await this.prisma.competitorAlertRule.findMany({
      where: { orgId },
      orderBy: { type: 'asc' },
    });

    return rules.map((rule) => ({
      id: rule.id,
      type: rule.type,
      thresholdPct: rule.thresholdPct,
      sellerProductId: rule.sellerProductId,
      isActive: rule.isActive,
      cooldownHours: rule.cooldownHours,
      lastFiredAt: rule.lastFiredAt?.toISOString() ?? null,
    }));
  }

  async upsertRule(
    userId: string,
    orgId: string,
    input: {
      type: CompetitorEventType;
      thresholdPct?: number;
      sellerProductId?: string | null;
      isActive?: boolean;
      cooldownHours?: number;
    },
  ) {
    await this.organizations.requireMembership(userId, orgId, OrgRole.ADMIN);

    // find-then-write rather than upsert: sellerProductId is nullable, and
    // Prisma's compound-unique `where` type will not accept null for it, so a
    // catalogue-wide rule (the common case) cannot be addressed by upsert.
    const existing = await this.prisma.competitorAlertRule.findFirst({
      where: { orgId, type: input.type, sellerProductId: input.sellerProductId ?? null },
    });

    const rule = existing
      ? await this.prisma.competitorAlertRule.update({
          where: { id: existing.id },
          data: {
            ...(input.thresholdPct != null ? { thresholdPct: input.thresholdPct } : {}),
            ...(input.isActive != null ? { isActive: input.isActive } : {}),
            ...(input.cooldownHours != null ? { cooldownHours: input.cooldownHours } : {}),
          },
        })
      : await this.prisma.competitorAlertRule.create({
          data: {
            orgId,
            type: input.type,
            thresholdPct: input.thresholdPct ?? 5,
            sellerProductId: input.sellerProductId ?? null,
            isActive: input.isActive ?? true,
            cooldownHours: input.cooldownHours ?? 12,
          },
        });

    return { id: rule.id, type: rule.type, isActive: rule.isActive };
  }

  async deleteRule(userId: string, orgId: string, ruleId: string) {
    await this.organizations.requireMembership(userId, orgId, OrgRole.ADMIN);
    const result = await this.prisma.competitorAlertRule.deleteMany({ where: { id: ruleId, orgId } });
    if (result.count === 0) throw new NotFoundException('Rule not found');
  }

  /**
   * The workspace overview: what changed, how much of it is unread, and where
   * the seller stands overall.
   */
  async summary(userId: string, orgId: string) {
    await this.organizations.requireMembership(userId, orgId);

    const since = new Date(Date.now() - 7 * 86_400_000);

    const [totalProducts, mappedProducts, unacknowledged, byType, recentDrops] = await Promise.all([
      this.prisma.sellerProduct.count({ where: { orgId, isActive: true } }),
      this.prisma.sellerProduct.count({
        where: { orgId, isActive: true, canonicalProductId: { not: null } },
      }),
      this.prisma.competitorEvent.count({ where: { orgId, acknowledgedAt: null } }),
      this.prisma.competitorEvent.groupBy({
        by: ['type'],
        where: { orgId, detectedAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.competitorEvent.findMany({
        where: { orgId, type: CompetitorEventType.PRICE_DROP, detectedAt: { gte: since } },
        orderBy: { changePct: 'asc' },
        take: 5,
        include: {
          platform: { select: { name: true } },
          sellerProduct: { select: { id: true, name: true } },
        },
      }),
    ]);

    return {
      products: {
        total: totalProducts,
        // Unmapped products are invisible to competitor monitoring, so this
        // is surfaced rather than buried.
        mapped: mappedProducts,
        unmapped: totalProducts - mappedProducts,
      },
      unacknowledgedEvents: unacknowledged,
      last7Days: Object.fromEntries(byType.map((row) => [row.type, row._count._all])),
      biggestDrops: recentDrops.map((event) => ({
        id: event.id,
        product: event.sellerProduct?.name ?? null,
        platform: event.platform.name,
        previousPrice: event.previousPrice != null ? Number(event.previousPrice) : null,
        newPrice: event.newPrice != null ? Number(event.newPrice) : null,
        changePct: event.changePct,
        detectedAt: event.detectedAt.toISOString(),
      })),
    };
  }
}
