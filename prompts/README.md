# PriceLens — Overhaul Prompts

Put this folder in the repo root as `prompts/`.

## How to run
- One phase per FRESH agent session. Never run two phases in parallel.
- Start each session with:
  `Read prompts/_SHARED_RULES.md, then execute prompts/<file>.md`
- Commit + git tag after each phase (e.g. `phase-03-done`) so you can roll back.
- Don't start a phase until the previous one meets its Definition of Done.
- For big phases, add: "Stop after the audit and wait for my OK before fixing."

## Order (and why)
| # | File | Why here |
|---|------|----------|
| 00 | 00-baseline.md | Get it running + tests as a safety net. Nothing else is safe without this. |
| 01 | 01-architecture.md | Foundation. Changing structure later breaks everything built on top. |
| 02 | 02-logic.md | Business correctness (matching, prices). Wrong logic = wrong product, however pretty. |
| 03 | 03-backend.md | API, DB, queues, search on top of a correct core. |
| 04 | 04-security.md | Audit the final backend surface, not one that's still changing. |
| 05 | 05-frontend.md | Frontend code health against a stable API. |
| 06 | 06-ux.md | Flows, placement, states. Structure before visuals. |
| 07 | 07-ui.md | Visual design system on top of the right structure. |
| 08 | 08-optimization.md | Optimize after features are stable, with real measurements. |
| 09 | 09-seo.md | Needs final pages, final URLs, and good performance. |
| 10 | 10-devops-observability.md | CI, logging, monitoring, backups to keep all of the above from regressing. |
| 11 | 11-final-qa.md | Fresh-eyes verification that every "fixed" item is actually fixed. |

Each phase writes `audit/NN-<name>.md` and reads the previous ones, so context carries over.
