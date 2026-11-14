# Atomic captain claims and honest angler review intake — STAGING ONLY

## Purpose

RateMyGuidePNW cannot deliver the founding-guide beta until claims and reviews work with real authenticated users, private identity evidence, human moderation, and published-only reads. The existing Supabase project remains **inactive**. There is **zero production database, migration, hosting, payment or publication activation** in this draft.

This branch addresses an actual failure mode: the old claim client inserted `guide_claims` and then `claim_evidence` in two independent Data API transactions. If the second insert failed, it could leave an orphaned pending claim that the captain could not resubmit. A username, website citation, and verified-trip proof are separate concepts.

## Code contract proposed in this branch

- `components/ClaimForm.tsx` calls one `request_guide_claim(p_guide_id,p_claimant_name,p_business_name,p_public_evidence)` RPC. The claim and private evidence are inserted in one PostgreSQL transaction: success saves both; failure rolls back both. The caller cannot supply claimant ID, approval state, a public badge or a publication timestamp.
- `supabase/proposals/claim_review_pending_staging_only.sql` is **NOT a deployable migration**. It intentionally lives outside `supabase/migrations/` and MUST be compared with the real deployed schema before review and execution. It is intended only for a disposable **staging** project, never direct production execution. There is **no** moderator approval endpoint.
- The function is **SECURITY INVOKER**, not SECURITY DEFINER. It relies on real Supabase `auth.uid()`, explicit column GRANTs, per-user RLS, private evidence INSERT-only, and a small daily claim limit. It is not available to `anon` users, cannot approve anything, and cannot expose another captain's claim evidence. Actual real JWT/RLS tests are still required to prove those claims in a running database.
- Review submission records `firsthand_attested=true` because the writer personally confirms a completed trip. This remains **self-attestation, not independent booking verification**. It requests no receipt, credit card, trip-party membership, tax record, exact trip date or guide permission. All opinions, positive or critical, face identical neutral moderation rules.
- An obsolete `intensity` field previously hardcoded to `3` without the angler selecting it. The client no longer invents that score. The proposed staging script makes the legacy field nullable without rewriting any historic rating.
- Review browser INSERT is restricted to allowlisted columns. The database owns `status='pending'`, `published_at`, author ownership checks, body minimum, and authenticated attestation. Clients receive NO UPDATE/DELETE permissions to publish or rewrite their own submissions.
- The proposed `public_angler_reviews` view is `security_invoker=true` (Postgres 15+) and only shows moderated, published reviews on currently published guide profiles. It excludes reviewer account IDs, private trip evidence and moderation notes. Direct base-table SELECT also remains published-only with limited columns.

## What the initial scaffold proves and what it doesn't

The checked-in `0001_initial.sql` creates some referenced tables but not the extra review fields, private claim evidence table, or published read view. `0002_captain_media.sql` is a pointer to an earlier deployment; `0003_pending_captain_fishery_proposals.sql` remains unexecuted proposed schema. The real project may already contain partially applied changes that conflict with this draft; an **offline test is not proof of runtime RLS**.

The current `scripts/backend_schema_preflight.py --require-ready` intentionally fails. No green TypeScript or Next.js build should remove that release gate.

## Deployment decision sequence (no actions taken)

1. **Owner approval** to restore the inactive Supabase project after reviewing possible cost/plan impacts. Until then, **do not execute** this SQL or reconfigure account billing.
2. Use `supabase/qa/read_only_schema_inventory.sql` for a **read-only** inventory of actual table columns, view definitions, grants, RLS, policies, trigger functions, storage and migrations; do not retrieve raw user content or credentials.
3. Reconcile this draft against actual schema with a proper migration created under the supported CLI workflow. This script is not idempotent and should fail on unexpected existing tables/columns; DO NOT blindly run on historical deployed state. Check Supabase changelog and current security docs.
4. Apply the reconciled changes only in an isolated **staging** database, with current version of Supabase Auth and a Postgres 15+ compatible published-only invoker view. Run actual **real JWT** tests: anon, signed-in author, other author, claimant, approved captain, revoked captain, moderator and admin. Assert forbidden direct Data API writes to `status`/`published_at`, published read only, no private claim evidence leakage, no body shorter than 40 chars, no direct author/guide swapping.
5. Negative-test identity spoofing, 3-per-day claim cap, duplicate claims, partial evidence failure rollback, repeated fake reviews and impersonation. Add server-side anti-brigading limits, moderation queue and private audit trails without requiring financial proof from anglers.
6. Implement separate authorized, audited **moderator** approval, flag/dispute/appeal and revocation workflows. This branch intentionally has no approval path; not ready for public user-generated content.
7. Obtain new explicit owner approval for production migrations, restored services, public PWA publishing, third-party notifications and payments. Until then, no merge or deploy.

## Founder alignment

The initial customer experience should feel like RateMyProfessors: no receipt verification; account identity private, reviews publicly anonymous, honest average with sample size, and guides invited by a neutral share link. The founder wants a self-service business, not phone calls or bespoke sponsor fulfillment. Gemini's earlier beta plan contained illustrative figures such as a 71% evidence-backed review rate and Week 1 deployment that are **not actual platform metrics or authorized production steps**.

The free trust layer and guide corrections cannot be purchased or suppressed. A possible $29.99/year angler utility is a separate, unlaunched price experiment with no payments here.

## Verification evidence

Run `npm run test:atomic-claims` and `npm run check` to check code contracts, source-only auth guards and Next.js build. These tests **do not execute SQL**, make database writes, send messages, publish reviews or validate live JWT policies. Runtime permission proof remains a hard blocker until owner-approved staging.
