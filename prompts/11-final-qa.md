# Phase 11 — Final QA (fresh eyes)

Act as a skeptical QA lead who didn't write any of this. Trust nothing marked "Fixed" until you verify it.

## Do
1. Read every `audit/*.md`. For each item marked Fixed: re-test it and confirm. Reopen anything that isn't.
2. Check every "Handoff → phase NN" item across all audits was actually handled.
3. Full test suite + matching golden set + e2e at 375/768/1440, both languages, light/dark if present.
4. Manual-style exploratory pass: weird inputs, fast clicking, slow network, offline, back button, refresh mid-flow, very long/Arabic/emoji text.
5. Re-run security checks (gitleaks, npm audit, IDOR attempts, headers) and Lighthouse; compare with phase 04/08 numbers.
6. Grep sweep: TODO, FIXME, console.log, mock, demo, fake, lorem, `any`, hardcoded colors, `$queryRawUnsafe`.

## Output: RELEASE_REPORT.md
- Verdict: Ready / Not ready.
- Blockers (P0/P1) with location.
- Metrics snapshot (performance, matching precision/recall, test counts).
- Consolidated "Decisions for Baraa" from all phases, deduplicated, each with a recommendation.
