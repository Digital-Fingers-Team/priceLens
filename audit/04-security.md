# Phase 04 — Security audit

Started 2026-09-26 from `9a48d46` (`phase-03-done` plus two matching commits). Framework: OWASP Top 10 (2021) and OWASP API Security Top 10 (2023), applied to this app. Evidence came from reading the code, the isolated dev stack, and read-only requests to production (`curl --resolve …:127.0.0.1` on the server, bad credentials only). Nothing in production was written.

Production containers at the start:
`pricelens-api 2026-09-26 13:55:03 rc=0 · pricelens-web-blue 11:39:48 rc=0 · pricelens-proxy 2026-09-25 11:42:35 · pricelens-postgres 11:37:34 · pricelens-redis 11:37:34`

Severity: P0 broken/unsafe (Critical/High) · P1 real user/business harm (Medium-High) · P2 polish/defence in depth (Low).

## What was checked and found sound

- **Authorization (API1/API5, IDOR).** Every non-public route sits behind the global `JwtAuthGuard` (`auth.module.ts:40`), then `RolesGuard` and `FeatureGuard`. The user-data queries are all scoped:
  - watchlist and alerts: `where: { id, userId }`
  - notifications: `updateMany where { id, userId }`
  - workspace routes: `OrganizationsService.requireMembership(userId, orgId[, role])` first, then sub-resources queried with `where: { id, orgId }` (events, rules, watches, reports, API keys, members, seller products)
  - admin routes: `@Roles(MODERATOR|ADMIN)`
  - A regression e2e test now proves all of this (S-19).
- **Injection.** No `$queryRawUnsafe`/`$executeRawUnsafe` in `src/` (tests only, with constant SQL). Raw SQL uses `Prisma.sql` tagged templates. Meilisearch is gone (ADR 0003).
- **SSRF.** Every server-side fetch goes to a fixed configured host: store search URLs are `baseUrl + encodeURIComponent(query)`, plus FX, the LLM judge and Impact. No route fetches a user-supplied URL.
- **Password hashing.** bcrypt, cost 12. JWT secrets are required (≥ 32 chars) in production (`auth.config.ts`).
- **Errors.** `ApiExceptionFilter` returns `Internal server error` on 5xx and logs the stack server-side. Prisma errors are mapped to generic messages. Swagger is off in production.
- **Infrastructure.** Production Postgres and Redis publish no host ports (`podman ps`: `5432/tcp`, `6379/tcp`). There is no bull-board. The Meilisearch container was removed (D-8).
- **Webhooks.** Stripe uses signature verification over the raw body. The affiliate postback compares a shared secret with `timingSafeEqual` and fails closed when unset.
- **Secrets in git.** gitleaks 8.30.1 over all 156 commits: 2 hits, both `generic-api-key` on `.env.example` lines whose value is empty (false positives). `NEXT_PUBLIC_*` holds only `API_URL` and `SITE_URL`.
- **Uploads.** None; no route takes files (multer is unused).
- **Next.js route handlers / server actions.** None exist (`robots.ts` and `sitemap.ts` only).

## Findings

### P0

**S-01 — Script injection through the product page's JSON-LD** (A-17, handoff 01).
- Where: `apps/web/src/app/products/[slug]/page.tsx:110`, `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}`.
- Why: the JSON carries the scraped product title. `JSON.stringify` leaves `<` alone, so a title containing `</script><script>…` escapes the tag and runs in every visitor's browser. Tokens sit in localStorage, so that means account takeover.
- Fix: serialize with `<`, `>`, `&`, U+2028 and U+2029 escaped as `\uXXXX` (still valid JSON), plus a unit test with a hostile title.

**S-02 — The live site cannot log in, register or change anything: CORS rejects its own origin.**
- Where: `apps/api/src/app.setup.ts` CORS allowlist = localhost defaults + `FRONTEND_URL`. The production `FRONTEND_URL` is only `http://130.110.124.121`.
- Evidence: `POST https://pricelens.work.gd/api/v1/auth/login` with `Origin: https://pricelens.work.gd` returns **403** `CORS_ORIGIN_NOT_ALLOWED` (should be 401 for the bad credentials sent). Browsers send `Origin` on every same-origin POST/PUT/DELETE; GETs carry none, which is why search and product pages still work.
- Why: login, sign-up, watchlist, alerts and billing are all dead on the live site. This is not strictly a vulnerability, but it's a broken security control.
- Fix: also allow the site's own origin from `NEXT_PUBLIC_SITE_URL`/`SITE_URL`, which production already sets correctly, and drop the localhost defaults in production (S-14). Regression e2e test.

**S-03 — Next.js 14.2.35 has unpatched critical advisories, including unauthenticated RCE in the image optimizer.**
- Evidence: `pnpm audit --prod` shows 3 critical / 38 high / 45 moderate / 5 low. For `next@14.2.35`:
  - GHSA-2xp9-vwfh-vxw4 (critical, `<15.5.24`): RCE when the Image Optimization API processes AVIF (libheif via sharp). `/_next/image` fetches from the retailer CDNs in `next.config.js`, and anyone who can put an image on one of those CDNs (a marketplace seller on AliExpress, for example) controls the input.
  - RSC/Server Components DoS (high), SSRF in rewrites/WebSocket upgrades (high), cache poisoning.
  - 14.x has no patch; the fixes are in 15.5.24+.
- Fix, in two steps:
  1. Now: `images.unoptimized: true`, which removes `/_next/image` entirely; images load straight from the retailer CDNs.
  2. Upgrade to Next 15.5.x (≥ 15.5.24) with React 19. **Deferred** to phase 05 (see the finding's status).

### P1

**S-04 — Logging out doesn't end the session: access tokens stay valid until they expire** (handoff 00).
- Where: `JwtStrategy.validate` → `AuthService.validateJwtUser` checks only the user. `logout` / `DELETE /auth/sessions` revoke refresh sessions only.
- Why: production `JWT_ACCESS_TTL=30m`, so a stolen token outlives "log out everywhere" by up to 30 minutes.
- Fix: the session row id becomes the token's `jti`. The strategy loads the session with its user in one query and rejects revoked or expired sessions. `logout` also revokes the caller's current session.

**S-05 — Refresh-token rotation has a race, and reuse of a stolen token isn't detected.**
- Where: `AuthService.refreshTokens` reads the session, then updates `revokedAt` unconditionally. Two concurrent refreshes with the same token both succeed and fork the session. A replayed rotated token just gets 401 while the thief's copy keeps working.
- Fix:
  - Revoke with `updateMany where { id, revokedAt: null }` and require `count === 1`.
  - Presenting a token revoked by rotation more than 60 s ago revokes all of that user's sessions (OAuth 2.0 BCP reuse detection). The grace window covers two tabs refreshing at once.
  - The web client re-reads storage when another tab has already rotated, instead of logging the user out.

**S-06 — Refresh tokens are stored in plaintext.**
- Where: `sessions.refresh_token`.
- Why: a database read (backup, SQL access) yields working 30-day credentials.
- Fix: store SHA-256 of the token and look up by hash. Sessions created before the deploy still hold the raw token, so lookups fall back to the raw value until 2026-10-26 (the 30-day TTL). A comment dates the fallback for removal.

**S-07 — A workspace ADMIN can demote the OWNER.**
- Where: `OrganizationsService.addMember` upserts `role` for an existing member without checking who that member is.
- Evidence: `POST /seller/workspaces/:orgId/members {email: <owner's>, role: MEMBER}` by an ADMIN takes the owner down to MEMBER. The owner then can't manage members or billing for their own workspace.
- Fix: refuse to change the owner's role (400), plus a test.

**S-08 — The web pages send no security headers.**
- Evidence: `curl -I https://pricelens.work.gd/` shows only HSTS (from nginx) and `x-powered-by: Next.js`. There's no CSP, no `frame-ancestors`/`X-Frame-Options` (the site can be framed, which enables clickjacking), no `nosniff` and no `Referrer-Policy`.
- Fix: `next.config.js` `headers()`:
  - CSP: `default-src 'self'`; scripts `'self' 'unsafe-inline'`, since Next 14 inline bootstrap scripts need it without nonce middleware; `img-src 'self' https: data:`; `connect-src 'self'` plus the API origin; `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`
  - `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`
  - `poweredByHeader: false`

  Script nonces (to drop `'unsafe-inline'`) → phase 05 with the Next 15 upgrade.

**S-09 — Scraped URLs are trusted as link targets and redirect destinations.**
- Where:
  - `affiliate.service.ts createRedirect` 302s to `listing.externalUrl` (or an affiliate URL built from it) with no check.
  - The web renders `listing.externalUrl` (`listing-table.tsx:174`, `review-card.tsx:90`), `competitor.url` and `evidenceUrl` as `href`.
- Why: these values come from store HTML. A `javascript:` URL in an href runs script on click (React 18 only warns). A listing URL pointing off-store turns `/affiliate/go/:id` into an open redirect under our domain.
- Fix:
  - API: redirect only to `http(s)` URLs whose host is the listing's platform host or a subdomain of it; otherwise 404 and log.
  - Web: a `safeExternalHref()` helper (http/https only) for every scraped href.

### P2

**S-10 — Login timing reveals which e-mails have accounts** (handoff 03). The "dummy" hash `$2b$12$invalidhashfortimingatk` is malformed, so `bcrypt.compare` returns at once for unknown e-mails. Fix: compare against a real cost-12 hash generated once at startup, plus a test that the dummy is a valid hash.

**S-11 — Secrets in query strings are written to the logs.** The affiliate postback URL carries `?secret=…`. `LoggingInterceptor` and `ApiExceptionFilter` log `req.url` verbatim. Fix: redact `secret`, `token`, `key`, `code`, `password` query values in logged URLs.

**S-12 — Registration logs the user's e-mail** (`auth.service.ts:64`). PII in logs. Fix: log the user id.

**S-13 — The affiliate click IP trusts the left-most `X-Forwarded-For`** (`affiliate.controller.ts extractIp`), which the client controls. It skews click-fraud statistics. Fix: use `req.ip` (Express already applies `trust proxy` = 1 hop).

**S-14 — CORS: localhost origins are allowed in production, and requests without an Origin header pass** (handoffs 00, 01, 03).
- Fix: localhost defaults only outside production.
- No-Origin requests stay allowed, as a conscious choice: auth is a bearer header, not a cookie, so there is no ambient credential for CSRF to ride on, and server-to-server callers (Stripe, affiliate networks, partner API) send no Origin. Documented in SECURITY.md.

**S-15 — The production API is published on `0.0.0.0:3002`** (handoff 00). Evidence: `ss -ltn` shows `*:3002`. firewalld allows only ssh, 80, 443, 3000, 4000, 5173 and 8770, so 3002 should be closed from outside. From the phone every port answers the carrier proxy's 405, so the external probe is inconclusive. Direct access would bypass nginx and let a client spoof `X-Forwarded-For` against the throttler. Fix: `127.0.0.1:3002:3001` in `docker-compose.server.yml`; it takes effect when the container is next recreated.

**S-16 — Sessions expire after 7 days while refresh tokens last 30.** `createSessionAndTokens` hard-codes `+7 days`, and production sets `JWT_REFRESH_TTL=30d`, so users are logged out after a week despite the configured 30 days. Fix: take `expiresAt` from the signed token's `exp`.

**S-17 — Vulnerable dependencies (runtime paths).**
- `nodemailer@6.10.1`: high, addressparser DoS; moderate, CRLF/header injection and domain-confusion. Used for alert e-mails. Fix: upgrade to 8.x (same `createTransport`/`sendMail` API).
- `axios@1.16.1` (api + web): high, inherited-proxy config; moderate, prototype-pollution gadgets. Fix: ≥ 1.18.
- `lodash@4.17.21` (via `@nestjs/config`): `_.template` code injection. It isn't called with user input, but it's cheap to fix: pnpm override ≥ 4.17.24.
- `tar`/`brace-expansion` via `bcrypt@5` → `@mapbox/node-pre-gyp`: install-time only. Fix: `bcrypt@6`, which uses prebuilt binaries and has no node-pre-gyp.
- `multer`, `body-parser`, `file-type`, `qs` via `@nestjs/*@10`: no upload routes, and body size is Nest's default. **Deferred**: Nest 11 is a framework upgrade (→ phase 10, with the worker split).
- `js-yaml` (swagger, off in production), `postcss`/`nanoid` (build time): not reachable at runtime; they go away with the Next 15 upgrade.

**S-18 — Tokens live in `localStorage`.**
- Any XSS can read them. S-01, S-08 and S-09 close the known XSS paths and add CSP.
- Moving to httpOnly cookies means cookie auth plus CSRF protection plus a refresh endpoint that reads the cookie. That's cross-cutting, changes how the partner/API clients authenticate, and needs same-site deployment decisions.
- **Needs decision** (D-17).

**S-19 — No regression test covers cross-user access.** The code checks are correct today (see "checked and found sound"), but nothing stops a future route from forgetting the scope. Fix: an e2e test where user B tries user A's alert, notification and workspace, and a non-admin tries admin routes.

**S-20 — Rate limiting.**
- Current limits: global 100 req/min per IP, login 10/min, register 5/min, deal-hunter 20/min.
- There is no password-reset endpoint. Verification codes are 32-bit, expire in 30 min and are throttled.
- Missing: `POST /auth/refresh` inherits 100/min. Fix: 30/min.
- Per-account lockout is not added: with per-IP limits and bcrypt-12, online guessing is slow, and lockout would let anyone lock a victim out. Documented.

**S-21 — Another project's MongoDB is published on `0.0.0.0:27017`** (aradobotd-mongo). Out of PriceLens scope, and firewalld doesn't list 27017, but it belongs to the owner (morning list, D-18).

## Fix log

(filled in as fixes land)

## Summary

(at the end)

## Remaining items

## Handoff → other phases

## Decisions for Baraa
