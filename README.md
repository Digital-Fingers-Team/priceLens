# PriceLens

Price comparison for Egyptian stores, live at https://pricelens.store. PriceLens collects listings from Amazon.eg, Noon, Jumia, B.TECH, 2B, Elaraby and other stores. It matches the same product across stores and shows prices, price history and alerts. It is Arabic-first, with English under `/en`.

- `apps/api`: NestJS API and background workers (Prisma/PostgreSQL + pgvector, Redis, Bull)
- `apps/web`: Next.js 15 App Router frontend
- `packages/contracts`: types shared by both

Architecture, workflow, deploys, the runbook, decisions and open items are all in [CLAUDE.md](CLAUDE.md).

## Quick start

Requires Node.js 22, pnpm 11.4.0 (`corepack enable`, or `npx pnpm@11.4.0`) and Docker Compose v2 or Podman.

```bash
pnpm install
pnpm dev:up    # Postgres + Redis on localhost, migrations, demo seed, API :3001, web :3000
```

Development uses the committed `.env.development`. Every store connector, scheduled scrape and paid API is turned off there, so development never touches real stores. `.env.example` documents every variable.

Before pushing: `pnpm lint`, `pnpm typecheck`, `pnpm build`, plus the tests listed in CLAUDE.md.
