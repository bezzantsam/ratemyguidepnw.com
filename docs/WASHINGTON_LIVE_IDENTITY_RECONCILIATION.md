# Washington live guide identity reconciliation — REQUIRED BEFORE ENABLED REVIEWS

**Status: NO LIVE SCHEMA OR DATA WRITES. MANUAL REVIEW REQUIRED.**

## Verified read-only comparison, November 14, 2026

Compared the deployed Supabase `rate-my-guides` guide table to every imported Oregon and Washington directory identity in the website's latest feature branch.

| Check | Result |
|---|---|
| Current Oregon directory identities | 1,027 of 1,027 exactly match a deployed slug, name and business |
| Current Washington directory identities | 158 |
| Washington slugs that match the correct name and business | 26 |
| Washington slugs that resolve to a *different* guide | 127 |
| Washington slugs absent from the database | 5 |
| Distinct Washington identities traceable by unique name AND business | 158 of 158 |
| Historical Washington rows whose slug needs a planned change | 132 |
| User reviews / captain claims at the time of inspection | 0 / 0 |

**Impact:** Slug-only database lookups could retrieve reviews or approved captain-claim records for a different person. The affected page must never present those relationships as the displayed captain's until corrected.

The live database used an older ordinal `wa-NNN` identifier sequence, while the current site uses stable IDs from `lib/washington-stable-ids.json`. The positional shift is visible from `wa-026` onward, with additional shifts further down. Five live slug labels `wa-158` through `wa-162` have no matching current stable-ID label, but their underlying named guide records DO match current imported entries under different stable IDs. These are outdated slug assignments, **not** five additional people to import or merge.

## Safeguard in this PR

- `lib/guide-db-identity.ts` checks both the imported personal name and business against the actual database's `full_name` and `outfit_name`. Name-only, slug-only, mismatched-business or missing records fail closed.
- The Oregon and Washington review panels must match the live identity before reading *any* row from `public_angler_reviews` or enabling the review composer. An invalid match displays a warning, not a different captain's reviews.
- The captain claim and boats/seasonal-trip forms apply the same identity check before looking up ownership or inserting a proposal.
- This identity guard is a presentation/integration safeguard **in addition to** PR #89's all-off submission switches. It does not replace Postgres RLS, JWT authentication, moderator controls or the owner-review process.

## Review-only remediation manifest

`supabase/proposals/washington-identity-slug-remap-review-only.json` records the 132 proposed one-to-one changes, 26 unchanged IDs, the imported names/businesses and the exact live slugs observed. Every changed record remains `pending_manual_review`.

The file is **NOT SQL**, a migration, permission grant, license verification or an authorization to mutate production. It contains only public directory identifiers and business names, no passwords, auth users, reviews, private claim evidence, or secrets.

## Before any database correction

1. Re-query the **live snapshot** because the JSON plan is time-specific, and audit current guide UUIDs, review count, claim count, guide metadata and all dependent records. Never assume today's 0/0 stays true.
2. Review each original `wa-` identity against an actual authoritative source or a trusted import lineage key. Matching a public name/business is a strong candidate, not independently verified legal identity.
3. In an isolated staging database, prove a transaction-safe plan for all 132 changes. Slugs are unique and old/new targets overlap. Naive one-row `UPDATE public.guides SET slug = ...` operations will violate **slug uniqueness**. Any approved transaction must handle collisions correctly, preserve UUID/foreign-key relationships, lock appropriately, and be safely reversible.
4. Run staging **real JWT** tests as anonymous reader, guide owner, non-owner, review author, moderator, and revoked/denied claimant. Ensure review and claim data cannot be stolen, impersonated or reassigned.
5. Verify reviews attach to the same guide UUID before and after the mapping, published-only views exclude pending content and private evidence, and the static Oregon and Washington links match the database after migration.
6. Only with explicit owner authorization and independently reviewed migration/rollback instructions consider a production database change. Do not activate review, claim or captain-fishery writes until their separate schema and RLS gates pass.

**No live database operations beyond read-only SELECTs were performed for this PR.**
