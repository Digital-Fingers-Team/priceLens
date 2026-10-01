import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { InvitesService, hashInviteToken } from '../../src/seller/invites.service';

const ORG = '11111111-1111-4111-8111-111111111111';

function build(invite: Record<string, unknown> | null = null, userEmail = 'friend@example.com') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    organizationMember: {
      findFirst: jest.fn(async () => null),
      upsert: jest.fn(async () => ({ role: OrgRole.MEMBER })),
    },
    organizationInvite: {
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async () => invite),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'inv-1', ...data })),
      update: jest.fn(),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    user: { findUnique: jest.fn(async () => ({ email: userEmail })) },
    $transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>): Promise<unknown> => work(prisma)),
  };
  const organizations = {
    requireMembership: jest.fn(async () => ({ organization: { name: 'Shop' }, role: OrgRole.OWNER })),
    assertSeatAvailable: jest.fn(async () => undefined),
  };
  const entitlements = { invalidate: jest.fn() };
  const email = { send: jest.fn(async () => ({ ok: false, skipped: true })) };
  const config = { get: jest.fn((_key: string, fallback?: unknown) => fallback) };
  const service = new InvitesService(prisma as never, organizations as never, entitlements as never, email as never, config as never);
  return { service, prisma, organizations, email };
}

const openInvite = (overrides: Record<string, unknown> = {}) => ({
  id: 'inv-1',
  orgId: ORG,
  email: 'friend@example.com',
  role: OrgRole.MEMBER,
  expiresAt: new Date(Date.now() + 60_000),
  acceptedAt: null,
  revokedAt: null,
  organization: { name: 'Shop' },
  ...overrides,
});

describe('InvitesService', () => {
  it('stores only the hash of the token and returns the link even without SMTP', async () => {
    const { service, prisma, organizations } = build();
    const result = await service.create(ORG, 'owner-1', ' Friend@Example.com ', OrgRole.MEMBER);

    const token = result.link.split('/invite/')[1];
    const stored = (prisma.organizationInvite.create.mock.calls[0] as unknown[])[0] as { data: { tokenHash: string; email: string } };
    expect(stored.data.tokenHash).toBe(hashInviteToken(token));
    expect(stored.data.tokenHash).not.toContain(token);
    expect(stored.data.email).toBe('friend@example.com');
    expect(result.emailed).toBe(false);
    expect(organizations.assertSeatAvailable).toHaveBeenCalled();
  });

  it('refuses an owner invitation', async () => {
    const { service } = build();
    await expect(service.create(ORG, 'owner-1', 'a@b.co', OrgRole.OWNER)).rejects.toThrow('exactly one owner');
  });

  it('refuses to invite someone already in the workspace', async () => {
    const { service, prisma } = build();
    prisma.organizationMember.findFirst.mockResolvedValueOnce({ id: 'm1' } as never);
    await expect(service.create(ORG, 'owner-1', 'a@b.co', OrgRole.MEMBER)).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets only the invited email accept', async () => {
    const { service } = build(openInvite(), 'someone-else@example.com');
    await expect(service.accept('token', 'user-2')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('joins the workspace once and refuses a second use', async () => {
    const { service, prisma } = build(openInvite());
    await expect(service.accept('token', 'user-2')).resolves.toEqual({ orgId: ORG, role: OrgRole.MEMBER });

    prisma.organizationInvite.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.accept('token', 'user-2')).rejects.toBeInstanceOf(ConflictException);
  });

  it('treats expired, revoked and unknown tokens alike', async () => {
    await expect(build(openInvite({ expiresAt: new Date(Date.now() - 1) })).service.preview('t')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(build(openInvite({ revokedAt: new Date() })).service.preview('t')).rejects.toBeInstanceOf(NotFoundException);
    await expect(build(null).service.preview('t')).rejects.toBeInstanceOf(NotFoundException);
  });
});
