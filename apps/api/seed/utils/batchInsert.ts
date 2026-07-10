import { Client } from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import type { SeedConfig } from '../types';

export type CopyValue = string | number | boolean | Date | Record<string, unknown> | null | undefined;

export async function withPgClient<T>(config: SeedConfig, handler: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('SET synchronous_commit = off');
    await client.query(`SET application_name = 'pricelens-seed-${config.profile}'`);
    return await handler(client);
  } finally {
    await client.end();
  }
}

export async function copyRows(
  client: Client,
  targetTable: string,
  columns: string[],
  rows: CopyValue[][],
  conflictTarget?: string,
): Promise<number> {
  if (rows.length === 0) return 0;
  const tempTable = `seed_tmp_${targetTable}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const quotedTarget = quoteIdent(targetTable);
  const quotedTemp = quoteIdent(tempTable);
  const quotedColumns = columns.map(quoteIdent).join(', ');
  const conflictClause = conflictTarget ? `ON CONFLICT ${conflictTarget} DO NOTHING` : 'ON CONFLICT DO NOTHING';

  await client.query(`CREATE TEMP TABLE ${quotedTemp} (LIKE ${quotedTarget} INCLUDING DEFAULTS)`);
  await copyInto(client, tempTable, columns, rows);
  const result = await client.query(
    `INSERT INTO ${quotedTarget} (${quotedColumns}) SELECT ${quotedColumns} FROM ${quotedTemp} ${conflictClause}`,
  );
  await client.query(`DROP TABLE ${quotedTemp}`);
  return result.rowCount ?? 0;
}

async function copyInto(client: Client, table: string, columns: string[], rows: CopyValue[][]): Promise<void> {
  const stream = client.query(copyFrom(
    `COPY ${quoteIdent(table)} (${columns.map(quoteIdent).join(', ')}) FROM STDIN WITH (FORMAT csv, NULL '\\N')`,
  ));
  await new Promise<void>((resolve, reject) => {
    stream.on('error', reject);
    stream.on('finish', resolve);
    for (const row of rows) {
      stream.write(`${row.map(csvValue).join(',')}\n`);
    }
    stream.end();
  });
}

function csvValue(value: CopyValue): string {
  if (value === null || value === undefined) return '\\N';
  if (value instanceof Date) return quoteCsv(value.toISOString());
  if (typeof value === 'object') return quoteCsv(JSON.stringify(value));
  return quoteCsv(String(value));
}

function quoteCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
