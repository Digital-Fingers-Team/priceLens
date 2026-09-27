/**
 * Prints the exact SQL that SearchService runs for a fixed set of searches,
 * wrapped in EXPLAIN ANALYZE, for psql (audit 08). No database is needed to
 * generate it; run the output inside a read-only transaction:
 *
 *   npx ts-node scripts/bench/search-sql.ts > /tmp/search-bench.sql
 *   psql ... -f /tmp/search-bench.sql
 *
 * OFFER_MAX_AGE_DAYS sets the offer window, as in the running API.
 */
import { Prisma } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../src/database/prisma.service';
import type { ProductsService } from '../../src/products/products.service';
import { SearchService } from '../../src/search/search.service';
import type { SearchQueryDto } from '../../src/search/dto/search.dto';
import type { IngestionQueue } from '../../src/workers/ingestion-queue.service';

const SEARCHES: Array<[string, Partial<SearchQueryDto>]> = [
  ['search "galaxy"', { q: 'galaxy' }],
  ['search "iphone 15 pro"', { q: 'iphone 15 pro' }],
  ['search "سامسونج" (Arabic)', { q: 'سامسونج' }],
  ['search "laptop" (category word)', { q: 'laptop' }],
  ['browse, no query', {}],
  ['search "galaxy", cheapest first', { q: 'galaxy', sortBy: 'minPriceUsd', sortDir: 'asc' }],
  ['search "galaxy", page 5', { q: 'galaxy', page: 5 }],
];
const SUGGESTIONS = ['gal', 'iphone 1', 'سامس'];

function literal(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return `'${value.toISOString()}'::timestamptz`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Prisma's `$1`-style text with every parameter inlined as a literal. */
function inline(sql: Prisma.Sql): string {
  return sql.text.replace(/\$(\d+)/g, (_, index: string) => literal(sql.values[Number(index) - 1]));
}

async function main() {
  const captured: Prisma.Sql[] = [];
  const prisma = {
    $queryRaw: async (sql: Prisma.Sql) => {
      captured.push(sql);
      return [];
    },
  };
  const maxAgeDays = Number(process.env.OFFER_MAX_AGE_DAYS ?? 14);
  const config = { get: () => maxAgeDays };
  const products = { searchHits: async () => [] };
  const search = new SearchService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
    {} as IngestionQueue,
    products as unknown as ProductsService,
  );

  const out: string[] = ['\\timing on', 'SET jit = off;'];
  const explain = (label: string, sql: Prisma.Sql) => {
    out.push(`\\echo === ${label}`, `EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, SUMMARY ON) ${inline(sql)};`);
  };

  for (const [label, query] of SEARCHES) {
    captured.length = 0;
    await search.search(query as SearchQueryDto, { liveFetch: false });
    // One query per page since audit 08 (window count); a separate count
    // only for a page past the end. Before that change there were always two.
    captured.forEach((sql, index) => explain(`${label}: ${index === 0 ? 'page' : 'count'}`, sql));
  }
  for (const q of SUGGESTIONS) {
    captured.length = 0;
    await search.suggest({ q, limit: 6 });
    explain(`suggest "${q}"`, captured[0]);
  }
  process.stdout.write(`${out.join('\n')}\n`);
}

void main();
