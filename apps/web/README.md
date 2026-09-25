# @pricelens/web

The PriceLens frontend: Next.js 14 (App Router), TanStack Query for server state, Zustand for UI state, Tailwind, Recharts.

How to run the whole stack, the tests and the deploys is in the [root README](../../README.md); how the parts fit together is in [ARCHITECTURE.md](../../ARCHITECTURE.md).

## Layout

| Path | What |
|---|---|
| `src/app` | Routes. Home and product pages render on the server (ISR, `revalidate = 300`). |
| `src/components` | UI, grouped by feature (`product`, `search`, `charts`, `billing`, ...) and `ui` primitives |
| `src/lib/api` | One module per API area; all calls go through `client.ts` (axios, token refresh) |
| `src/lib/hooks` | React Query hooks over `lib/api` |
| `src/lib/store` | Zustand stores (auth, search filters, UI) |
| `src/types` | Response types. The shared ones (envelope, error codes, price responses) come from `@pricelens/contracts`, the API's own definitions |
| `e2e` | Playwright smoke tests |

## Environment

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_API_URL` | API base URL in the browser. Compiled into the bundle at build time; `/api/v1` behind the proxy. |
| `API_INTERNAL_URL` | API base URL for server-side rendering (inside the container, the public host is not routable) |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL for metadata, sitemap and robots |

## Scripts

`pnpm dev`, `pnpm build`, `pnpm start`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (Vitest), `pnpm test:e2e` (Playwright, needs `pnpm dev:up`).
