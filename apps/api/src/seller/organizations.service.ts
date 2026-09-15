import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrgRole, OrgType, Organization, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { UpgradeRequiredException } from '../billing/billing.errors';
import { FEATURES } from '../billing/plan-limits';

/** Ranked so a check can ask for "at least ADMIN" rather than enumerating. */
const ROLE_RANK: Record<OrgRole, number> = {
  [OrgRole.MEMBER]: 0,
  [OrgRole.ADMIN]: 1,
  [OrgRole.OWNER]: 2,
};

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /**
   * The workspaces a user belongs to.
   *
   * Everything in the seller and brand product is scoped through this: no
   * endpoint accepts an orgId without checking membership first.
   */
  async listForUser(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      include: {
        organization: {
          include: {
            platform: { select: { id: true, name: true, slug: true } },
            _count: { select: { products: true, members: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((membership) => ({
      id: membership.organization.id,
      slug: membership.organization.slug,
      name: membership.organization.name,
      type: membership.organization.type,
      role: membership.role,
      platform: membership.organization.platform,
      productCount: membership.organization._count.products,
      memberCount: membership.organization._count.members,
      createdAt: membership.organization.createdAt.toISOString(),
    }));
  }

  /**
   * Resolves an org for a user, enforcing membership and a minimum role.
   *
   * Every seller/brand endpoint funnels through here. Returning 404 rather
   * than 403 for a non-member is deliberate: it does not confirm that an org
   * with that id exists.
   */
  async requireMembership(
    userId: string,
    orgId: string,
    minimumRole: OrgRole = OrgRole.MEMBER,
  ): Promise<{ organization: Organization; role: OrgRole }> {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { orgId_userId: { orgId, userId } },
      include: { organization: true },
    });

    if (!membership) throw new NotFoundException('Workspace not found');

    if (ROLE_RANK[membership.role] < ROLE_RANK[minimumRole]) {
      throw new ForbiddenException(`This action requires the ${minimumRole.toLowerCase()} role`);
    }

    return { organization: membership.organization, role: membership.role };
  }

  /**
   * Creates a workspace. Gated on the plan feature rather than a role, since
   * this is the moment a consumer account becomes a B2B one.
   */
  async create(userId: string, input: { name: string; type: OrgType; platformId?: string | null }) {
    const feature = input.type === OrgType.BRAND ? FEATURES.MAP_MONITORING : FEATURES.SELLER_WORKSPACE;
    const { limits } = await this.entitlements.getEntitlements(userId);

    if (!limits.features.includes(feature)) {
      throw new UpgradeRequiredException(
        input.type === OrgType.BRAND
          ? 'Brand workspaces are part of the Enterprise plan.'
          : 'Seller workspaces are part of the Seller plan.',
      );
    }

    // One workspace per owner for now: seats are the growth lever, not
    // unlimited free workspaces, and multi-org billing is not modelled yet.
    const existing = await this.prisma.organizationMember.count({
      where: { userId, role: OrgRole.OWNER },
    });
    if (existing >= 1) {
      throw new BadRequestException(
        'You already own a workspace. Invite teammates to it rather than creating another.',
      );
    }

    const slug = await this.uniqueSlug(input.name);

    const organization = await this.prisma.organization.create({
      data: {
        name: input.name.trim(),
        slug,
        type: input.type,
        platformId: input.platformId ?? null,
        members: { create: { userId, role: OrgRole.OWNER } },
      },
    });

    this.logger.log(`User ${userId} created ${input.type} workspace ${organization.id} (${slug})`);
    return organization;
  }

  async listMembers(orgId: string) {
    const members = await this.prisma.organizationMember.findMany({
      where: { orgId },
      include: { user: { select: { id: true, email: true, username: true, displayName: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return members.map((member) => ({
      id: member.id,
      role: member.role,
      joinedAt: member.createdAt.toISOString(),
      user: member.user,
    }));
  }

  /**
   * Adds a teammate by email.
   *
   * Seat count comes from the owner's plan, not the inviter's -- otherwise a
   * MEMBER on a free personal plan could not be counted against the
   * workspace's allowance, and seats would be unenforceable.
   */
  async addMember(orgId: string, actorId: string, email: string, role: OrgRole) {
    await this.requireMembership(actorId, orgId, OrgRole.ADMIN);

    if (role === OrgRole.OWNER) {
      throw new BadRequestException('A workspace has exactly one owner; transfer ownership instead');
    }

    const owner = await this.prisma.organizationMember.findFirst({
      where: { orgId, role: OrgRole.OWNER },
      select: { userId: true },
    });
    const { limits } = await this.entitlements.getEntitlements(owner?.userId ?? actorId);

    const seatsUsed = await this.prisma.organizationMember.count({ where: { orgId } });
    if (seatsUsed >= limits.seats) {
      throw new UpgradeRequiredException(
        `Your plan includes ${limits.seats} seat(s) and all are in use.`,
        { limit: limits.seats, current: seatsUsed },
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true },
    });
    if (!user) {
      // Deliberately explicit: an invite flow for non-users is not built yet,
      // and silently doing nothing would be worse than saying so.
      throw new BadRequestException(
        'That person does not have a PriceLens account yet. Ask them to sign up first.',
      );
    }

    const member = await this.prisma.organizationMember.upsert({
      where: { orgId_userId: { orgId, userId: user.id } },
      create: { orgId, userId: user.id, role },
      update: { role },
    });

    await this.entitlements.invalidate(user.id);
    return { id: member.id, role: member.role };
  }

  async removeMember(orgId: string, actorId: string, memberId: string) {
    await this.requireMembership(actorId, orgId, OrgRole.ADMIN);

    const member = await this.prisma.organizationMember.findFirst({ where: { id: memberId, orgId } });
    if (!member) throw new NotFoundException('Member not found');
    if (member.role === OrgRole.OWNER) {
      throw new BadRequestException('The owner cannot be removed from their own workspace');
    }

    await this.prisma.organizationMember.delete({ where: { id: member.id } });
    await this.entitlements.invalidate(member.userId);
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'workspace';

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const taken = await this.prisma.organization.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
    }

    return `${base}-${Date.now().toString(36)}`;
  }
}
