# PriceLens

PriceLens is a monorepo for a price comparison engine that aggregates product listings from multiple shopping sources, matches them into canonical products, and exposes search, pricing, and moderation workflows through a NestJS API.

## Current Repository Layout

- `apps/api` - NestJS backend, matching services, auth, Prisma, and tests
- `scripts/init-db.sql` - PostgreSQL bootstrap script for required extensions
- `docker-compose.yml` - Local infrastructure for PostgreSQL, Redis, and Meilisearch
- `docker-compose.prod.yml` - Production compose stack template
- `package.json` - Root workspace scripts

## What Runs In This Snapshot

This workspace currently contains the API app under `apps/api`.

- The API starts on port `3001` by default.
- Swagger docs are available at `/docs` in non-production environments.
- PostgreSQL, Redis, and Meilisearch are expected to run alongside the API.

## Prerequisites

Install these before running the project:

- Node.js 20 or newer
- pnpm 11.4.0 or newer (Corepack-enabled)
- Docker Desktop or Docker Engine with Compose v2
- PostgreSQL client tools are optional but useful for debugging

## Local Development Setup

### 1) Install dependencies

From the repository root:

```bash
pnpm install
```

### 2) Start local infrastructure

Bring up PostgreSQL, Redis, and Meilisearch:

```bash
pnpm docker:up
```

This uses `docker-compose.yml` and starts:

- PostgreSQL on `localhost:5432`
- Redis on `localhost:6379`
- Meilisearch on `localhost:7700`

If you want to stop the services later:

```bash
pnpm docker:down
```

To reset the local volumes and start fresh:

```bash
pnpm docker:reset
```

### 3) Create the API environment file

The checked-in `apps/api/.env.example` file is empty in this snapshot, so create `apps/api/.env.local` manually.

Use values like these for local development:

```env
NODE_ENV=development
PORT=3001
API_PREFIX=api/v1
FRONTEND_URL=http://localhost:3000

DATABASE_URL=postgresql://pricelens:pricelens_dev_password@localhost:5432/pricelens_dev?schema=public

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=pricelens_redis_dev
REDIS_DB=0
REDIS_URL=redis://:pricelens_redis_dev@localhost:6379/0

MEILISEARCH_URL=http://localhost:7700
MEILISEARCH_KEY=pricelens_meili_dev_key

JWT_ACCESS_SECRET=change-me-access-secret
JWT_REFRESH_SECRET=change-me-refresh-secret
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

THROTTLE_TTL=60000
THROTTLE_LIMIT=100
THROTTLE_LIMIT_AUTH=500
LOG_LEVEL=debug

OPENAI_API_KEY=
```

Notes:

- The app reads `MEILISEARCH_KEY` and also accepts `MEILISEARCH_MASTER_KEY` as a fallback.
- `REDIS_URL` is included for convenience, even though the current code path mainly uses the host/port/password fields.
- Keep the JWT secrets strong in any non-local environment.

### 4) Initialize the database

The repository includes Prisma scripts at the root:

- `pnpm db:generate`
- `pnpm db:migrate`
- `pnpm db:seed`

Typical local order:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Important:

- `scripts/init-db.sql` enables the PostgreSQL extensions the platform needs: `uuid-ossp`, `vector`, `pg_trgm`, and `btree_gin`.
- In this snapshot, `apps/api/prisma/schema.prisma` is empty, so Prisma commands will not succeed until the schema is populated.
- If you are working from a later branch or a fuller code drop, run the commands above after the schema exists.

### 5) Start the API

Run the API in watch mode:

```bash
pnpm dev
```

The server should be available at:

- API: `http://localhost:3001`
- Swagger UI: `http://localhost:3001/docs`

## Production Build

### 1) Build the workspace

```bash
pnpm build
```

### 2) Run database migrations

Use the production-safe Prisma deploy command:

```bash
pnpm db:migrate
```

### 3) Seed only if you need the built-in demo accounts

```bash
pnpm db:seed
```

The seed script creates sample admin and moderator accounts:

- `admin@pricelens.dev` / `admin_dev_password_change_me`
- `mod@pricelens.dev` / `moderator_dev_password`

Do not keep those passwords in a real deployment.

### 4) Run the app

In a bare-metal deployment, start the compiled API:

```bash
pnpm start
```

If you plan to use `docker-compose.prod.yml`, note the following:

- The file references `docker/Dockerfile.api` and `docker/Dockerfile.web`
- Those Dockerfiles are not present in this repository snapshot
- Add the missing Dockerfiles before relying on the production compose stack

## Available Scripts

From the repository root:

- `pnpm dev` - run all workspace apps in watch mode
- `pnpm build` - build all workspace apps
- `pnpm test` - run all tests
- `pnpm test:unit` - run unit tests
- `pnpm test:integration` - run integration tests
- `pnpm test:e2e` - run e2e tests
- `pnpm lint` - lint all workspace apps
- `pnpm typecheck` - run TypeScript type checking
- `pnpm clean` - remove build artifacts and root `node_modules`
- `pnpm db:generate` - generate Prisma client
- `pnpm db:migrate` - deploy Prisma migrations
- `pnpm db:seed` - seed the database
- `pnpm db:studio` - open Prisma Studio
- `pnpm docker:up` - start local infra services
- `pnpm docker:down` - stop local infra services
- `pnpm docker:reset` - stop local infra services and remove volumes

## Testing

Recommended test sequence during development:

```bash
pnpm test:unit
pnpm test:integration
pnpm test
```

You can also run the broader checks before a release:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## API Behavior

- Global validation is enabled with NestJS `ValidationPipe`
- Responses are normalized through global interceptors
- Prisma errors are mapped through a global exception filter
- Rate limiting is enabled through `@nestjs/throttler`
- Redis-backed caching and Bull job queues are wired into the application module
- Swagger is only enabled when `NODE_ENV !== production`

## Matching Engine Notes

The project is designed around canonical products and layered matching.

- Exact identifiers such as GTIN, UPC, EAN, MPN, and SKU should take priority when present
- Structured attributes should be extracted before fuzzy or semantic matching is used
- Accessories should not be merged into a main product
- Variants such as storage, RAM, and model trims should stay separate
- Every accept/reject decision should leave an audit trail

## Known Gaps In This Snapshot

This README reflects the repository as it exists in this workspace.

- `apps/api/.env.example` is empty
- `apps/api/prisma/schema.prisma` is empty
- `docker-compose.prod.yml` references Dockerfiles that are not present in the repo
- There is no frontend app checked into `apps/` yet

If you are continuing the project, fill those pieces in before treating the production stack as complete.

## Suggested Local Workflow

1. Start infra with `pnpm docker:up`
2. Add `apps/api/.env.local`
3. Restore or create the Prisma schema and migrations
4. Run `pnpm db:generate`
5. Run `pnpm db:migrate`
6. Run `pnpm db:seed`
7. Start the API with `pnpm dev`
8. Open `http://localhost:3001/docs`


## End-to-End Commands (Fresh Setup → Production Ready)

Use this exact command sequence from a clean clone to a production-ready build and run:

```bash
# 1) Install dependencies
pnpm install

# 2) Start required local infrastructure (PostgreSQL, Redis, Meilisearch)
pnpm docker:up

# 3) Create API env file (first time only)
cp apps/api/.env.example apps/api/.env.local
# If .env.example is empty in your snapshot, open apps/api/.env.local and fill values from this README.

# make this if first time for database
# cd apps/api
# pnpm --dir apps/api exec prisma migrate dev --name init
# 4) Prepare database
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# 5) Run quality gates
pnpm lint
pnpm typecheck
pnpm test

# 6) Build production artifacts
pnpm build

# 7) Start in production mode
pnpm start
```

Optional shutdown/reset commands:

```bash
pnpm docker:down   # stop infra
pnpm docker:reset  # stop infra + delete volumes
```
```bash
if the port is busy in backend :

Get-NetTCPConnection -LocalPort 3001 -State Listen | Select-Object -Expand OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
```