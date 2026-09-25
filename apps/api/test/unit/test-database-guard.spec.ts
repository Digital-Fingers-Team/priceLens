import { unsafeTestDatabaseReason } from '../setup/test-database-guard';

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;
const TEST_DB = 'postgresql://pricelens:pw@127.0.0.1:5432/pricelens_test';

describe('test database guard', () => {
  it('accepts a local *_test database', () => {
    expect(unsafeTestDatabaseReason(env({ NODE_ENV: 'test', DATABASE_URL: TEST_DB }))).toBeNull();
  });

  it('accepts no database at all', () => {
    expect(unsafeTestDatabaseReason(env({ NODE_ENV: 'test' }))).toBeNull();
  });

  it('rejects NODE_ENV=production', () => {
    expect(unsafeTestDatabaseReason(env({ NODE_ENV: 'production', DATABASE_URL: TEST_DB }))).toMatch(
      /production/,
    );
  });

  it('rejects the production database name', () => {
    expect(
      unsafeTestDatabaseReason(
        env({ DATABASE_URL: 'postgresql://u:p@localhost:5432/pricelens?schema=public' }),
      ),
    ).toMatch(/does not end in "_test"/);
  });

  it('rejects a remote host even with a *_test name', () => {
    expect(
      unsafeTestDatabaseReason(env({ DATABASE_URL: 'postgresql://u:p@postgres:5432/pricelens_test' })),
    ).toMatch(/not local/);
  });

  it('rejects an unparseable URL', () => {
    expect(unsafeTestDatabaseReason(env({ DATABASE_URL: 'not a url' }))).toMatch(/not a valid URL/);
  });
});
