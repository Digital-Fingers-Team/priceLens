# PriceLens

Price comparison for Egyptian stores. PriceLens collects listings from Amazon, Noon, Jumia, Carrefour, 2B, Elaraby, AliExpress and Alibaba, matches the same product across stores into one canonical product, and shows prices, price history and alerts.

- `apps/api`: NestJS API plus background workers (Prisma/PostgreSQL + pgvector, Redis, Bull)
- `apps/web`: Next.js 14 App Router frontend

See [PROJECT_MAP.md](PROJECT_MAP.md) for the full map (modules, jobs, ports, environment) and `audit/` for the current state of each overhaul phase.

## Prerequisites

- Node.js 22 (`.nvmrc`; the Docker images use 22)
- pnpm 11.4.0 (`corepack enable`, or `npx pnpm@11.4.0 …` where corepack is unavailable)
- Docker with Compose v2, or Podman with its docker shim

## Local development

```bash
pnpm install
pnpm dev:up
```

`pnpm dev:up` (scripts/dev.sh) runs these steps:

1. Starts PostgreSQL and Redis as compose project `pricelens-dev`, on 127.0.0.1 only.
2. Waits for them to be healthy.
3. Applies migrations to `pricelens_dev` and `pricelens_test`.
4. Seeds a 240-product demo catalog if the dev database is empty.
5. Runs the API on http://localhost:3001 (Swagger at `/docs`) and the web app on http://localhost:3000. Ctrl-C stops both.

It uses the committed `.env.development`: local values, with **every store connector, scheduled scrape and paid API turned off**, so development never hits real stores. Override with `ENV_FILE`, `API_PORT`, `WEB_PORT`, or `SKIP_SEED=1`.

`.env.example` documents every variable the apps read. The API validates its environment at startup and refuses to boot, listing every problem, if something is missing or malformed.

## Tests

| Command | What | Needs |
|---|---|---|
| `pnpm --filter @pricelens/api test:unit` | API unit tests | nothing |
| `pnpm --filter @pricelens/api test:integration` | Raw SQL and auth against a real database | dev stack |
| `pnpm --filter @pricelens/api test:e2e` | Smoke: health, a real matching-pipeline run, search, product, auth | dev stack |
| `pnpm --filter @pricelens/web test` | Component tests (Vitest) | nothing |
| `pnpm --filter @pricelens/web test:e2e` | Browser smoke tests (Playwright), desktop + mobile | `pnpm dev:up` running |

API tests load the committed `.env.test`. They **refuse to run** unless the database is local and its name ends in `_test`, so they can never touch a real database. Run `pnpm test:db:migrate` after adding migrations.

Before pushing: `pnpm lint`, `pnpm typecheck`, `pnpm build`.

## Useful scripts

| Script | Does |
|---|---|
| `pnpm docker:up` / `docker:down` / `docker:reset` | Dev infrastructure only (`pricelens-dev`). `reset` deletes the dev volumes. |
| `pnpm db:migrate` / `db:seed` / `db:studio` | Prisma against the root `.env` |
| `pnpm --filter @pricelens/api lint:fix` | ESLint with autofix (`lint` only checks) |
| `apps/api/scripts/ops/` | Manual tools for store logins, CAPTCHAs and broken connectors (see its README) |

The seed refuses `SEED_GENERATE_PRODUCTS=true` and `SEED_RESET=true` when `NODE_ENV=production`.

## Production

The live server runs `docker-compose.server.yml` behind `pricelens-proxy` (nginx, ports 80/443). Deploys go through blue/green scripts:

```bash
./scripts/deploy-api.sh   # build, migrate, swap; prints the rollback command
./scripts/deploy-web.sh
```

The API container applies pending migrations on start (`docker/entrypoint.api.sh`).
