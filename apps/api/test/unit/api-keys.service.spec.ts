import { createHash } from 'node:crypto';
import { OrgRole } from '@prisma/client';
import { ApiKeysService } from '../../src/public-api/api-keys.service';
import { FEATURES } from '../../src/billing/plan-limits';
import { UpgradeRequiredException } from '../../src/billing/billing.errors';

function build(options: { features?: string[]; apiCallsPerDay?: number } = {}) {
  const stored: Record<string, unknown>[] = [];

  const prisma = {
    apiKey: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        // Prisma applies column defaults on insert; the mock has to as well,
        // or resolve() sees isActive === undefined and rejects a key the real
        // database would have accepted.
        const row = {
          id: `key-${stored.length + 1}`,
          createdAt: new Date(),
          isActive: true,
          revokedAt: null,
          expiresAt: null,
          lastUsedAt: null,
          ...data,
        };
        stored.push(row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: { where: { keyHash: string } }) =>
        stored.find((row) => row.keyHash === where.keyHash) ?? null,
      ),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue(stored),
    },
    organizationMember: {
      findFirst: jest.fn().mockResolvedValue({ userId: 'owner-1' }),
    },
    apiUsage: {
      upsert: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue({ _sum: { count: 1 } }),
      updateMany: jest.fn().mockResolvedValue({}),
    },
  };

  const organizations = { requireMembership: jest.fn().mockResolvedValue({ role: OrgRole.OWNER }) };
  const entitlements = {
    getEntitlements: jest.fn().mockResolvedValue({
      limits: {
        features: options.features ?? [FEATURES.API_ACCESS],
        apiCallsPerDay: options.apiCallsPerDay ?? 1000,
      },
    }),
  };

  return {
    service: new ApiKeysService(prisma as never, organizations as never, entitlements as never),
    prisma,
    stored,
  };
}

describe('ApiKeysService', () => {
  it('returns the plaintext key exactly once and stores only a hash', async () => {
    const { service, stored } = build();
    const issued = await service.issue('user-1', 'org-1', { name: 'CI' });

    expect(issued.key).toMatch(/^pl_live_/);
    // The secret must never be recoverable from what we persisted.
    expect(stored[0].keyHash).not.toBe(issued.key);
    expect(stored[0].keyHash).toBe(createHash('sha256').update(issued.key, 'utf8').digest('hex'));
    expect(JSON.stringify(stored[0])).not.toContain(issued.key.slice(8));
  });

  it('issues a distinct key every time', async () => {
    const { service } = build();
    const first = await service.issue('user-1', 'org-1', { name: 'a' });
    const second = await service.issue('user-1', 'org-1', { name: 'b' });
    expect(first.key).not.toBe(second.key);
  });

  it('refuses to issue a key without the API feature', async () => {
    const { service } = build({ features: [] });
    await expect(service.issue('user-1', 'org-1', { name: 'CI' })).rejects.toBeInstanceOf(
      UpgradeRequiredException,
    );
  });

  it('refuses to issue when the plan allows zero calls', async () => {
    const { service } = build({ apiCallsPerDay: 0 });
    await expect(service.issue('user-1', 'org-1', { name: 'CI' })).rejects.toBeInstanceOf(
      UpgradeRequiredException,
    );
  });

  it('resolves a valid key', async () => {
    const { service } = build();
    const issued = await service.issue('user-1', 'org-1', { name: 'CI' });
    const resolved = await service.resolve(issued.key);

    expect(resolved).not.toBeNull();
    expect(resolved!.orgId).toBe('org-1');
    expect(resolved!.dailyLimit).toBe(1000);
  });

  it.each([
    ['an unknown key', 'pl_live_totally-made-up'],
    ['a key without the prefix', 'not-a-pricelens-key'],
    ['an empty string', ''],
  ])('rejects %s', async (_label, key) => {
    const { service } = build();
    await expect(service.resolve(key)).resolves.toBeNull();
  });

  it('rejects a revoked key', async () => {
    const { service, stored } = build();
    const issued = await service.issue('user-1', 'org-1', { name: 'CI' });
    stored[0].revokedAt = new Date();
    stored[0].isActive = false;

    await expect(service.resolve(issued.key)).resolves.toBeNull();
  });

  it('rejects an expired key', async () => {
    const { service, stored } = build();
    const issued = await service.issue('user-1', 'org-1', { name: 'CI' });
    stored[0].expiresAt = new Date(Date.now() - 1000);

    await expect(service.resolve(issued.key)).resolves.toBeNull();
  });

  it('rejects a key whose plan no longer includes API access', async () => {
    // A downgrade must revoke access without anyone deleting keys by hand.
    const { service, stored } = build();
    const issued = await service.issue('user-1', 'org-1', { name: 'CI' });
    stored[0].isActive = true;

    const downgraded = build({ features: [] });
    // Re-point the second service at the same stored rows.
    downgraded.prisma.apiKey.findUnique = jest.fn(async ({ where }: { where: { keyHash: string } }) =>
      stored.find((row) => row.keyHash === where.keyHash) ?? null,
    ) as never;

    await expect(downgraded.service.resolve(issued.key)).resolves.toBeNull();
  });

  it('counts the call before deciding, so a burst cannot slip past the quota', async () => {
    const { service, prisma } = build();
    await service.recordCall('key-1', 'org-1', 'GET /market', 1000);

    // The increment happens first; the total is read afterwards.
    expect(prisma.apiUsage.upsert).toHaveBeenCalled();
    const upsertOrder = prisma.apiUsage.upsert.mock.invocationCallOrder[0];
    const aggregateOrder = prisma.apiUsage.aggregate.mock.invocationCallOrder[0];
    expect(upsertOrder).toBeLessThan(aggregateOrder);
  });

  it('reports over-quota once the daily limit is passed', async () => {
    const { service, prisma } = build();
    prisma.apiUsage.aggregate = jest.fn().mockResolvedValue({ _sum: { count: 1001 } }) as never;

    const result = await service.recordCall('key-1', 'org-1', 'GET /market', 1000);
    expect(result.allowed).toBe(false);
    expect(result.used).toBe(1001);
  });

  it('allows the call that exactly reaches the limit', async () => {
    const { service, prisma } = build();
    prisma.apiUsage.aggregate = jest.fn().mockResolvedValue({ _sum: { count: 1000 } }) as never;

    const result = await service.recordCall('key-1', 'org-1', 'GET /market', 1000);
    expect(result.allowed).toBe(true);
  });

  it('never exposes a secret or a hash when listing keys', async () => {
    const { service } = build();
    const issued = await service.issue('user-1', 'org-1', { name: 'CI' });
    const listed = await service.list('user-1', 'org-1');

    const serialised = JSON.stringify(listed);
    expect(serialised).not.toContain(issued.key);
    expect(serialised).not.toContain('keyHash');
    expect(listed[0].keyPrefix).toBe(issued.keyPrefix);
  });
});
