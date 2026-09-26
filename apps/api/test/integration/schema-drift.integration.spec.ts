import { execFileSync } from 'child_process';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

/**
 * Migrations and schema.prisma must describe the same database (B-09).
 *
 * `prisma migrate diff` used to propose dropping six hot indexes that only
 * the raw-SQL migrations knew about, so the next `prisma migrate dev` would
 * have generated a migration deleting the search and price-history indexes.
 * They are declared in the schema now. The one index Prisma cannot express
 * -- HNSW on the Unsupported("vector") column -- is the only allowed line.
 *
 * Requires DATABASE_URL pointing at a migrated local *_test database; the
 * shadow database is created next to it and dropped afterwards.
 */

const API_DIR = path.resolve(__dirname, '../..');
const PRISMA_CLI = require.resolve('prisma/build/index.js', { paths: [API_DIR] });
const SCHEMA = path.join(API_DIR, 'prisma/schema.prisma');
const MIGRATIONS = path.join(API_DIR, 'prisma/migrations');

const ALLOWED_DRIFT = ['DROP INDEX "canonical_products_title_embedding_hnsw_idx";'];

function statements(script: string): string[] {
  return script
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('--'));
}

function migrateDiff(args: string[]): string {
  return execFileSync(process.execPath, [PRISMA_CLI, 'migrate', 'diff', ...args, '--script'], {
    cwd: API_DIR,
    env: process.env,
    encoding: 'utf8',
  });
}

describe('schema drift (integration)', () => {
  const testUrl = new URL(process.env.DATABASE_URL!);
  const shadowName = `${testUrl.pathname.replace(/^\//, '')}_shadow_${process.pid}_test`;
  const shadowUrl = new URL(testUrl.toString());
  shadowUrl.pathname = `/${shadowName}`;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$executeRawUnsafe(`CREATE DATABASE "${shadowName}"`);
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${shadowName}" WITH (FORCE)`);
    await prisma.$disconnect();
  });

  it('migrations applied from an empty database reproduce schema.prisma', () => {
    const script = migrateDiff([
      '--from-migrations',
      MIGRATIONS,
      '--to-schema-datamodel',
      SCHEMA,
      '--shadow-database-url',
      shadowUrl.toString(),
    ]);
    // Prisma leaves extensions out of the migrations side of this diff even
    // though the init migration creates them, so it always "adds" them. The
    // test below compares a real migrated database, extensions included.
    const withoutExtensions = statements(script).filter((line) => !line.startsWith('CREATE EXTENSION'));
    expect(withoutExtensions).toEqual(ALLOWED_DRIFT);
  }, 120_000);

  it('the migrated test database matches schema.prisma', () => {
    const script = migrateDiff(['--from-url', testUrl.toString(), '--to-schema-datamodel', SCHEMA]);
    expect(statements(script)).toEqual(ALLOWED_DRIFT);
  }, 60_000);
});
