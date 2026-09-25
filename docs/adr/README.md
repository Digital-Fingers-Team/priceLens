# Architecture decision records

One file per decision: context, the decision, and what it costs. A record is never rewritten after it is accepted; a later decision that changes it gets its own record and marks the old one superseded.

| # | Decision | Status |
|---|---|---|
| [0001](0001-matching-pipeline-as-pure-steps.md) | The matching pipeline is ten pure steps behind ports, pinned by a characterization suite | Accepted |
| [0002](0002-shared-contracts-as-declaration-files.md) | Shared API contracts live in a declaration-only package | Accepted |
| [0003](0003-search-stays-in-postgres.md) | Search stays in Postgres; Meilisearch is removed | Accepted |
| [0004](0004-api-and-workers-in-one-process-for-now.md) | API and workers stay in one process for now; split by role later | Accepted (interim) |
| [0005](0005-one-error-envelope.md) | One error envelope for every failure; domain errors carry codes | Accepted |
| [0006](0006-store-adapters-behind-a-registry.md) | Store adapters are registered in one list; the core never names a store | Accepted |
