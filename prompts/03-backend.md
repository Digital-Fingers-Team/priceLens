# Phase 03 — Backend (NestJS, Prisma, Redis, BullMQ, Meilisearch)

## API
- Consistent REST naming, correct status codes, one error format, cursor pagination on lists, consistent filter/sort params.
- Every input validated with DTOs (class-validator, whitelist + forbidNonWhitelisted) or zod. No unvalidated body/query/params.
- Response DTOs: never return raw Prisma entities (no leaking internal fields).
- OpenAPI/Swagger generated and accurate. Shared types for the web client.

## Database
- Find N+1 queries; use select/include deliberately.
- Indexes for every hot query (verify with EXPLAIN ANALYZE, record plans).
- pgvector: right index type (HNSW/IVFFlat) and distance metric for how embeddings are used.
- Transactions where multiple writes must succeed together.
- Migrations clean, ordered, reproducible from zero. No drift between schema and DB.
- Constraints in the DB (unique, FK, not null), not only in code.

## Redis / BullMQ
- TTLs on every cache key; key naming convention; no unbounded growth.
- Jobs: retries with backoff, idempotency keys, sensible concurrency, stalled-job handling, graceful shutdown (no lost jobs on deploy).
- Redis connection resilient (no crash on startup if Redis is slow; reconnect logic).

## Meilisearch
- searchable / filterable / sortable attributes set correctly; ranking rules intentional.
- Arabic handling: normalization, synonyms, typo tolerance tested with real Arabic queries.
- Empty query must work (no blocked empty-query behavior).
- Sync with Postgres reliable; full reindex command exists.

## External calls (stores/scrapers)
- Timeouts on every outbound call, retries with backoff, per-store rate limiting, circuit breaking for failing stores.
- One failing store never breaks the whole pipeline or page.

## Ops basics
- Health/readiness endpoints checking DB, Redis, Meili.
- Structured logs with request IDs.

## Definition of done
Integration tests for every endpoint. OpenAPI accurate. Query plans recorded for hot paths. `audit/03-backend.md` written.
