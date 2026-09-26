// apps/api/src/common/redact-url.ts

const SENSITIVE = /^(secret|token|access_token|refresh_token|key|api_key|apikey|code|password|signature|sig)$/i;

/**
 * The URL as it may be written to a log: values of query parameters that
 * carry credentials are replaced. The affiliate postback authenticates with
 * `?secret=` in its URL, which went into every request log line (S-11).
 */
export function redactUrl(url: string): string {
  const q = url.indexOf('?');
  if (q === -1) return url;
  const query = url
    .slice(q + 1)
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      const name = eq === -1 ? pair : pair.slice(0, eq);
      let decoded = name;
      try {
        decoded = decodeURIComponent(name);
      } catch {
        // keep the raw name
      }
      return eq !== -1 && SENSITIVE.test(decoded) ? `${name}=[redacted]` : pair;
    })
    .join('&');
  return `${url.slice(0, q)}?${query}`;
}
