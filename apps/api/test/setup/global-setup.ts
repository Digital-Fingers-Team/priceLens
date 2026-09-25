import { unsafeTestDatabaseReason } from './test-database-guard';

export default function globalSetup(): void {
  const reason = unsafeTestDatabaseReason(process.env);
  if (reason) {
    throw new Error(
      `Refusing to run tests: ${reason}. Tests only run against a local database ` +
        'whose name ends in "_test" (see /.env.test).',
    );
  }
}
