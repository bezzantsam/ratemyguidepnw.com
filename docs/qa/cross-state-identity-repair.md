# Cross-state identity repair summary

The repair starts at review commit `b481b78bd5a2fa20bad3c1a8a0c9a38024a3fb5e`, based on application commit `60afe401f035639ec4c2cec46143bbaffe80ee7f`. The original independent review remains a historical record. This document is an implementation summary, not independent sign-off.

## Behavior and audit

Before, any research registration pointer became a shared profile and any raw Washington record with one of seven names was discarded. Now an exact source key and Oregon registration need a unique explicit `approved` decision with a reviewer, date, HTTPS evidence URL, and locator. Missing, pending, ambiguous, rejected, malformed, or conflicting decisions fail closed. Consumers resolve the approved decision against an existing source key and research registration; only that exact source enters the shared profile. Source ID allocation alone does not establish identity. This is a structural gate: human review must verify the evidence and identity.

All seven Oregon-linked research entries remain research only: Tony Fisher, Shane Magnuson, Casey Weigel, Marc Bush, Nicholas Ney, Daniel Richman-Benowitz, and Jeffrey Keightley. None was approved by this repair. The two Washington-only research groupings for David Godfrey and Cameron Black are retained as research and do not create a cross-state link. An independent reviewer must investigate each proposed association and its exact source record before any identity decision is approved.

Five raw Washington records had been suppressed and had no allocated public ID. They are retained as explicit exact-key holds, not silently matched or assigned live URLs. The following append-only IDs are **proposals**, subject to source-record review and collision recheck, not approved allocations or identity decisions:

| Source key (name / business / source) | Proposed ID |
| --- | --- |
| Daniel Benowitz / PHD Guide Service / WSGA | `wa-158` |
| Jeffrey Keightley Sr. / Astoria Fishing / WSGA | `wa-159` |
| Marc Bush / Twisted Waters Guide Service / WSGA | `wa-160` |
| Nicholas Ney / Neys Fishing Adventures / WSGA | `wa-161` |
| Tony Fisher / Fishers Catch Outfitters / WSGA/local | `wa-162` |

The raw file has 163 records: 158 existing allocated Washington source records and five held records. The public Washington source count remains 158; approved cross-state profiles change from seven to zero, and the seven Oregon records no longer receive unsupported Washington badges. Shane Magnuson and Casey Weigel have research pointers but no corresponding previously suppressed raw row in this import. All 158 existing allocations are unchanged. If a future reviewed link hides an allocated source from search, its existing Washington URL still resolves. New same-name sources need their own allocation; duplicate source keys fail rather than disappear.

## Validation

- `npm run test:mvp`: 49 passed, including both unchanged regression expectations from the independent review. The old test that expected a different same-name source to disappear now requires an unallocated-key error.
- `npm run test:intel`: 17 passed. `npm run typecheck`: passed. `npm run test:isolation`: 5 passed.
- `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:59999 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=local-test-key NEXT_TELEMETRY_DISABLED=1 npm run build`: passed. The dummy backend was unavailable, so the build logged failed review fetches; no live backend was contacted.
- Both requested isolated browser modes were attempted sequentially against staged source tree `84a270ac2478390992b887c57370858e2d25db3f`: `BROWSER_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/browser-isolation.mjs ordinary 84a270ac2478390992b887c57370858e2d25db3f` and `BROWSER_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' bash scripts/build-fixture-browser.sh 84a270ac2478390992b887c57370858e2d25db3f`. Both stopped before the build because the sandbox denied the mock loopback listener (`listen EPERM 127.0.0.1`). These are **not browser passes**; both modes remain required in an environment that permits owned loopback listeners. The staged tree differs from the final commit only by this repair summary.
- Component rendering tests cover synthetic approved and unresolved links. The ordinary browser test was extended to check all seven real Oregon profiles and directory state, but could not execute here. The initial independent review's browser passes apply to the older review checkpoint only.

No real association was approved, no research was published, and no backend authorization, database, claim, review-submission, deployment, or Chrome.ai files were changed.
