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

## Carried over (recorded 2026-09-26)
- **D-14 (left as is):** per-color GTINs keep some colors as separate products. Revisit with data now that the color filter exists (phase 06).
- Re-check every "Decisions for Baraa" item in audit/00–10 and list anything still open for the owner.

## Carried over (recorded 2026-09-27, end of phase 09)
- Lenovo parser bug (skipped in the D-12 repair, audit 07 handoff).
- 9,126 of 16,480 products have no accepted listing at all (audit 07): should they be listed or searchable?
- High Total Blocking Time on every page (audit 08 P-13): the search page is one big client component; move what can be server components. Budget for home JS is met (158 kB).
- Server-generated English text in the Arabic UI (intelligence reasons, plan names, some API errors): message codes instead (audit 07).
- Google Search Console (owner, audit 09 SEO-16): soft-404 cleanup; submit the new sitemap (categories + hreflang).
- Open decisions to re-check at the end: D-31 (proxy source IPs, if not done in phase 10), D-14, and the FYIs in audit/07-09.
