# Phase 01 — Architecture

Goal: clear boundaries, predictable structure, easy to change safely.

## Audit
- Module boundaries: NestJS modules cohesive? Circular deps (madge)? God services?
- Layering: controller → service → repository/data-access. No Prisma calls in controllers, no business logic in controllers or UI components.
- Shared code in Turborepo: shared types/DTOs/zod schemas between API and web in a package (single source of truth for contracts)? Package dependency direction clean (apps depend on packages, never the reverse)?
- Matching pipeline: is each of the 10 steps an isolated, pure, individually testable unit with explicit input/output types? Or tangled with I/O?
- Queues (BullMQ): producers/consumers separated, jobs idempotent, retries + backoff, dead-letter handling, clear job naming.
- Data flow: Postgres as source of truth → Meilisearch index sync strategy (how, when, what happens on failure, full reindex path).
- Caching: what is cached where (Redis, Next.js cache), and how is it invalidated when a price changes?
- Config: centralized, typed, validated.
- Error model: one consistent error shape and domain error types across the API.
- Scrapers/store integrations: adapter pattern (one interface, one adapter per store) so adding a store doesn't touch core code?

## Fix
- Restructure incrementally, tests green after every step. No big-bang rewrite.
- Any move that touches more than ~15 files: write the plan in the audit first, then execute step by step.
- Record key decisions as ADRs in `docs/adr/`.

## Definition of done
`ARCHITECTURE.md` (mermaid diagrams: system, data flow, pipeline, queues) matches the code. No circular deps. All checks green.
