# AI contributor contract — RateMyGuidePNW × Chrome-AI

**Principal/product owner:** repository owner. **Integration lead:** ChatGPT, working in this repository through connected GitHub/Vercel tools. **Independent contributors:** Grok (bounded coding tasks) and Gemini Pro (source-cited research). Grok's output is accepted only through GitHub review; Gemini's memo is reviewed for citations and converted into separate implementation tickets. No model has permission to redefine scope, publish without review or alter private research automatically.

## Current integration base

- Shared integration branch: `feature/reviewed-noaa-chinook-scatter`.
- Parent PR: **#10**, base `main`. This branch is intentionally work-in-progress and must not be merged before all gates pass.
- Frozen historical inputs: independently reviewed WDFW 31-day Aug 2026 retained Chinook per sampled angler, independently reviewed NOAA CO-OPS Astoria high/low *astronomical predictions*; public-only source artifacts `data/chinook-2026-reviewed.json` and `data/noaa-astoria-2026-reviewed.json`.
- Scientific claim: exploratory unadjusted 31-day correlation around **−0.17**, **not** current speed, salmon bite predictions, a causal tidal effect, guide quality, or prospective 2027 model accuracy.

## Isolation rules

- Each agent creates its **own** short-lived `agent/<provider>-<task>` branch from the shared integration branch.
- Each agent opens a **draft PR targeting `feature/reviewed-noaa-chinook-scatter`**, not `main`; include the issue number, tests, changed file list, and limitations.
- No force pushes to `main` or parent integration branch. Never auto-merge the WDFW or NOAA bot review queues.
- **Grok science ticket #11:** independent scientific/methodology QA and targeted test coverage on `agent/grok-tide-qa`; no frontend edits.
- **Grok frontend ticket #13:** scoped chart CSS / accessibility on `agent/grok-tide-ui`; no model math, source data or test-script edits.
- **Gemini research ticket #12:** source-cited environmental-data and anonymous-review trust research; no GitHub write access required, no direct code edits. The principal can paste Gemini's memo for independent verification.
- **ChatGPT:** cross-branch conflict resolution, code review, data integrity, CI and Vercel checks, main-branch integration; no claims of reviewing work that has not appeared in GitHub.
- **Principal:** approves changes to public product claims, scope, company identity, ranking policy, DNS/domain and production monetization.

## Hard security/science constraints

1. Do not read or commit secrets, API credentials, raw private Chrome-AI Supabase data, source blobs or reviewer private identities. Use public official-source links and reviewed release artifacts only.
2. Chinook only for model V1. Do not blend coho, sockeye or steelhead outcomes into the target.
3. No paid ranking advantage, bought review removal, fabricated guide ratings, testimonials or prospective 2027 skill claims. Reviews do not train the Chinook model.
4. Preserve preliminary-agency-sample denominators, source provenance, missing/closed/zero distinctions, accurate official regulations caveat and NOAA time zone/datum.
5. NOAA Astoria daily max predicted H minus min predicted L is **not** adjacent exchange, real water level, Columbia River flow, or an explanation of fish biting.
6. Don't change GoDaddy DNS, Vercel production settings, private database schema, authenticated review tables, billing or customer data.
7. Run and report relevant tests. On success, provide actual CI run or local command output; never invent pass status.

## Merge gates

- Grok science tests and review conclusions accepted or documented as issues
- Grok UI work #13 accepted, or any remaining layout work completed and independently reviewed by ChatGPT
- Gemini research #12 has been reviewed and relevant evidence turned into separate follow-up issues; it is not a blocker for existing source-verified historical visualization
- `npm run test:intel` and `npm run typecheck`, Python agency-source tests, and `npm run build` pass
- Page preview checked on mobile and desktop
- Release is public-safe, independently supported, and scientifically cautious
- Principal remains the final product/release decision-maker

## Principal design decision, November 13, 2026

The existing deep-teal, warm-gold RateMyGuidePNW Chinook page aesthetic is approved. Gemini's screenshot suggestions are optional critique, not an instruction to rename Chrome-AI, restructure the full header, imply live telemetry or redesign the site. The active integration goal remains a usable, scientifically careful historical tide/scatter section, not a wholesale brand refresh.

## Provider access

Neither ChatGPT nor the GitHub connector can automatically invoke an external Grok/Gemini chat. A GitHub ticket is the shared task specification, **not evidence of a task running**. Grok may make changes if its user-connected GitHub integration actually grants write access; otherwise request a unified patch with base SHA. Gemini provides cited text through the principal, which ChatGPT can verify and implement. Do not claim work has started or finished without a real repository commit or supplied output.
