# Phase 04 — Security

Framework: OWASP Top 10 + OWASP API Security Top 10. Think like an attacker against THIS app.

## Audit
- Auth: password hashing (argon2/bcrypt, proper cost), JWT expiry, refresh token rotation + revocation, logout actually invalidates, cookie flags (httpOnly, secure, sameSite), no tokens in localStorage if avoidable.
- Authorization: every endpoint that touches user data checks ownership (IDOR). Try accessing another user's watchlist/alerts/account by changing IDs. Admin routes protected.
- Injection: any `$queryRawUnsafe` / string-built SQL, Meilisearch filter strings built from user input.
- SSRF: any server-side fetching of URLs (scrapers, image proxies, user-submitted links). Block internal IPs/metadata endpoints.
- XSS: `dangerouslySetInnerHTML`, rendering scraped product titles/descriptions (treat all scraped content as hostile), markdown rendering.
- Open redirect: outbound "go to store" links must only go to allowed store domains.
- CSRF protection where cookies are used. Strict CORS allowlist.
- Headers: helmet, CSP, HSTS, X-Frame-Options/frame-ancestors, referrer policy.
- Rate limiting: login, signup, password reset, search, any expensive endpoint. Brute-force protection.
- Secrets: none in repo or git history (run gitleaks). `NEXT_PUBLIC_` vars contain nothing secret. Meilisearch master key never reaches the browser (use a scoped search key).
- Infra exposure: Postgres, Redis, Meili, bull-board not publicly reachable or unauthenticated.
- Errors: no stack traces or internal details in production responses. Logs contain no passwords, tokens, or PII.
- Dependencies: npm audit, known CVEs in critical packages.
- Next.js: server actions / route handlers validate input and auth like any API.
- Uploads (if any): type/size validation, no execution, stored outside web root.

## Fix
All Critical/High fixed now, with a regression test proving each exploit no longer works. Medium/Low fixed or documented with reasoning.

## Definition of done
`audit/04-security.md` with severity per finding and evidence of each fix. `SECURITY.md` documenting auth model and secret handling.
