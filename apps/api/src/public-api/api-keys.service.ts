import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ApiKey, OrgRole } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { UpgradeRequiredException } from '../billing/billing.errors';
import { FEATURES } from '../billing/plan-limits';
import { OrganizationsService } from '../seller/organizations.service';

/** Distinguishes environments at a glance in a customer's config. */
const KEY_PREFIX = 'pl_live_';

export interface IssuedApiKey {
  id: string;
  name: string;
  /** Returned exactly once. We cannot show it again — only a hash is stored. */
  key: string;
  keyPrefix: string;
  scopes: string[];
  createdAt: string;
}

export interface ResolvedApiKey {
  apiKey: ApiKey;
  orgId: string;
  /** The owner's plan decides the quota, not the caller's. */
  dailyLimit: number;
  scopes: string[];
}

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** SHA-256, not bcrypt — see the note on ApiKey.keyHash. */
  private hash(key: string): string {
    return createHash('sha256').update(key, 'utf8').digest('hex');
  }

  async issue(
    userId: string,
    orgId: string,
    input: { name: string; scopes?: string[]; expiresInDays?: number },
  ): Promise<IssuedApiKey> {
    await this.organizations.requireMembership(userId, orgId, OrgRole.ADMIN);

    const owner = await this.prisma.organizationMember.findFirst({
      where: { orgId, role: OrgRole.OWNER },
      select: { userId: true },
    });
    const { limits } = await this.entitlements.getEntitlements(owner?.userId ?? userId);

    if (!limits.features.includes(FEATURES.API_ACCESS) || limits.apiCallsPerDay <= 0) {
      throw new UpgradeRequiredException('API access is part of the Enterprise plan.');
    }

    // 256 bits of CSPRNG output. Long enough that the fast hash is safe.
    const secret = randomBytes(32).toString('base64url');
    const key = `${KEY_PREFIX}${secret}`;
    // The prefix has to identify one key, so it includes part of the secret.
    const keyPrefix = `${KEY_PREFIX}${secret.slice(0, 6)}`;

    const created = await this.prisma.apiKey.create({
      data: {
        orgId,
        name: input.name.trim(),
        keyPrefix,
        keyHash: this.hash(key),
        scopes: input.scopes?.length ? input.scopes : ['market:read', 'events:read'],
        createdBy: userId,
        expiresAt: input.expiresInDays
          ? new Date(Date.now() + input.expiresInDays * 86_400_000)
          : null,
      },
    });

    this.logger.log(`API key ${keyPrefix} issued for org ${orgId} by ${userId}`);

    return {
      id: created.id,
      name: created.name,
      key,
      keyPrefix,
      scopes: created.scopes,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async list(userId: string, orgId: string) {
    await this.organizations.requireMembership(userId, orgId);

    const keys = await this.prisma.apiKey.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
    });

    return keys.map((key) => ({
      id: key.id,
      name: key.name,
      // Never the secret, and never the hash.
      keyPrefix: key.keyPrefix,
      scopes: key.scopes,
      isActive: key.isActive && !key.revokedAt,
      lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
      expiresAt: key.expiresAt?.toISOString() ?? null,
      revokedAt: key.revokedAt?.toISOString() ?? null,
      createdAt: key.createdAt.toISOString(),
    }));
  }

  /** Revocation is immediate and permanent; keys are never un-revoked. */
  async revoke(userId: string, orgId: string, keyId: string) {
    await this.organizations.requireMembership(userId, orgId, OrgRole.ADMIN);

    const result = await this.prisma.apiKey.updateMany({
      where: { id: keyId, orgId, revokedAt: null },
      data: { isActive: false, revokedAt: new Date() },
    });

    if (result.count === 0) throw new NotFoundException('Key not found, or already revoked');
    this.logger.log(`API key ${keyId} revoked by ${userId}`);
    return { ok: true };
  }

  /**
   * Resolves a presented key.
   *
   * Returns null for every failure mode — unknown, revoked, expired, or a
   * plan that no longer includes API access — so the caller cannot tell them
   * apart and use the endpoint as an oracle for which keys exist.
   */
  async resolve(presentedKey: string): Promise<ResolvedApiKey | null> {
    if (!presentedKey || !presentedKey.startsWith(KEY_PREFIX)) return null;

    const hash = this.hash(presentedKey);

    // Looked up BY hash, so the query itself is the constant-time part; the
    // comparison below guards against a partial-match lookup ever being
    // introduced here.
    const apiKey = await this.prisma.apiKey.findUnique({ where: { keyHash: hash } });
    if (!apiKey) return null;

    const expected = Buffer.from(apiKey.keyHash, 'utf8');
    const actual = Buffer.from(hash, 'utf8');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

    if (!apiKey.isActive || apiKey.revokedAt) return null;
    if (apiKey.expiresAt && apiKey.expiresAt.getTime() < Date.now()) return null;

    const owner = await this.prisma.organizationMember.findFirst({
      where: { orgId: apiKey.orgId, role: OrgRole.OWNER },
      select: { userId: true },
    });
    if (!owner) return null;

    const { limits } = await this.entitlements.getEntitlements(owner.userId);
    // A downgrade revokes API access without anyone having to delete keys.
    if (!limits.features.includes(FEATURES.API_ACCESS) || limits.apiCallsPerDay <= 0) return null;

    return {
      apiKey,
      orgId: apiKey.orgId,
      dailyLimit: limits.apiCallsPerDay,
      scopes: apiKey.scopes,
    };
  }

  /**
   * Counts a call and reports whether the caller is over quota.
   *
   * The counter is incremented before the handler runs, so a burst of
   * concurrent requests cannot all observe the pre-call total and slip past
   * the limit together.
   */
  async recordCall(
    apiKeyId: string,
    orgId: string,
    endpoint: string,
    dailyLimit: number,
  ): Promise<{ allowed: boolean; used: number; limit: number }> {
    const day = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');

    await this.prisma.apiUsage.upsert({
      where: { apiKeyId_day_endpoint: { apiKeyId, day, endpoint } },
      create: { apiKeyId, orgId, day, endpoint, count: 1 },
      update: { count: { increment: 1 } },
    });

    const totals = await this.prisma.apiUsage.aggregate({
      where: { orgId, day },
      _sum: { count: true },
    });

    const used = totals._sum.count ?? 0;

    // lastUsedAt is best-effort; failing to stamp it must not fail the call.
    this.prisma.apiKey
      .update({ where: { id: apiKeyId }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return { allowed: used <= dailyLimit, used, limit: dailyLimit };
  }

  async recordError(apiKeyId: string, endpoint: string) {
    const day = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
    await this.prisma.apiUsage
      .updateMany({ where: { apiKeyId, day, endpoint }, data: { errorCount: { increment: 1 } } })
      .catch(() => undefined);
  }

  /** Usage report for the workspace's own dashboard. */
  async usage(userId: string, orgId: string, days = 30) {
    await this.organizations.requireMembership(userId, orgId);

    const since = new Date(Date.now() - Math.min(Math.max(days, 1), 365) * 86_400_000);

    const rows = await this.prisma.apiUsage.groupBy({
      by: ['day'],
      where: { orgId, day: { gte: since } },
      _sum: { count: true, errorCount: true },
      orderBy: { day: 'asc' },
    });

    const byEndpoint = await this.prisma.apiUsage.groupBy({
      by: ['endpoint'],
      where: { orgId, day: { gte: since } },
      _sum: { count: true },
      orderBy: { _sum: { count: 'desc' } },
      take: 20,
    });

    return {
      daily: rows.map((row) => ({
        day: row.day.toISOString().slice(0, 10),
        calls: row._sum.count ?? 0,
        errors: row._sum.errorCount ?? 0,
      })),
      byEndpoint: byEndpoint.map((row) => ({
        endpoint: row.endpoint,
        calls: row._sum.count ?? 0,
      })),
    };
  }
}
