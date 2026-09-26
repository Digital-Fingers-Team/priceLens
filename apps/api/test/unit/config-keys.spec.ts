import * as fs from 'fs';
import * as path from 'path';
import affiliateConfig from '../../src/config/affiliate.config';
import appConfig from '../../src/config/app.config';
import authConfig from '../../src/config/auth.config';
import billingConfig from '../../src/config/billing.config';
import databaseConfig from '../../src/config/database.config';
import notificationsConfig from '../../src/config/notifications.config';
import pricingConfig from '../../src/config/pricing.config';
import redisConfig from '../../src/config/redis.config';
import retailersConfig from '../../src/config/retailers.config';
import searchConfig from '../../src/config/search.config';

/**
 * Every `config.get('<namespace>.<key>')` in src must name a key a config
 * factory defines (B-17). A typo otherwise returns the call's fallback
 * without any error, so the setting silently stops working.
 */

const FACTORIES = [
  affiliateConfig,
  appConfig,
  authConfig,
  billingConfig,
  databaseConfig,
  notificationsConfig,
  pricingConfig,
  redisConfig,
  retailersConfig,
  searchConfig,
];

const SRC = path.resolve(__dirname, '../../src');
const CONFIG_GET = /\.get(?:OrThrow)?\s*(?:<[^>()]*>)?\(\s*'([a-zA-Z]+)\.([A-Za-z0-9_.]+)'/g;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

function hasPath(value: unknown, keys: string[]): boolean {
  let current = value;
  for (const key of keys) {
    if (current === null || typeof current !== 'object' || !(key in current)) return false;
    current = (current as Record<string, unknown>)[key];
  }
  return true;
}

describe('config keys (B-17)', () => {
  const namespaces = new Map<string, unknown>(FACTORIES.map((factory) => [factory.KEY.replace(/^CONFIGURATION\(|\)$/g, ''), factory()]));

  const uses = sourceFiles(SRC).flatMap((file) =>
    [...fs.readFileSync(file, 'utf8').matchAll(CONFIG_GET)].map(([, namespace, key]) => ({
      where: path.relative(SRC, file),
      namespace,
      key,
    })),
  );

  it('finds the config reads it is meant to check', () => {
    expect(uses.length).toBeGreaterThan(100);
  });

  it('every key read in src is defined by its config factory', () => {
    const unknown = uses
      .filter(({ namespace, key }) => !namespaces.has(namespace) || !hasPath(namespaces.get(namespace), key.split('.')))
      .map(({ where, namespace, key }) => `${where}: ${namespace}.${key}`);
    expect([...new Set(unknown)]).toEqual([]);
  });
});
