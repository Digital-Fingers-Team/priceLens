# Shared rules — read before EVERY phase

## Project context
PriceLens: price comparison product.
Turborepo monorepo: NestJS API + Next.js 14 (App Router) web, PostgreSQL + pgvector via Prisma, Redis, BullMQ, Meilisearch.
Core asset: a 10-step product matching pipeline.
Brand: green + grey, glassy "bubble" identity, sharp and minimal taste. Logo/brand in Figma file kM9Op5Emb7vvi7UiH3lrRG.
History: previous AI agents introduced broken import paths, Redis startup crashes, injected demo-data fallbacks, a blocked empty-query search hook, and broken auth DTOs. Assume more of this exists. Hunt for it.

## Workflow for every phase
1. Read `PROJECT_MAP.md` and every file in `audit/` from earlier phases. Respect their decisions.
2. AUDIT: explore, run, measure. Write `audit/NN-<phase>.md` BEFORE changing code.
   Each finding: location (file:line), problem, why it matters, severity (P0 broken/unsafe · P1 real user/business harm · P2 polish), fix.
3. FIX: P0 → P1 → P2. Small, focused commits with clear messages.
4. VERIFY: after every commit, typecheck + lint + tests + build stay green. Re-run what you changed and see it work.
5. Update the audit file: each finding marked Fixed / Deferred (why) / Needs decision.

## Hard rules
- Stay in your phase's scope. Problems outside it go under "Handoff → phase NN" in your audit file. Don't fix them now.
- NO mock data, demo fallbacks, placeholder content, fake stats, or TODOs. Missing data gets a proper empty/error state.
- NO new dependencies without a one-line justification in the audit. Prefer what's installed.
- NO invented APIs. Check the installed version in package.json and read the real types/docs before using any library API.
- Never silently remove a feature or change product behavior. Log it under "Decisions for Baraa" and continue with other items.
- Never say something works unless you ran it and saw it work. Paste the command/output evidence in the audit.
- Don't rewrite what works just to match your taste. Every change must trace to a finding.
- Delete dead code you're sure is dead; leave a note for anything uncertain.

## Audit file must end with
- Summary (what changed, 5–10 lines)
- Remaining items
- Handoff → other phases
- Decisions for Baraa (questions only the owner can answer, each with your recommendation)
