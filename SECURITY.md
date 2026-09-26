# Security

How PriceLens authenticates people, what it trusts, and where secrets live. The phase 04 audit (`audit/04-security.md`) has the findings and evidence behind each rule.

## Reporting a problem

Mail the owner (see the repository profile) and don't open a public issue. Include the URL, the request, and what you saw.

## Authentication

**Accounts.** E-mail and password. Passwords are hashed with bcrypt, cost 12 (`auth.config.ts`). Login answers every failure with the same `401 Invalid credentials`, and an unknown e-mail costs the same bcrypt work as a wrong password, so neither the message nor the timing reveals which e-mails have accounts.

**Tokens.** Login and registration return two JWTs:

| Token | Lifetime (prod) | Secret | Used for |
| --- | --- | --- | --- |
| Access | `JWT_ACCESS_TTL` (30 min) | `JWT_ACCESS_SECRET` | `Authorization: Bearer …` on API calls |
| Refresh | `JWT_REFRESH_TTL` (30 days) | `JWT_REFRESH_SECRET` | `POST /auth/refresh`, once |

- Each login creates a **session** row. Both tokens carry the session id as `jti`.
- Every authenticated request loads the session, so revoking it takes effect at once. The access token does not live on until it expires.
- The database stores only the **SHA-256 of the refresh token**. A copy of the database holds no usable token.
- **Rotation.** Each refresh revokes the session and issues a new pair. The revoke is conditional, so two concurrent refreshes with one token cannot both succeed.
- **Reuse detection.** A rotated refresh token presented again more than 60 s later means someone else has a copy. Every session of that user is revoked. The 60 s grace covers two browser tabs refreshing at the same moment.
- **Logout** revokes the current session. **`DELETE /auth/sessions`** revokes all of them. At most 5 sessions stay active per user; older ones are revoked.
- In production the API refuses to start if either JWT secret is missing, is the built-in default, or is shorter than 32 characters.

**Where the browser keeps tokens.** In `localStorage` (`pl_access_token`, `pl_refresh_token`), sent as a bearer header, never as a cookie. There is no ambient credential, so cross-site request forgery has nothing to ride on. The trade-off: script injection could read the tokens, which is why the XSS rules below matter. Moving to httpOnly cookies is an open owner decision (D-17).

**Machine clients.** The partner API (`/partner/*`) uses per-workspace API keys (`X-API-Key`). Only their hash is stored, and they can be revoked. Webhooks authenticate differently:
- Stripe: signature over the raw body
- affiliate postbacks: shared secret, compared in constant time

## Authorization

- Every route requires a signed-in user unless it is marked `@Public()`. That default comes from the global `JwtAuthGuard`.
- `RolesGuard` enforces `@Roles(...)` for admin and moderator routes. `FeatureGuard` enforces plan features (`@RequiresFeature`).
- User data is always queried with the caller's id in the `where` clause (`{ id, userId }`), so another user's id behaves like a missing one (404). Nothing checks ownership after loading.
- Workspace routes call `OrganizationsService.requireMembership(userId, orgId, role?)` first, then query sub-resources with `{ id, orgId }`. A workspace has exactly one OWNER; nobody can change the owner's role through the member endpoints.
- `test/e2e/endpoints.e2e-spec.ts` ("another user cannot read or change what is not theirs") is the regression test. Add new user-owned resources to it.

## Untrusted input

- **Scraped store data is hostile.** Titles, URLs and images come from store HTML.
  - React renders text escaped; `dangerouslySetInnerHTML` is used only for JSON-LD, through `serializeJsonLd`.
  - Links built from scraped URLs go through `safeExternalHref` (http/https only).
  - `/affiliate/go/:id` redirects only to the listing's own store domain (`isStoreUrl`).
- **Request bodies and queries** are validated by DTOs (`whitelist`, `forbidNonWhitelisted`). Raw SQL uses `Prisma.sql` templates only, never string building.
- **Outbound requests** go only to configured hosts: store search URLs, FX, the LLM judge, affiliate networks. No route fetches a URL a user supplied.

## Browser and HTTP hardening

- **Web** (`next.config.js`):
  - Content-Security-Policy: `frame-ancestors 'none'`, `object-src 'none'`, `base-uri`/`form-action 'self'`, `connect-src` limited to the site and API. Scripts still allow `'unsafe-inline'` until nonces arrive with Next 15.
  - `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, no `x-powered-by`.
  - The Next image optimizer is off (`images.unoptimized`) because Next 14 has an unpatched RCE in it.
- **API:** helmet defaults plus CSP; HSTS from nginx.
- **CORS** allows the site's own origin (`NEXT_PUBLIC_SITE_URL`), `FRONTEND_URL` entries, and localhost outside production. Requests without an `Origin` (servers, webhooks, curl) pass. That is deliberate: auth is a bearer header, so CORS isn't what protects the data.
- **Rate limits** (per client IP, behind one trusted proxy hop):
  - global 100/min
  - login 10/min, registration 5/min, refresh 30/min
  - deal hunter 20/min
  - The partner API is limited by its per-key quota instead.
- **Errors:** 5xx responses say `Internal server error` with a request id; the detail goes to the log. Swagger (`/docs`) is off in production.
- **Logs:** no passwords or tokens. Credential-like query values (`secret`, `token`, `key`, `code`, …) are redacted from logged URLs, and user e-mails are not logged at registration.

## Secrets

- **Production secrets** live only in the repo-root `.env` on the server. It is gitignored and never printed; containers read it via `env_file`. `.env.example` documents every key with empty or dummy values, and `.env.test` holds throwaway local values on purpose.
- **Browser-visible variables** (`NEXT_PUBLIC_*`) are only `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SITE_URL`. Never put a secret behind that prefix: it is compiled into the JavaScript bundle.
- **Rotating secrets:**
  - A JWT secret: change it in `.env` and redeploy the API. Every session ends; users log in again.
  - `AFFILIATE_CONVERSION_WEBHOOK_SECRET`: update it at the affiliate network too.
  - Stripe keys: in the Stripe dashboard, then `.env`.
- **Scanning:** gitleaks over the full history (phase 04: 156 commits, no real secrets). Run it before making the repository public: `gitleaks git --redact .`

## Infrastructure

- Only nginx (`pricelens-proxy`, 80/443) is public.
- Postgres and Redis publish no host ports.
- The API is published on `127.0.0.1:3002` for local checks only. This takes effect at the next API container recreate; before that it was `0.0.0.0:3002`, closed by firewalld.
- There is no job dashboard (bull-board) and no search engine exposed.

## Dependencies

`pnpm audit --prod` after phase 04 still shows advisories, all in two groups:
- `next@14` (with its `postcss`/`nanoid`): fixed by the Next 15 upgrade.
- `@nestjs/*@10` transitive (`multer`, `body-parser`, `file-type`): no upload routes use them; fixed by the Nest 11 upgrade.

`pnpm-workspace.yaml` `overrides` set minimum safe versions for `lodash`, `qs` and `js-yaml`.
