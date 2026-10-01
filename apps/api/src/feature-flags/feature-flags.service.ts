import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { FLAG_REGISTRY, FlagKey, envOverride } from './feature-flags.registry';

export type FlagSource = 'database' | 'environment' | 'default';

export interface FlagState {
  key: FlagKey;
  enabled: boolean;
  source: FlagSource;
  description: string;
  defaultOn: boolean;
  updatedAt: string | null;
}

/**
 * How long a process trusts its copy of the flag table. The API and the
 * worker are separate processes, so a toggle reaches both within this window
 * without any pub/sub; the admin page says so.
 */
const CACHE_MS = 30_000;

/**
 * Resolves feature switches: a database row wins, then FEATURE_<KEY> in the
 * environment, then the registry default.
 *
 * Failure is never an outage: if the table cannot be read, the last good copy
 * is used, and with none, the environment and defaults.
 */
@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);
  private rows: Map<string, { enabled: boolean; updatedAt: Date }> | null = null;
  private loadedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async isEnabled(key: FlagKey): Promise<boolean> {
    return this.resolve(key, await this.load()).enabled;
  }

  /** Every flag's effective value, for the web app. */
  async snapshot(): Promise<Record<FlagKey, boolean>> {
    const rows = await this.load();
    return Object.fromEntries(
      (Object.keys(FLAG_REGISTRY) as FlagKey[]).map((key) => [key, this.resolve(key, rows).enabled]),
    ) as Record<FlagKey, boolean>;
  }

  async list(): Promise<FlagState[]> {
    const rows = await this.load(true);
    return (Object.keys(FLAG_REGISTRY) as FlagKey[]).map((key) => this.resolve(key, rows));
  }

  async set(key: FlagKey, enabled: boolean, actorId: string): Promise<FlagState> {
    await this.prisma.featureFlag.upsert({
      where: { key },
      create: { key, enabled, description: FLAG_REGISTRY[key].description, updatedById: actorId },
      update: { enabled, updatedById: actorId },
    });
    this.logger.log(`Admin ${actorId} turned flag "${key}" ${enabled ? 'on' : 'off'}`);
    return this.resolve(key, await this.load(true));
  }

  /** Drops the row, so the environment or the default applies again. */
  async reset(key: FlagKey, actorId: string): Promise<FlagState> {
    await this.prisma.featureFlag.deleteMany({ where: { key } });
    this.logger.log(`Admin ${actorId} reset flag "${key}" to its default`);
    return this.resolve(key, await this.load(true));
  }

  private resolve(key: FlagKey, rows: Map<string, { enabled: boolean; updatedAt: Date }>): FlagState {
    const definition = FLAG_REGISTRY[key];
    const row = rows.get(key);
    const fromEnv = envOverride(key);
    const base = { key, description: definition.description, defaultOn: definition.defaultOn };

    if (row) return { ...base, enabled: row.enabled, source: 'database', updatedAt: row.updatedAt.toISOString() };
    if (fromEnv !== undefined) return { ...base, enabled: fromEnv, source: 'environment', updatedAt: null };
    return { ...base, enabled: definition.defaultOn, source: 'default', updatedAt: null };
  }

  private async load(fresh = false): Promise<Map<string, { enabled: boolean; updatedAt: Date }>> {
    if (!fresh && this.rows && Date.now() - this.loadedAt < CACHE_MS) return this.rows;
    try {
      const rows = await this.prisma.featureFlag.findMany({ select: { key: true, enabled: true, updatedAt: true } });
      this.rows = new Map(rows.map((row) => [row.key, { enabled: row.enabled, updatedAt: row.updatedAt }]));
      this.loadedAt = Date.now();
    } catch (error) {
      this.logger.warn(`Feature flags could not be read, using the last copy: ${(error as Error).message}`);
      this.rows ??= new Map();
    }
    return this.rows;
  }
}
