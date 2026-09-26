// apps/api/src/config/site-origins.ts

function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

/**
 * The public address of the web app, for links we send out (alert e-mails,
 * Stripe return URLs). NEXT_PUBLIC_SITE_URL is what the web build itself uses,
 * so it wins; FRONTEND_URL is a list of CORS origins and only its first entry
 * is a usable fallback.
 */
export function publicSiteUrl(env: NodeJS.ProcessEnv = process.env): string {
  return splitList(env.NEXT_PUBLIC_SITE_URL)[0] ?? splitList(env.FRONTEND_URL)[0] ?? 'http://localhost:3000';
}

/**
 * Browser origins allowed to call the API with CORS.
 *
 * The site's own origin is always included: browsers send `Origin` on every
 * same-origin POST, so leaving it out rejects the site's own logins (S-02).
 * The localhost defaults exist for local development only.
 */
export function allowedCorsOrigins(env: NodeJS.ProcessEnv = process.env): { any: boolean; origins: string[] } {
  const configured = splitList(env.FRONTEND_URL);
  const site = splitList(env.NEXT_PUBLIC_SITE_URL).map((url) => {
    try {
      return new URL(url).origin;
    } catch {
      return url;
    }
  });
  const devDefaults = env.NODE_ENV === 'production' ? [] : ['http://localhost:3000', 'http://127.0.0.1:3000'];
  return {
    any: configured.includes('*'),
    origins: Array.from(new Set([...devDefaults, ...site, ...configured])),
  };
}
