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
- npm 10 or newer
- Docker Desktop or Docker Engine with Compose v2
- PostgreSQL client tools are optional but useful for debugging

## Local Development Setup

### 1) Install dependencies

From the repository root:

```bash
npm install
```

### 2) Start local infrastructure

Bring up PostgreSQL, Redis, and Meilisearch:

```bash
npm run docker:up
```

This uses `docker-compose.yml` and starts:

- PostgreSQL on `localhost:5432`
- Redis on `localhost:6379`
- Meilisearch on `localhost:7700`

If you want to stop the services later:

```bash
npm run docker:down
```

To reset the local volumes and start fresh:

```bash
npm run docker:reset
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

- `npm run db:generate`
- `npm run db:migrate`
- `npm run db:seed`

Typical local order:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

Important:

- `scripts/init-db.sql` enables the PostgreSQL extensions the platform needs: `uuid-ossp`, `vector`, `pg_trgm`, and `btree_gin`.
- In this snapshot, `apps/api/prisma/schema.prisma` is empty, so Prisma commands will not succeed until the schema is populated.
- If you are working from a later branch or a fuller code drop, run the commands above after the schema exists.

### 5) Start the API

Run the API in watch mode:

```bash
npm run dev
```

The server should be available at:

- API: `http://localhost:3001`
- Swagger UI: `http://localhost:3001/docs`

## Production Build

### 1) Build the workspace

```bash
npm run build
```

### 2) Run database migrations

Use the production-safe Prisma deploy command:

```bash
npm run db:migrate
```

### 3) Seed only if you need the built-in demo accounts

```bash
npm run db:seed
```

The seed script creates sample admin and moderator accounts:

- `admin@pricelens.dev` / `admin_dev_password_change_me`
- `mod@pricelens.dev` / `moderator_dev_password`

Do not keep those passwords in a real deployment.

### 4) Run the app

In a bare-metal deployment, start the compiled API:

```bash
npm run start
```

If you plan to use `docker-compose.prod.yml`, note the following:

- The file references `docker/Dockerfile.api` and `docker/Dockerfile.web`
- Those Dockerfiles are not present in this repository snapshot
- Add the missing Dockerfiles before relying on the production compose stack

## Available Scripts

From the repository root:

- `npm run dev` - run all workspace apps in watch mode
- `npm run build` - build all workspace apps
- `npm run test` - run all tests
- `npm run test:unit` - run unit tests
- `npm run test:integration` - run integration tests
- `npm run test:e2e` - run e2e tests
- `npm run lint` - lint all workspace apps
- `npm run typecheck` - run TypeScript type checking
- `npm run clean` - remove build artifacts and root `node_modules`
- `npm run db:generate` - generate Prisma client
- `npm run db:migrate` - deploy Prisma migrations
- `npm run db:seed` - seed the database
- `npm run db:studio` - open Prisma Studio
- `npm run docker:up` - start local infra services
- `npm run docker:down` - stop local infra services
- `npm run docker:reset` - stop local infra services and remove volumes

## Testing

Recommended test sequence during development:

```bash
npm run test:unit
npm run test:integration
npm run test
```

You can also run the broader checks before a release:

```bash
npm run lint
npm run typecheck
npm run build
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

1. Start infra with `npm run docker:up`
2. Add `apps/api/.env.local`
3. Restore or create the Prisma schema and migrations
4. Run `npm run db:generate`
5. Run `npm run db:migrate`
6. Run `npm run db:seed`
7. Start the API with `npm run dev`
8. Open `http://localhost:3001/docs`


## End-to-End Commands (Fresh Setup → Production Ready)

Use this exact command sequence from a clean clone to a production-ready build and run:

```bash
# 1) Install dependencies
npm install

# 2) Start required local infrastructure (PostgreSQL, Redis, Meilisearch)
npm run docker:up

# 3) Create API env file (first time only)
cp apps/api/.env.example apps/api/.env.local
# If .env.example is empty in your snapshot, open apps/api/.env.local and fill values from this README.

# 4) Prepare database
npm run db:generate
npm run db:migrate
npm run db:seed

# 5) Run quality gates
npm run lint
npm run typecheck
npm run test

# 6) Build production artifacts
npm run build

# 7) Start in production mode
npm run start
```

Optional shutdown/reset commands:

```bash
npm run docker:down   # stop infra
npm run docker:reset  # stop infra + delete volumes
```
