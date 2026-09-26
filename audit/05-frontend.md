# Phase 05 — Frontend engineering

Date: 2026-09-26. Branch `feat/price-intelligence-platform`, starting at `e3c8403` (tag `phase-04-done` = `adcc206` + a docs-only commit).
Scope: code health and correctness of `apps/web`. Visual design and UX flows are phases 06–07.

## Step 0 — deploy phase 04 (owner-approved, D-19)

Production baseline before the deploy (`podman inspect … {{.State.StartedAt}} {{.RestartCount}}`):

```
pricelens-api       2026-09-26 13:55:03 UTC 0
pricelens-web-blue  2026-09-26 11:39:48 UTC 0
pricelens-proxy     2026-09-25 11:42:35 UTC 0
pricelens-postgres  2026-09-25 11:37:34 UTC 0
pricelens-redis     2026-09-25 11:37:34 UTC 0
```

(`pricelens-web-green` did not exist; blue was live.)

`./scripts/deploy-api.sh` from `~/pricelens` at `e3c8403`: built, unit tests passed in the image, migrations applied, the container was replaced at 16:33:08 UTC and reported healthy. Verification:

```
$ curl … https://pricelens.work.gd/api/v1/billing/plans            → plans 200
$ curl -i -X POST -H 'Origin: https://pricelens.work.gd' … /api/v1/auth/login  (bad credentials)
HTTP/2 401
access-control-allow-origin: https://pricelens.work.gd
$ ss -ltn | grep 3002
LISTEN 0 4096 127.0.0.1:3002 0.0.0.0:*
```

S-02 is fixed live: login and sign-up no longer get a CORS 403. The API is no longer published on all interfaces.

Then `./scripts/deploy-web.sh`: image built, blue/green swap to `pricelens-web-green` (10.89.1.27), nginx repointed, blue removed, exit 0. Verification:

```
home                                   → 200
/_next/image?url=%2Ficon-192.png&w=64  → 404            (S-03: optimizer off)
/products/galaxy-a03-…                 → 200
content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline'; …
```

New baseline (the deploy changes api and web on purpose; everything else unchanged):

```
pricelens-api        2026-09-26 16:33:08 UTC 0
pricelens-web-green  2026-09-26 17:03:59 UTC 0
pricelens-proxy      2026-09-25 11:42:35 UTC 0
pricelens-postgres   2026-09-25 11:37:34 UTC 0
pricelens-redis      2026-09-25 11:37:34 UTC 0
```

Everyone gets one silent token refresh on their next API call (old access tokens carry no session id).

## Audit

Method: read every route and shared component in `apps/web/src` (9.7k lines, 51 `"use client"` files), ran the existing Vitest and Playwright suites, and checked the browser console on each page with Playwright (evidence in the Fix log).

What is already in good shape (no action):
- No `any` in app code (`: any`, `as any`, `<any>`, `any[]`: 0 matches).
- No component over 400 lines (largest: `seller/[orgId]/products/[productId]/page.tsx`, 325).
- The client never reads server-only env: `API_INTERNAL_URL` is only read when `typeof window === 'undefined'` (`config/constants.ts:15`), everything else is `NEXT_PUBLIC_*` or `NODE_ENV`.
- Forms (login, register, alert modal) are validated with zod + react-hook-form, and the submit button is disabled while the mutation is pending (`Button loading` sets `disabled`).
- Price caching: product and home pages revalidate every 300 s; the product query's client `staleTime` is 2 min and the search query's is 5 s. Offers older than 7 days are already excluded server-side (phase 02). Acceptable for price data; on-demand revalidation when ingestion changes a price is handoff A-13 → phase 08.
- The one `dangerouslySetInnerHTML` (JSON-LD) is escaped (phase 04, S-01).

### Findings

| ID | Sev | Where | Problem | Why it matters | Fix |
|---|---|---|---|---|---|
| FE-01 | P0 | `apps/web/package.json` (`next ^14.2.0`, React 18) | Next 14.2 has unpatched advisories (S-03 image optimizer RCE via AVIF, S-17 middleware/cache advisories); 14.x gets no more fixes. | Remote code execution and cache-poisoning classes on a public site. The optimizer is disabled as a stopgap. | Upgrade to Next 15.5.26 + React 19.2.8 (both past the minimum-release-age window). Migrate async `params`/`searchParams`, the `fetch`/route caching defaults and React 19 type changes. Keep `images.unoptimized` (see D-20). |
| FE-02 | P1 | `lib/store/auth.store.ts` (zustand `persist` with synchronous `localStorage`) | The store rehydrates at module load, so a signed-in visitor's first client render (navbar, product cards, product header) differs from the server HTML, which is always signed out. | React throws a hydration mismatch for every signed-in page view and re-renders the whole tree on the client; in React 19 this is a console error on every page. | `skipHydration: true`, rehydrate in an effect in `Providers`; auth-dependent UI waits for `hasHydrated`. |
| FE-03 | P1 | `app/search/page.tsx:18-42`, `lib/store/search.store.ts` | Search state lives in a zustand store and is copied to the URL with `router.replace`. Only `q`, `page`, `brand`, `minPrice`, `maxPrice` reach the URL; `tier`, `categoryId`, `sortBy`, `sortDir` do not. The URL is read once (first render). `replace` creates no history entries. | Back/forward never restores a previous search or page; a shared link loses sort and tier; opening `/search?q=x` after visiting `/search?q=y` in the same session shows stale filters. | Make the URL the single source of truth: derive filters from `useSearchParams`, write with `router.push`. Remove the filter state from the store. |
| FE-04 | P1 | `components/search/search-bar.tsx:83` | The `<form>` has no `action` and the input no `name`. A submit before hydration (slow phone, JS still loading) reloads the current page and drops the query (handoff 00). The input also keeps its first `initialValue`, so back/forward on `/search` shows the wrong text. | Lost searches on slow connections; the search box contradicts the results. | `action="/search"`, `name="q"`, `role="search"`; re-sync the input when `initialValue` changes. |
| FE-05 | P1 | `app/products/[slug]/page.tsx:78-85` | Every fetch error is swallowed: an unknown slug renders the client "Product unavailable" view with **HTTP 200** (a soft 404), and an API outage during ISR caches that same view for 300 s. | Crawlers index error pages as products; a short API blip replaces good cached pages. | 404 from the API → `notFound()` (real 404 + `not-found.tsx`); any other error → throw, so `error.tsx` renders and ISR keeps serving the last good page. |
| FE-06 | P2 | `app/products/[slug]/page.tsx:22,82` | `generateMetadata` and the page each call `productApi.getBySlug` (axios, not deduplicated by Next). | Two API calls per product render. | Wrap in React `cache()`. |
| FE-07 | P2 | navbar (8×), `not-found.tsx` (2×), 5 other pages | `<Link><Button/></Link>`: a `<button>` inside an `<a>` (invalid HTML, two tab stops per action, handoff 00). The mobile menu toggle has no accessible name; the password visibility toggle has no name and `tabIndex=-1`. | Keyboard and screen-reader users get duplicate or unnamed controls. | A `buttonClassName()` helper so links are styled as buttons without nesting; `aria-label`/`aria-expanded` on the toggles. |
| FE-08 | P2 | `app/search/page.tsx:118-135` | Page-number buttons only cover pages 1–5, are `<button>`s (not links), and have no `aria-current`. | Page 6+ is reachable only by clicking Next repeatedly; page links cannot be opened in a new tab. | Render pagination as links built from the URL, with a window around the current page. |
| FE-09 | P2 | product title, listing titles, suggestions | Arabic store titles are rendered in an LTR context without `dir="auto"`. | Mixed Arabic/Latin titles (e.g. `هاتف سامسونج Galaxy A57 256GB`) render with punctuation and numbers in the wrong place. | `dir="auto"` on user/store-provided text. The UI itself is English-only; no i18n system exists (not in scope to add). |
| FE-10 | P2 | `app/error.tsx` | The root `error.tsx` is named `GlobalError` but cannot catch errors in the root layout (navbar, providers); there is no `global-error.tsx`. | An exception in the navbar shows the bare Next.js error screen. | Add `app/global-error.tsx` (own `<html>`/`<body>`). |
| FE-11 | P2 | tests | No component tests for the filters or the price (listing) table; Playwright covers search → product and login, but not filter/sort, back/forward, the outbound store link, or a console-error check. | The flows this phase changes have no regression net. | Vitest: `SearchFilters`, `ListingTable`. Playwright: filter/sort in URL + back/forward, product → outbound link, 404 status, console errors on key pages. |
| FE-12 | — | `listing-table.tsx` "View" link | Goes straight to the store (`externalUrl`), bypassing `/affiliate/go` click tracking (handoff 04). | Product/revenue decision, not a bug. | D-21. |
| FE-13 | — | `lib/api/client.ts`, `auth.store.ts` | Tokens in `localStorage` (S-18). | See D-17 (open). | Not changed without the owner's answer. |
| FE-14 | P2 | `components/search/search-filters.tsx` | Found by the new component test: the Tier / Sort by / Direction `<label>`s are not associated with their `<select>`s. | Screen readers announce unlabelled selects; clicking the label does nothing. | `htmlFor` + `useId`. |
| FE-15 | P2 | product cards on `/` and `/search` | Found by the console check: the first card image is the LCP but loads lazily (Next warns in dev). | Slower largest paint on the two busiest pages. | `priority` for the first row (4 cards). |

## Status

| ID | Status | Commit |
|---|---|---|
| FE-01 | Fixed: Next 15.5.26, React 19.2.8, eslint-config-next 15.5.26, @types/react 19.2, recharts 2.15.4 (React 19 peer). Image optimizer stays off (D-20). | `be5b766` |
| FE-02 | Fixed | `c4bfa2a` |
| FE-03 | Fixed | `10fc4b4` |
| FE-04 | Fixed | `10fc4b4` |
| FE-05 | Fixed. The route's `loading.tsx` was removed: its Suspense boundary sent the 200 before `notFound()` ran (checked: 200 with it, 404 without, for both a browser and a Googlebot user agent). | `be5b766` |
| FE-06 | Fixed | `be5b766` |
| FE-07 | Fixed (15 nested links, 3 unnamed controls, store-link names, stock icon labels) | `c4bfa2a` |
| FE-08 | Fixed | `10fc4b4` |
| FE-09 | Fixed on product, card, listing, suggestion, watchlist and review titles, and the query echo | `c4bfa2a`, `10fc4b4` |
| FE-10 | Fixed | `c4bfa2a` |
| FE-11 | Fixed | `b6d3d68` |
| FE-12 | Needs decision (D-21) | — |
| FE-13 | Needs decision (D-17, open since phase 04) | — |
| FE-14 | Fixed | `10fc4b4` |
| FE-15 | Fixed | `c4bfa2a` |

## Fix log / evidence

Dependencies: `pnpm install` resolved Next 15.5.26 (published 2026-09-22) and React 19.2.8 (2026-07-21) without touching `pnpm-workspace.yaml` (no minimum-release-age exceptions). `next@14` no longer appears in the lockfile.

Next 15 migration: the product page was the only server component reading `params`; the seller pages use `useParams` (unchanged). No `fetch` calls exist in the app (the API client is axios), so the Next 15 fetch-cache default changes nothing. No React 19 type breakage (`JSX.`, `useRef()` without an argument, `defaultProps`: 0 matches).

Caching check (prod, Next 14, before this phase): the product page answers `cache-control: private, no-cache, no-store`, so `revalidate = 300` never took effect there; the page renders per request. Next 15 builds it the same way (`ƒ`). No behavior change, handed to phase 08.

Build (`next build`, Next 15.5.26):

```
┌ ○ /                          206 B   156 kB   5m
├ ○ /login                    1.05 kB  166 kB
├ ƒ /products/[slug]           119 kB  271 kB
├ ○ /search                   5.24 kB  161 kB
+ First Load JS shared by all          103 kB
```

Gate on the final commit (server test clone):

```
web  tsc --noEmit        rc=0
web  next lint           ✔ No ESLint warnings or errors
web  vitest run          9 files, 31 tests passed (+3 files, +13 tests this phase)
web  next build          rc=0
contracts tsc --noEmit   ok
each intermediate commit (be5b766, c4bfa2a, 10fc4b4): tsc 0, lint 0, vitest 0
```

Playwright against `dev:up` (13000/13001), desktop 1440 and mobile 375:

```
✓ [desktop] filters and sort live in the URL, and back/forward restores them
✓ [desktop] product page links out to the store in a new tab
✓ [desktop] an unknown product is a real 404
✓ [desktop] without JavaScript › the search form still searches
✓ [desktop] no console errors or hydration warnings on key pages, signed out and signed in
✓ [desktop] search → results → product page / empty search / login and logout
  (same 8 on mobile)
16 passed
```

The console check visits `/`, `/search?q=galaxy`, a product, `/login`, `/pricing` and a 404, signed out and then signed in, and fails on any console error, warning or uncaught exception. Two things are ignored, both expected: the 404 document's own failed-resource message, and Next's LCP hint for the dev seed's shared `dummyimage.com` placeholder URL (many seeded products share one image URL; Next tracks the hint per URL, so a later non-priority card with the same URL sets it off. Real product images are per product).

Web check image: `podman build -f docker/Dockerfile.web` (same build args as `deploy-web.sh`) from `b6d3d68` → rc 0; the container, run on 127.0.0.1:13010, logged `✓ Ready in 1031ms` and answered `/login` 200 and an unknown path 404. Image and container removed afterwards.

## Summary

- Step 0: phase 04 is live (API + web). Live login and sign-up work again (S-02), the API listens on 127.0.0.1 only, the image optimizer is closed, and product pages carry the CSP.
- The web app runs on Next 15.5.26 and React 19.2.8, off the unpatched Next 14 line.
- Signed-in visitors no longer hit a hydration mismatch on every page; auth UI waits for the stored session instead of flashing "Sign in".
- Search state lives only in the URL: every filter, sort and page, with working back/forward, reload and shared links. Pagination is real links; the form works before the JavaScript loads.
- Unknown products return a real 404; API failures go to the error boundary instead of being rendered as the page. One product fetch per render instead of two.
- No more buttons nested in links; unnamed controls got names; Arabic titles render with the right direction; a global error boundary covers the root layout.
- New tests: 3 Vitest files (13 tests) and a Playwright flow suite (5 tests × 2 viewports).

## Remaining items

- D-17 (httpOnly cookies) and D-20 (CSP nonces, image optimizer) wait for the owner.
- Client-side navigation to a product page no longer shows a skeleton (the route's `loading.tsx` had to go for the 404 fix); the previous page stays visible until the product renders. A global navigation progress indicator belongs to phase 06.

## Handoff → other phases

- **06 UX**
  - A navigation progress indicator (see Remaining items).
  - The mobile menu lacks Deal Hunter, Seller, Notifications and (signed in) Pricing, which the desktop navbar has.
  - Login always returns to `/`, not to the page that sent the user there.
  - The filter panel's "Category ID" is a free-text id field, not a category picker.
  - Handoffs from 00/04 still open: store listings table overflow on mobile; login/sign-up error states for 401/409/429; S-05 lockout message.
- **08 Optimization**
  - `revalidate = 300` on the product page has never taken effect (prod answers `no-store`; the route builds as `ƒ`). Making product pages ISR (e.g. `generateStaticParams` returning `[]`) or on-demand revalidated (A-13) is a performance decision with a freshness trade-off.
  - `/products/[slug]` first-load JS is 271 kB (263 kB on Next 14): Recharts dominates; load the chart lazily.
  - Recharts 2.x is deprecated upstream; 3.x is a breaking upgrade.
- **10 DevOps**
  - `next-env.d.ts` now references `.next/types/routes.d.ts`, so a fresh checkout must run `next typegen` (or a build) before `tsc --noEmit` in CI.
  - `next lint` is deprecated in Next 15.5 and removed in 16: move to the ESLint CLI (flat config) before the next major.
  - The web image was proven with a check build (see Fix log); the next `deploy-web.sh` ships Next 15.

## Decisions for Baraa

- **D-17 (still open, from phase 04): tokens in localStorage vs httpOnly cookies.** Not done this phase because it has no answer yet and it changes the API's auth contract. **Recommendation:** approve it; it fits phase 10 (together with CSRF protection and a same-site cookie refresh), with bearer keys kept for the partner API.
- **D-20 — CSP nonces and the image optimizer.** Now possible on Next 15, but nonces make every page render per request (home and search are static today), and the optimizer would re-open the image-decoding path that S-03 closed (images already load directly from the store CDNs). **Recommendation:** keep `'unsafe-inline'` and the optimizer off for now; revisit nonces in phase 08 together with the caching decision.
- **D-21 — Store links bypass click tracking.** "View" on a product page goes straight to the store, not through `/affiliate/go`, so clicks and any affiliate revenue are not recorded. **Recommendation:** route them through `/affiliate/go` (it already exists and is tested) in phase 06, if you want the click data.
- **D-22 — Deploy phase 05.** The Next 15 upgrade is proven in a check image and on the dev stack but is not live. **Recommendation:** deploy web (`./scripts/deploy-web.sh`) at the end of the overhaul together with later web phases, or now if you want the Next 14 advisories closed sooner. (The owner approved only the phase 04 deploy.)

