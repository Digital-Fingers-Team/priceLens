# Phase 05 — Frontend engineering (Next.js 14 App Router)

Scope: code health and correctness of the web app. Visual design and UX flows come in phases 06–07.

## Audit
- Server vs client components: "use client" only where needed (interactivity). Push it down to leaf components.
- Data fetching: server components for initial data; caching/revalidate settings correct for PRICE DATA (prices must not be cached longer than they're valid); no fetch waterfalls.
- Route files: `loading.tsx`, `error.tsx`, `not-found.tsx` where they belong.
- API client: typed from shared types/OpenAPI. No `any`, no untyped fetch scattered around.
- URL is state: search query, filters, sort, page live in the URL. Back/forward and shareable links work.
- Forms: validated with a schema, proper error display, no double submit.
- Hydration: zero hydration warnings. Zero console errors/warnings on every page.
- i18n/RTL (if bilingual): `lang` and `dir` set correctly, logical CSS properties (start/end, not left/right), no hardcoded strings outside the i18n system.
- Components: no 400+ line components, no prop drilling 4+ levels, no copy-pasted components, consistent folder structure.
- Error boundaries: one failing widget doesn't blank the page.
- Env: client never reads server-only env vars.
- Accessibility semantics: real buttons/links, labels, headings order, alt text.
- Leftovers: dead components, unused hooks, demo fallbacks, commented code.

## Tests
Component tests for key pieces (search box, filters, price table). Playwright e2e for: search → results → filter/sort → product → outbound link; auth; any account features.

## Definition of done
Zero console errors/warnings, zero hydration errors, zero `any` in app code (or each one justified). E2E green. `audit/05-frontend.md` written.
