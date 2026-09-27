import { randomBytes, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';

/**
 * Website sessions in httpOnly cookies (D-17, audit 04/05).
 *
 * The web app asks for cookie mode with `X-Auth-Mode: cookie` on login,
 * register and refresh. The API then sets the tokens as httpOnly cookies and
 * leaves them out of the response body, so script on the page -- including an
 * injected one -- can never read them. Clients that send `Authorization:
 * Bearer` (the partner API, scripts, the test suites) are unaffected.
 *
 *   pl_at    access token   httpOnly  SameSite=Lax     Path=/api
 *   pl_rt    refresh token  httpOnly  SameSite=Strict  Path=/api/v1/auth
 *   pl_csrf  CSRF token     readable  SameSite=Lax     Path=/
 *
 * CSRF: a write authenticated by cookie must carry `X-CSRF-Token` equal to
 * the pl_csrf cookie (double submit; see CsrfGuard). A cross-site page can
 * make the browser send the cookies, but cannot read pl_csrf to copy it into
 * the header. SameSite already stops most cross-site sends; this covers the
 * rest (same-site subdomains, old browsers).
 */
export const ACCESS_COOKIE = 'pl_at';
export const REFRESH_COOKIE = 'pl_rt';
export const CSRF_COOKIE = 'pl_csrf';
export const CSRF_HEADER = 'x-csrf-token';
export const AUTH_MODE_HEADER = 'x-auth-mode';

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    const name = part.slice(0, eq).trim();
    if (!(name in cookies)) {
      try {
        cookies[name] = decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        cookies[name] = part.slice(eq + 1).trim();
      }
    }
  }
  return cookies;
}

export function requestCookies(req: Pick<Request, 'headers'>): Record<string, string> {
  return parseCookies(req.headers.cookie);
}

export function wantsCookieMode(req: Pick<Request, 'headers'>): boolean {
  return String(req.headers[AUTH_MODE_HEADER] ?? '').toLowerCase() === 'cookie';
}

/** Seconds until a JWT's `exp`, at least 1; the cookie lives as long as the token. */
function secondsLeft(jwt: string): number {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')) as { exp?: number };
    if (typeof payload.exp === 'number') return Math.max(1, payload.exp - Math.floor(Date.now() / 1000));
  } catch {
    // fall through
  }
  return 15 * 60;
}

function secure(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function setAuthCookies(res: Response, tokens: { accessToken: string; refreshToken: string }): void {
  const refreshMaxAge = secondsLeft(tokens.refreshToken) * 1000;
  const base = { secure: secure() } as const;
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...base,
    httpOnly: true,
    sameSite: 'lax',
    path: '/api',
    maxAge: secondsLeft(tokens.accessToken) * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base,
    httpOnly: true,
    sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: refreshMaxAge,
  });
  // Readable on purpose: the web copies it into X-CSRF-Token, and its presence
  // tells the web a session exists (the tokens themselves are unreadable).
  res.cookie(CSRF_COOKIE, randomBytes(24).toString('base64url'), {
    ...base,
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: refreshMaxAge,
  });
}

export function clearAuthCookies(res: Response): void {
  const base = { secure: secure() } as const;
  res.clearCookie(ACCESS_COOKIE, { ...base, httpOnly: true, sameSite: 'lax', path: '/api' });
  res.clearCookie(REFRESH_COOKIE, { ...base, httpOnly: true, sameSite: 'strict', path: '/api/v1/auth' });
  res.clearCookie(CSRF_COOKIE, { ...base, httpOnly: false, sameSite: 'lax', path: '/' });
}

/** Constant-time comparison of the CSRF header with the CSRF cookie. */
export function csrfMatches(req: Pick<Request, 'headers'>): boolean {
  const cookie = requestCookies(req)[CSRF_COOKIE];
  const header = req.headers[CSRF_HEADER];
  if (!cookie || typeof header !== 'string') return false;
  const a = Buffer.from(cookie);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** True when this request is authenticated (or asks to refresh) by cookie rather than a bearer header. */
export function usesCookieAuth(req: Pick<Request, 'headers'>): boolean {
  if (req.headers.authorization) return false;
  const cookies = requestCookies(req);
  return Boolean(cookies[ACCESS_COOKIE] || cookies[REFRESH_COOKIE]);
}
