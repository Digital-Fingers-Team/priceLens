const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Integration tests write rows -- they register users, among other things --
 * so they must only ever reach a throwaway database. Env files alone do not
 * guarantee that: dotenv never overrides a variable already set in the shell,
 * so running the suite inside the production container (where DATABASE_URL
 * is the real database) would silently use it. This check is the backstop.
 *
 * Returns the reason the environment is unsafe, or null when it is safe.
 */
export function unsafeTestDatabaseReason(env: NodeJS.ProcessEnv): string | null {
  if (env.NODE_ENV === 'production') {
    return 'NODE_ENV is "production"';
  }

  const url = env.DATABASE_URL;
  if (!url) return null; // unit tests without a database are fine

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'DATABASE_URL is not a valid URL';
  }

  const database = parsed.pathname.replace(/^\//, '');
  if (!database.endsWith('_test')) {
    return `database "${database}" does not end in "_test"`;
  }
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    return `database host "${parsed.hostname}" is not local`;
  }
  return null;
}
