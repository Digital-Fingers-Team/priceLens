# 0003. Search stays in Postgres; Meilisearch is removed

Date: 2026-09-25 · Status: Accepted · Phase 01 (owner decision D-1, delegated)

## Context

A Meilisearch container ran in production and in the dev stack, but no code used it: search has always been Postgres (`ILIKE` + `pg_trgm` + a relevance score in SQL, `ProductsService.searchProducts`). Its client library was removed in phase 00 without effect. The web still carried a Meilisearch-shaped `_formatted` highlight field, rendered as raw HTML (a stored-XSS path for scraped titles).

Measured in phase 01:
- the production container: 26.8 MB, idle, holding an index nothing writes to;
- Postgres search on a throwaway database with 5,000 products and 37,500 listings: common queries 0.5-0.7 s p50, and the time is in the SQL (~0.4-0.5 s per query), not in the API.

## Decision

Remove Meilisearch from the code, config, compose files and dev stack. Postgres stays the only store of record *and* the only search index.

A second search store would need a sync strategy this codebase doesn't have (outbox or change capture, retries, full reindex, drift detection) for data whose whole point is being current: a search result showing a price the product page no longer has is a correctness bug for a price-comparison product.

## Consequences

- Search latency is a known problem, owned by phase 08: query plan, query shape and indexes first (for example trigram GIN indexes on the searched columns).
- Revisit this decision only with numbers: if a tuned Postgres query cannot reach the target (proposed: p95 under 300 ms at the production catalog size), or users need typo tolerance that `pg_trgm` similarity can't give. The replacement would then come with an outbox-based sync and a full-reindex path from day one.
- The production container and its volume are left running until the owner stops them (audit 01, D-8). Removing the service from `docker-compose.server.yml` doesn't stop it; `deploy-api.sh` only starts `api` and `proxy`.
