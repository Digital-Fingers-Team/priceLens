# 0001. The matching pipeline is ten pure steps behind ports

Date: 2026-09-25 · Status: Accepted · Phase 01

## Context

Matching a scraped listing to a canonical product is the core of PriceLens. It lived as private methods of a 1,555-line `LiveIngestionService`, interleaved with Prisma calls, with no unit tests; the only coverage was one e2e run with three listings. Phase 02 has to fix wrong merges (F-17: RAM variants merged), and every such fix meant editing that class blind.

## Decision

- Each decision is a pure function in `apps/api/src/matching/pipeline/steps/`, numbered 1-10 in the order they run, with explicit input and output types. Every threshold and word list is in `pipeline/thresholds.ts`.
- Steps that need I/O take it as a parameter: FX conversion is passed in; candidate lookup and the LLM judge are ports (`CandidateSource`, `SameProductJudge`) given to `findCanonicalMatch` (steps 6-9).
- `ListingProcessor` (scraping) runs the steps and persists; `IngestionRepository` holds every query. The step functions never import Prisma.
- A **characterization suite** (`test/e2e/matching-characterization.e2e-spec.ts`) runs about 60 listings through the real pipeline and database and snapshots every outcome. It was recorded against the pre-refactor code; the refactor left it byte-for-byte unchanged. From now on a matching change updates the snapshot deliberately, and the snapshot diff is what gets reviewed.

## Consequences

- Each step is unit-tested alone (`test/unit/matching-pipeline.spec.ts`), with the real normalizer and fuzzy matcher (both stateless).
- Phase 02 can change one step, see its unit tests and the characterization diff, and nothing else.
- Listings whose RAM can't be read are left out of the snapshot: they tie across RAM variants and the winner depends on row order Postgres doesn't fix. Phase 02 makes that deterministic, then adds them.
- `ReconciliationService` still has its own guard list, which differs from step 8. Aligning them changes outcomes, so it is phase 02's.
