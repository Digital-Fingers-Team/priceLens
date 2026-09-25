# Phase 00 — Baseline & safety net

Goal: the whole monorepo runs locally from a clean clone, and there's a test harness to catch regressions in later phases. Do NOT refactor in this phase.

## Do
1. Map the repo: apps, packages, services, scripts, env vars, ports, external services (stores/scrapers/APIs). Write `PROJECT_MAP.md` (with a mermaid diagram).
2. Make it run: docker compose for Postgres(+pgvector), Redis, Meilisearch. One command to start everything. Fix ONLY what blocks running.
3. `.env.example` complete and documented. Env validated at startup (fail fast with a clear message).
4. Typecheck, lint, build every package. Record every error and fix blockers.
5. Test harness: Jest (API), Vitest or Jest (web), Playwright (e2e). Add smoke tests for: API health, search returns real results, product page loads, auth login/logout, one matching-pipeline run.
6. Realistic seed script for local dev only (clearly separated from production code paths).
7. Junk hunt (list everything, remove what's clearly junk):
   - demo/mock fallbacks in production paths, hardcoded data, `if (!data) return fakeData`
   - TODO/FIXME, console.log, commented-out blocks
   - unused files, exports, deps (use knip or depcheck)
   - duplicate utilities doing the same thing
   - broken or deep relative imports
   - circular deps (madge)

## Definition of done
Clean clone → one command → everything up. All checks green. Smoke tests pass. `PROJECT_MAP.md` + `audit/00-baseline.md` written.
