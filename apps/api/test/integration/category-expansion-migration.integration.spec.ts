import { readFileSync } from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

/**
 * The category-expansion migration must leave every category that exists when
 * it runs without a price floor (min_price_egp = 0). Otherwise the original
 * categories fall under the global EGP 5,000 floor from the moment the new
 * code starts until someone runs the category seed (review finding I3).
 *
 * Runs the migration SQL inside a throwaway schema, in a transaction that is
 * rolled back, against a categories table in its pre-migration shape.
 */
const MIGRATION = path.resolve(__dirname, '../../prisma/migrations/20260928000000_category_expansion/migration.sql');

class Rollback extends Error {}

describe('category expansion migration (integration)', () => {
  const prisma = new PrismaClient();
  afterAll(() => prisma.$disconnect());

  it('gives existing categories no floor and leaves new ones on the global floor', async () => {
    const schema = `mig_${process.pid}_${Date.now().toString(36)}`;
    const statements = readFileSync(MIGRATION, 'utf8')
      .split(';')
      .map((statement) => statement.replace(/^\s*--.*$/gm, '').trim())
      .filter(Boolean);
    let existing: unknown;
    let fresh: unknown;

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
        await tx.$executeRawUnsafe(`CREATE TABLE "categories" ("id" TEXT PRIMARY KEY, "slug" TEXT NOT NULL)`);
        await tx.$executeRawUnsafe(`INSERT INTO "categories" ("id", "slug") VALUES ('c1', 'smartphones')`);
        for (const statement of statements) await tx.$executeRawUnsafe(statement);
        await tx.$executeRawUnsafe(`INSERT INTO "categories" ("id", "slug") VALUES ('c2', 'refrigerators')`);
        [existing, fresh] = (
          await tx.$queryRawUnsafe<Array<{ floor: number | null }>>(
            `SELECT "min_price_egp"::float AS floor FROM "categories" ORDER BY "id"`,
          )
        ).map((row) => row.floor);
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);

    expect(existing).toBe(0);
    expect(fresh).toBeNull();
  });
});
