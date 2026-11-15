# Backend identity and authorization compatibility — 2026-11-15

**Release decision: blocked.** Do not enable review, claim, or owner-edit flows. This is a point-in-time review, not a production migration or approval. The checklist identifies `kdzwyjizvskyonjrrogt` (`rate-my-guides`); its staging/production role is not established, so it was treated as live. Only catalog and aggregate identity queries were run. No user records, credentials, or live mutations were used.

## Scope and fingerprint

[`backend-catalog-snapshot.json`](backend-catalog-snapshot.json) contains catalog definitions for 12 relevant tables, three views, six functions, 18 policies, constraints, indexes, triggers and anon/authenticated grants. It was captured from Postgres 17.11, using [`catalog.sql`](../scripts/backend-audit/catalog.sql); SHA-256 of the committed JSON bytes is `7bab10cbbd0b9246fbd9a19591b8fa21f5afc0de2d9f0e0ad47cfd018ddc9ec4`. This fingerprints the selected catalog snapshot, not the entire database, API configuration, Auth configuration, or subsequent changes. Re-query and compare a canonically formatted JSON snapshot before relying on it. The checked-in initial migration differs from this live schema; in particular it lacks the later moderation and claim-evidence migrations and has a different review-body limit.

## Identity results

| Comparison | Result | Meaning |
| --- | ---: | --- |
| Oregon source registration and derived slug | 1,027/1,027 rows match both exactly; zero missing or duplicate slug matches | Stronger than name matching, but not an ownership check or a verified cross-state mapping. |
| Washington allocated IDs against database slug | 153/158 same-slug rows; five missing | A slug match is **not** identity verification. Existing Washington protection correctly avoids these requests. |
| Database guides with jurisdiction | 0/1,185 | State and cross-state identity cannot be verified from jurisdiction; no stable Washington source-ID column exists in this schema. |

No name, business, or slug match establishes ownership. Build a separately reviewed stable source-ID-to-backend UUID mapping with jurisdiction and uniqueness guarantees, explicit ambiguous/missing states, and cross-state review. Do not reassign identities or rely on display names. The Oregon review widget currently checks name and business plus slug, but does not query the matching registration; this remains a mismatch risk if the database changes. Washington remains fail-closed.

The aggregate comparison is reproducible with `python3 scripts/backend-audit/identity-aggregate.py`, which prints a read-only SQL query. It found no duplicate matching slugs and no direct OR-registration/WA-license conflict, but it cannot establish whether a Washington slug belongs to the same person. An independent aggregate query found zero duplicate non-null license numbers in the database at inspection time. Re-run both against explicitly identified infrastructure before relying on these counts.

## Authorization findings

- Captured RLS permits authenticated direct insertion of pending reviews and claims, irrespective of disabled website controls. The throttle is not an IP-aware or concurrency-safe abuse control. Do not treat the UI gate as a backend write gate; a backend lockdown requires independent review and explicit authorization.
- Captured admin RPCs check admin membership but allow an admin to approve their **own** review or claim. [`proposed-no-self-approval.sql`](../scripts/backend-audit/proposed-no-self-approval.sql) is a local-only proposed repair, not a migration. Local tests reproduce both baseline gaps and verify the proposal blocks them while permitting a different administrator to act. It does not solve separation of duties for related accounts.
- The public review and admin pending-review security-invoker views fail with `permission denied for table reviews` in the catalog reconstruction because their underlying column privileges are insufficient. Fix this without exposing `author_id` or private unpublished rows; do not grant blanket table SELECT. Retest public and moderator access against the actual API.
- The approved owner's `guide_details` writes are immediately visible for published guides. Publication moderation and safe target mapping must precede enabling editing. Captured policies allow claimants and admins to read relevant claim evidence; the local role tests exercise both allowed and denied access.
- Admin review approval changes published rating aggregates via the trigger, but the public view grants prevent end-to-end public display. Local tests show pending reviews excluded from anonymous base-table reads and approved reviews included in aggregates.

## Reproducible local checks and limits

Run `scripts/backend-audit/run-local.sh` with PostgreSQL 17 tools (`initdb`, `pg_ctl`, `psql`) and Python 3 on PATH. It creates and destroys a new socket-only local cluster, stubs `auth.uid()` and synthetic `auth.users`, reconstructs the captured subset, and tests anon, two independent users, an approved owner and an admin. It does not read environment files, contact the hosted database, or use real users. It explicitly demonstrates known failures before testing the local-only proposal. This reconstruction does not prove JWT verification, API exposure/configuration, hosted role inheritance, all triggers/extensions, transaction races, actual email/OAuth, or production security. Independent security review, a fresh schema comparison, comprehensive negative/positive API tests, identity review, anti-abuse, and explicit founder release approval remain required.

Supabase's [RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security) and [API security guidance](https://supabase.com/docs/guides/api/securing-your-api) distinguish table privileges, policies, and invoker-view permissions; testing must cover all three.
