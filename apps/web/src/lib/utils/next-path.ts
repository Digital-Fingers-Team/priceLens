/**
 * Where to go after signing in (audit 06, U-11): the \`next\` query parameter,
 * but only a same-origin path. \`//evil.example\` and \`/\\evil.example\` are
 * protocol-relative URLs to another site, so they are refused (open redirect).
 */
export function safeNextPath(raw: string | null | undefined, fallback = '/'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  if (raw.startsWith('/login') || raw.startsWith('/register')) return fallback;
  return raw;
}

/** `/login?next=<path>` for a sign-in prompt on the given page. */
export function loginHref(returnTo: string): string {
  return `/login?next=${encodeURIComponent(returnTo)}`;
}

/** The post-sign-in target of the current page's URL (client only). */
export function nextFromLocation(): string {
  if (typeof window === 'undefined') return '/';
  return safeNextPath(new URLSearchParams(window.location.search).get('next'));
}
