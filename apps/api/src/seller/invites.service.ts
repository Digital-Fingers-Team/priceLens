import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrgRole } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { EmailChannel } from '../notifications/channels/email.channel';
import { OrganizationsService } from './organizations.service';

const INVITE_TTL_DAYS = 7;

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Invitations to a workspace by email link, for people with or without an
 * account. Only the token's hash is stored. Accepting needs a signed-in user
 * whose email matches the invitation, so a forwarded link is useless to
 * anyone else.
 */
@Injectable()
export class InvitesService {
  private readonly logger = new Logger(InvitesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly entitlements: EntitlementsService,
    private readonly email: EmailChannel,
    private readonly config: ConfigService,
  ) {}

  /**
   * Returns the link as well as emailing it: with no SMTP configured the
   * inviter copies it from the page, so the feature works either way.
   */
  async create(orgId: string, actorId: string, rawEmail: string, role: OrgRole) {
    const { organization } = await this.organizations.requireMembership(actorId, orgId, OrgRole.ADMIN);
    if (role === OrgRole.OWNER) {
      throw new BadRequestException('A workspace has exactly one owner; transfer ownership instead');
    }

    const email = rawEmail.toLowerCase().trim();
    const alreadyMember = await this.prisma.organizationMember.findFirst({
      where: { orgId, user: { email } },
      select: { id: true },
    });
    if (alreadyMember) throw new ConflictException('That person is already in this workspace');

    // Re-inviting replaces the open invitation instead of holding two seats.
    const open = await this.prisma.organizationInvite.findFirst({
      where: { orgId, email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    await this.organizations.assertSeatAvailable(orgId, actorId, { ignoreInviteId: open?.id });
    if (open) await this.prisma.organizationInvite.update({ where: { id: open.id }, data: { revokedAt: new Date() } });

    const token = randomBytes(32).toString('base64url');
    const invite = await this.prisma.organizationInvite.create({
      data: {
        orgId,
        email,
        role,
        tokenHash: hashInviteToken(token),
        invitedById: actorId,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    const frontend = this.config.get<string>('app.frontendUrl', 'http://localhost:3000').replace(/\/$/, '');
    const link = `${frontend}/invite/${token}`;
    const sent = await this.email.send(email, {
      title: `دعوة للانضمام إلى ${organization.name} على PriceLens`,
      body: `تمت دعوتك للانضمام إلى مساحة العمل "${organization.name}". افتح الرابط خلال ${INVITE_TTL_DAYS} أيام لقبول الدعوة.\n\nYou have been invited to join "${organization.name}" on PriceLens. Open the link within ${INVITE_TTL_DAYS} days to accept.`,
      url: link,
    });

    this.logger.log(`User ${actorId} invited ${email} to workspace ${orgId} as ${role}`);
    return {
      id: invite.id,
      email,
      role,
      expiresAt: invite.expiresAt.toISOString(),
      link,
      emailed: sent.ok,
    };
  }

  async list(orgId: string, actorId: string) {
    await this.organizations.requireMembership(actorId, orgId, OrgRole.ADMIN);
    const invites = await this.prisma.organizationInvite.findMany({
      where: { orgId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
    }));
  }

  async revoke(orgId: string, actorId: string, inviteId: string): Promise<void> {
    await this.organizations.requireMembership(actorId, orgId, OrgRole.ADMIN);
    const result = await this.prisma.organizationInvite.updateMany({
      where: { id: inviteId, orgId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('Invitation not found');
  }

  /** What the invite page shows before the person signs in. Reveals only the workspace name. */
  async preview(token: string) {
    const invite = await this.findOpen(token);
    return {
      workspace: invite.organization.name,
      role: invite.role,
      email: invite.email,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  async accept(token: string, userId: string) {
    const invite = await this.findOpen(token);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user || user.email.toLowerCase() !== invite.email) {
      throw new ForbiddenException(`This invitation is for ${invite.email}. Sign in with that account to accept it.`);
    }

    // Claim the invitation, then join, in one transaction: two clicks cannot
    // join twice, and a failed join leaves the invitation usable.
    const membership = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.organizationInvite.updateMany({
        where: { id: invite.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date(), acceptedBy: userId },
      });
      if (claimed.count === 0) throw new ConflictException('This invitation has already been used');

      return tx.organizationMember.upsert({
        where: { orgId_userId: { orgId: invite.orgId, userId } },
        create: { orgId: invite.orgId, userId, role: invite.role },
        // Already a member (added by hand meanwhile): keep the higher role.
        update: {},
      });
    });

    await this.entitlements.invalidate(userId);
    this.logger.log(`User ${userId} joined workspace ${invite.orgId} by invitation`);
    return { orgId: invite.orgId, role: membership.role };
  }

  private async findOpen(token: string) {
    if (!token || token.length > 128) throw new NotFoundException('Invitation not found');
    const invite = await this.prisma.organizationInvite.findUnique({
      where: { tokenHash: hashInviteToken(token) },
      include: { organization: { select: { name: true } } },
    });
    if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt <= new Date()) {
      throw new NotFoundException('This invitation is no longer valid. Ask for a new one.');
    }
    return invite;
  }
}
