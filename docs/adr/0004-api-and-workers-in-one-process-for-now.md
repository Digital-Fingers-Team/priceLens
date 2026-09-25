# 0004. API and workers stay in one process for now; split by role later

Date: 2026-09-25 · Status: Accepted (interim) · Phase 01

## Context

The `pricelens-api` container runs the HTTP API, every Bull worker (scrapes, coverage sweeps, reconciliation, alerts, billing and brand jobs) and a headful Chrome in one Node process. Audit 00 measured it at about 4 GB RSS and over 100% CPU. A long scrape competes with request handling, and a crash in a worker takes the API down.

Bull also runs up to one job per registered handler at once (12 on the `ingestion` queue), so several scrapes can run in parallel against the same browser.

## Decision

Keep one process in phase 01. Splitting is a deployment change (a second service, its health check, the deploy scripts, memory limits on a shared 10 GB box) and belongs with the deploy work in phase 10.

The target, prepared by this phase's structure:
- one image, started in one of two roles by an env flag: `api` (HTTP only, producers only: `IngestionQueue` needs no worker code) or `worker` (processors, scheduler, Chrome);
- the queue contract in `workers/ingestion.jobs.ts` is already the only thing both sides share;
- scrape jobs get their own queue with concurrency 1 (or a small fixed number), so a sweep and on-demand scrapes stop competing for the browser; the cheap operational jobs keep theirs.

## Consequences

- Until the split, a heavy scrape can slow the API. The coverage sweep's own overlap guard stays the only protection.
- Phase 08 measures the contention (browser contexts, CPU) to size the worker; phase 10 implements the role flag and the second service.
