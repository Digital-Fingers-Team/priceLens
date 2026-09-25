# PriceLens — Project map

Written in phase 00 (2026-09-25) from the code at tag `phase-00-start`. Describes what exists, not what is intended.

## System

```mermaid
flowchart LR
  user((Browser)) -->|443| proxy[pricelens-proxy<br/>nginx 1.27]
  proxy -->|/| web[pricelens-web-blue/green<br/>Next.js 14 :3000]
  proxy -->|/api/| api[pricelens-api<br/>NestJS :3001<br/>+ Xvfb + Chrome]
  web -->|SSR: API_INTERNAL_URL| api
  api --> pg[(pricelens-postgres<br/>pg16 + pgvector, pg_trgm)]
  api --> redis[(pricelens-redis<br/>db0 cache · db1 Bull queues)]
  meili[(pricelens-meilisearch<br/>running, NOT used by code)]
  api -->|patchright / HTTP| stores{{Stores: Amazon, Noon, Jumia,<br/>Carrefour, 2B, Elaraby,<br/>Alibaba, AliExpress}}
  api --> ext{{OpenRouter embeddings · FX rates API<br/>Stripe · SMTP · Telegram · Impact}}
```

## Repo layout

| Path | What |
|---|---|
| `apps/api` | NestJS 10 API **and** the Bull workers (same process). Prisma 5.22. ~19.4k lines of TS in `src`. |
| `apps/api/prisma` | `schema.prisma` (1,143 lines), 11 migrations, `seed.ts` → `seed/seed.ts` |
| `apps/api/seed` | Synthetic catalog generator (profiles demo/medium/full), `purgeDemoProducts.ts`, affiliate config seed |
| `apps/api/scripts` | 23 one-off ops/diagnostic scripts (backfills, merges/unmerges, store probes, captcha solve). Not wired to any package script except `login-store.ts`. |
| `apps/api/test` | 21 unit specs (Jest), 2 integration specs (need a real DB) |
| `apps/web` | Next.js 14.2 App Router, React Query, Zustand, Tailwind, Recharts. ~9.6k lines. No tests. |
| `packages/` | Declared in `pnpm-workspace.yaml`; does not exist. No shared package between api and web. |
| `docker/` | `Dockerfile.api`, `Dockerfile.web`, `entrypoint.api.sh` (Xvfb, optional noVNC, `migrate deploy`), `nginx.prod.conf`, `nginx-upstreams/` (untracked, generated) |
| `scripts/` | `deploy-api.sh`, `deploy-web.sh` (blue/green), `sync-web-upstream.sh`, `renew-cert.sh`, `sync-push.sh`, `init-db.sql` |
| `docker-compose.yml` | Dev infra (pg/redis/meili). **Shares compose project + volume names with prod on this server — see audit 00 F-01.** |
| `docker-compose.server.yml` | What actually runs in prod on this server |
| `docker-compose.prod.yml` | Generic prod variant (not used here) |
| `prompts/`, `audit/` | Overhaul phase prompts and their audit reports |

## API modules (`apps/api/src`)

auth · products · search (controller only; delegates to `ProductsService`) · matching (normalizer, fuzzy, semantic, price-sanity, reconciliation, fx-rates) · scraping (10 connectors, browser session, bot-wall, `LiveIngestionService`) · workers (Bull scheduler + processor) · prices · watchlist (+ price alerts) · admin · affiliate · billing (Stripe, plans, entitlements) · notifications (email, Telegram) · intelligence (price stats, deal score, fake-discount) · deal-hunter · seller · brand (MAP, distribution, launches, reports) · public-api (API keys) · common · config · database.

Search is Postgres (`ILIKE` + `pg_trgm` + scoring in `products.service.ts`), not Meilisearch. A zero-result search enqueues a live scrape.

## Background jobs (Bull, Redis db 1, registered in `workers/ingestion.scheduler.ts`)

| Job | Default cron |
|---|---|
| live ingestion | `0 */6 * * *` |
| reconciliation | `0 * * * *` |
| store coverage sweep | `30 */2 * * *` |
| price alerts | `*/30 * * * *` |
| notification retry | `*/15 * * * *` |
| subscription maintenance | `17 * * * *` |
| competitor detection | `45 */3 * * *` |
| MAP sweep | `50 */3 * * *` |
| launch detection | `20 */6 * * *` |
| weekly reports | `0 6 * * 1` |
| affiliate conversion poll | `AFFILIATE_CONVERSION_POLL_CRON` |

## Ports

| Where | Port | Service |
|---|---|---|
| prod host | 80, 443 | pricelens-proxy |
| prod host | 3002 → 3001 | pricelens-api (published on all interfaces) |
| prod internal | 3000 | web container |
| dev (`docker-compose.yml`) | 5432, 6379, 7700 | pg / redis / meili (all interfaces) |
| dev | 3000 / 3001 | `next dev` / `nest start` |
| same host, not PriceLens | 3001 (aradobot-web), 4000, 27017, 8091, 11434 | other projects |

## Environment

Root `.env` is shared by api and web. `.env.example` documents most variables. 20 variables read by the code are missing from it (listed in audit 00 F-09). Groups: app/ports · DB/Redis/Meili · JWT · retailers (per-store `*_ENABLED`, crons, coverage) · FX · embeddings (`OPENAI_API_KEY` against OpenRouter) · billing (Stripe) · notifications (SMTP, Telegram) · affiliate (Impact, salts) · seed (`SEED_*`).

## Commands (as they exist today)

| Command | Does | Caveat |
|---|---|---|
| `pnpm install` | install (pnpm 11.4.0 via `packageManager`) | host pnpm is 10.x; use `npx pnpm@11.4.0` |
| `pnpm typecheck` / `lint` / `build` / `test` | turbo pipelines | api `lint` runs `--fix`; api tests load root `.env` (prod on the server) |
| `pnpm db:migrate` / `db:seed` | Prisma against root `.env` | root `.env` on the server is **production** |
| `pnpm docker:up` / `docker:reset` | dev infra | **collides with prod volumes on this server** |
| `scripts/deploy-api.sh`, `scripts/deploy-web.sh` | build image, blue/green swap | |
