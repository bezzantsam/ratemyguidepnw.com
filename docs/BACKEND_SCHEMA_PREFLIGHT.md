# Supabase backend launch preflight — read-only verified blocker

## Status as checked on 2026-11-13/14

The connected Supabase account has two projects:

- `chrome-ai` — active; **separate research system. Do not access or mix with RateMyGuidePNW.**
- `rate-my-guides` — **INACTIVE**. Its project ID is stored only for internal operator context, never as a requirement for client-side code. The project has **not** been restored, altered, migrated or activated.

Supabase `get_project` confirmed `INACTIVE`. Read-only `list_tables` returned "Database is possibly not accessible at the moment" and `list_migrations` timed out. **These errors do not establish that any table is missing remotely.** Live database tables, policies, schema history and grants remain UNKNOWN.

## Discrepancies in the checked-in code

These findings compare the source under `supabase/migrations/0001_initial.sql` to the current website code. The initial migration is NOT authoritative evidence of deployed state.

| Client functionality | Source expects | Initial SQL declares | Operational consequence |
|---|---|---|---|
| Private guide claim | `guide_claims` insert with authenticated `claimant_id` | Table with RLS, no authenticated INSERT policy in that scaffold | New claims may fail; actual policies/grants unknown |
| Ownership evidence | `claim_evidence` insert | No `claim_evidence` table in initial scaffold | Evidence submission may fail; avoid publishing or losing evidence |
| Firsthand angler review | `reviews` insert with optional communication, safety, effort, equipment, professionalism, knowledge, value_rating, trip_context | Base columns only; no client INSERT policy in initial scaffold | Frontend may reference missing columns, with the same unknown deployed caveat |
| Public, moderated review | `public_angler_reviews` SELECT view | No view in initial scaffold | Public read may fail, or a later view may have incorrect role/security options |
| Captain boat/fishery intake | `guide_fishery_proposals` INSERT after owner approval | Explicit `0003` **UNAPPLIED DRAFT** SQL design, not in `0001` | No live publishing claim is supported |
| Captain media | Previously applied `captain_verified_gallery_and_video` migration | `0002` is explicitly a pointer; **do not rerun it as executable SQL** | Requires separate deployed migration-history audit |

The `reviews` rating refresh functions in the initial SQL use privileged trigger helpers and must be separately reviewed for privilege boundaries and unauthorized execution. A green static build does not validate those security assumptions.

## Additional hardening committed in this branch

The browser previously included `status:'pending'` when submitting an angler review or guide ownership claim. It no longer supplies **any moderation status**. Both tables in the initial scaffold default to `pending`, so the database must set the initial state itself. The client remains unable to request `approved` or `published` through ordinary UI form payloads. This is **defense in depth**, not proof of real RLS: authenticated users may still call the Data API directly unless deployed column privileges, RLS policies and server moderation are tested and hardened.

## What has been built

- `scripts/backend_schema_preflight.py` compares currently committed client paths to source-scaffold definitions. It rejects changes in the inspected client contract and never connects to Supabase or reads private records.
- `python3 scripts/backend_schema_preflight.py` prints a structured, transparent discrepancy report and returns success for documentation/CI. This success means **the audit ran**, not that the backend is ready.
- `python3 scripts/backend_schema_preflight.py --require-ready` deliberately **fails nonzero** because nobody has verified the deployed backend. Use it as an explicit fail-closed release gate, not part of ordinary CI. It must never be silently made to pass by assuming the current SQL files represent reality.
- `tests/test_backend_schema_preflight.py` asserts all known mismatches, client-source guards, no network calls, no auto-activation, and the blocked strict readiness gate.
- `supabase/qa/read_only_schema_inventory.sql` is a metadata-only SQL inventory to be used after an explicitly approved restoration. It is **not executed by CI**.

## Smallest safe owner decision

**No approval needed for continued offline coding and tests.** To move from backend *design* into a real, authenticated closed beta, the project must first be restored. Because the existing project is inactive, any restoration/cost consequences must be presented for owner confirmation before the action.

Once the owner approves an eligible restoration:

1. Perform ONLY read-only inventory of actual deployed tables, view definitions, policies, role grants, storage bucket configuration, migration history and actual `guides.id`/slug mapping. Do not print user PII or database secrets in issues.
2. Compare the deployed schema to each client contract and draft migration. Correct source in a separately reviewed PR. Do not execute `0002` as SQL or `0003` in production by accident.
3. Start a disposable **staging environment**, with its cost confirmed if nonzero, and apply carefully reviewed migrations there. Run authenticated role tests with *actual Supabase JWTs*, not user-editable metadata or fake role strings.
4. Negative test anonymous, another captain, approved/revoked captain, forged `submitted_by`, forged moderator privileges, attempted review status publication, caption/boat HTML and overlong payloads. Validate public published-only view excludes all pending records and private moderation evidence.
5. Implement an append-only audited moderator workflow and separate read-only published profile layer. Only then test signed-in review/claim/fleet submission through the actual browser.
6. Obtain explicit owner approval before applying migrations to the original project or enabling public HTTPS traffic.

## Launch impact

A large scraped directory or more frontend widgets cannot substitute for **secure claim, review and moderation writes**. This is the highest-value remaining launch task. The frontend's `/admin/inbox` remains a synthetic **development-only** view and must continue returning 404 in production until real server-side authorization exists.

No production actions have occurred through this audit.
