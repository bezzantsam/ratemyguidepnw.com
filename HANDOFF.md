# 06 v2.7 moderator queue correction — current successor

**Published implementation commit:** `8614aeb2efefb22cf0e52d801b3f41e8818e07c0` on `origin/codex/rmg-backend-launch-20261117`. A subsequent handoff-only commit may advance the branch tip. 01 integrates the precise code commit; this note does not assert receipt.

01/05: the initial-review moderator queue now includes persisted `intensity` and `would_book_again`; null and false are preserved. The view remains security-invoker and moderator-only. Revision queue behavior and all earlier backend features remain intact. This is an additive response correction; see `docs/backend-launch-contract-06.md` v2.7 for the exact example and existing v2.6 operations/errors.

Fresh-target single runner body: `supabase/review-candidates/final-launch-migration-body.sql`, SHA-256 `e76030edd1cfe5d9b61ef48cf8132a96536f01f13e3030016890ab549b076f78`, superseding `9495e7bc…`. It is assembled in the same order with the same preconditions and data-preserving disable body as below. Do not apply both old and new bodies. If anything has already been applied, stop and reconcile history and catalog before creating a separately reviewed migration. 01 alone executes hosted changes.

Changed files in this successor: `supabase/review-candidates/02-launch-api.sql`, `launch-combined.sql`, `launch-migration-body.sql`, `final-launch-migration-body.sql`, `HOSTED-PLAN.md`; `tests/backend-launch/access.sql`; `tests/backend-auth-local/migration-history.py`; `docs/backend-launch-contract-06.md`; this handoff. `bash tests/backend-launch/run-reporting-local.sh` exited 0 with disposable PostgreSQL 17.12, including the exact assembled body, injected rollback, persisted answer true/false/null, anonymous and non-moderator denial, reporting/revision/claim/ratings tests and data-preserving disable. This invocation did not run PostgREST or 05's extra independent assertions; the earlier v2.6 evidence below was for the earlier hash, not this new candidate. A second invocation with PostgREST and unchanged 05 SQL assertions failed (exit 3) during disposable migration with `No space left on device`; it did not reach those checks. Do not treat the earlier v2.6 PostgREST pass as evidence for this successor. `node --test tests/backend-launch/*.test.mjs` passed 27/27 on Node 20.3.0. The pinned hashes in `tests/backend-auth-local/migration-history.py` were updated, but the Supabase CLI history rehearsal for this successor has not run. Hosted migration, real moderator access, Auth and post-integration independent acceptance remain unverified.

---

# 06 final backend integration handoff — 2026-11-17

**Current checkpoint; supersedes earlier migration/hash notes below.** Integration-ready backend implementation commit **`5fd08ae1ddd0970c0071fe0d3d6a106824755505`**, tree `a8c2761f3398cf16554fa25fc4acf099858f3ec1`, was normally pushed and verified on `origin/codex/rmg-backend-launch-20261117`. The branch-specific Vercel deployment guard remains in place. Subsequent handoff-only commits may advance the branch tip. 01 alone integrates and executes hosted changes; 05 independently reviews the final integrated tree. This saved handoff does not assert either owner has received it. PR #121 was not merged, and no hosted data, schema, flags, Auth, Storage or deployment was changed by 06.

The published backend includes persisted review reporting, authorized report moderation, confirmed-duplicate and guide-specific lost-response recovery, optional trip month/structured trip fields, and advisory write readiness. It keeps published reviews and ratings unchanged while revisions are pending; captains cannot moderate independent reviews. `docs/backend-launch-contract-06.md` contains the exact versioned JSON request, response and error examples for 01. Earlier code `bf6fe3` could report write availability when authenticated usage of `rmg_private` was revoked; a new disposable PG test reproduced that defect, and this successor checks usage on both `public` and `rmg_private` as well as the existing gates and grants. 01 should continue to clear write/share/QR availability after a failed write: a readiness check cannot promise Auth delivery or a future successful submission.

**Preferred fresh-project migration:** `supabase/review-candidates/final-launch-migration-body.sql`, SHA-256 **`9495e7bcbe794d6e6d3f136db5514a6e3a596080a145cf7ea85e16678b201c37`**, combines the v2.4, reporting and corrected v2.6 bodies in that order. Use one CLI-generated migration and a transaction-owning history-recording runner; do not also apply the component bodies. If any component was already applied, stop and reconcile actual history/catalog and use a separately reviewed remaining migration plan. The prior v2.6 SHA `c0c7c4...` is superseded; corrected v2.6 component SHA is `2c84a40319587584b7a6515b0250a22b831628f69f81bdef53e05336cb6aa3a3`.

Before application, 01 must check the exact target, old catalog and reporting metadata, Storage-policy fingerprint, absence of new objects, role privileges and migration-history correspondence. The final body creates no guide mappings or users and leaves the DB gate off. OR seed and WA mapping are separate; no WA identity may be inferred from similar slugs or names. The separate, transaction-runner `final-launch-disable-body.sql` SHA-256 **`42f7a9301707380b9c80b850d764d66891a189610c8d75021e4042d65baea195`** closes the gate and revokes all launch/report/v2 entrypoints without deleting records. Quiesce traffic and disable frontend/server flags; 01 restores the prior good deployment. It is fail-closed recovery, not a full catalog restore. `supabase/review-candidates/HOSTED-PLAN.md` records details and preconditions.

**Tested on the exact final body:** `/private/tmp/rmg-beta-node22/node --test tests/backend-launch/*.test.mjs` passed 27/27; TypeScript exited 0. The command below returned 0 using disposable PostgreSQL 17.12 and real local PostgREST 12.2.12 with synthetic JWTs. It ran an injected-failure rollback, sampled ACL/function/data preservation, existing claims/revisions/identity/ratings, corrected schema-usage readiness, all 18 exposed trip answers and trip-month persistence, pending and approved revisions, duplicate/recovery, report authorization/retry/concurrency/moderation, 05's unchanged independent SQL assertions and the combined disable with retained row counts.

```sh
RMG_INDEPENDENT_SQL_DIR=/Users/sambezzant/release-qa/20261117-rmg-reporting-d4a3 RMG_REPORT_PQ_LIB_DIR=/opt/homebrew/opt/postgresql@17/lib/postgresql RMG_REPORT_POSTGREST=/private/tmp/ratemyguide-postgrest-v12.2.12/postgrest bash tests/backend-launch/run-reporting-local.sh
```

The exact final body has **not** yet run through a real Supabase CLI migration/history stack or production Auth. A guarded CI rehearsal is prepared in `tests/backend-auth-local/README.md` using `RMG_FIXTURE_SCHEMA_ONLY=1 RMG_FINAL_LAUNCH_FIXTURE=1`; 01/05 must run and independently assess it. A real moderator account, hosted Auth settings, verified identity mapping, Storage policy compatibility and the final integrated UI/browser acceptance remain open. A prior existing boundary test remains 3/4 because its exact expected Vercel map excludes this branch-only guard; it was not modified. Low disk space precluded a full build.

**Changed files since previously published `003291e`:** `docs/backend-launch-contract-06.md`; `supabase/review-candidates/07-review-month-and-recovery.sql`, `review-month-recovery-migration-body.sql`, `final-launch-migration-body.sql`, `final-launch-disable-body.sql`, `HOSTED-PLAN.md`; `tests/backend-launch/assemble-final-launch.py`, `month-recovery.sql`, `reporting-http.py`, `run-reporting-local.sh`; `tests/backend-auth-local/README.md`, `migration-history.py`, `prepare.py`. This list excludes this handoff-only update.

---

# Historical v2.6 handoff — superseded where it conflicts with the current checkpoint

01 is the sole frontend integration and hosted migration executor. 05 independently reviews the integrated candidate. No production schema, data, Auth, Storage, launch gates or deployment was changed by 06.

## Exact code and publication

- Backend implementation commit: `bf6fe30475962ba6be754fca8dc78e7c44589763` (includes reporting commit `d4a3d4d2ebab9e7d61a14babbc052354ec83acba`). Local branch: `codex/rmg-backend-launch-20261117`.
- Published implementation: `bf6fe30475962ba6be754fca8dc78e7c44589763` is reachable on `origin/codex/rmg-backend-launch-20261117`; remote checkpoint `d8721cb7245e03937fd0215a2c2c2cba3226a17d` was verified after a normal push. Later handoff-only commits may advance the branch; check the current tip with `git ls-remote --heads origin codex/rmg-backend-launch-20261117`. 01 must integrate only the needed backend files, never merge test PR #121 wholesale.
- PR #121 remained at `8522b51336213310eff3ff5bb2728229ff525eca` when inspected. Its v2.4 backend does not include this complete reporting/month/recovery/readiness delta; its prior tests do not accept this successor automatically.
- `vercel.json` adds only `codex/rmg-backend-launch-20261117:false` to prevent automatic deployment of this branch. That entry is branch protection, not a product change to cherry-pick into 01's candidate. The legacy exact-map boundary test has an expected failing assertion due to this extra protective entry; no test was modified to hide it.

## Exact implementation delta from `0a30ba7`

Application: `lib/backend-launch/handler.mjs`, `lib/backend-launch/validation.mjs`. Contracts: `docs/backend-launch-contract-06.md`, `supabase/review-candidates/HOSTED-PLAN.md`. Additive SQL: `06-review-reporting.sql`, `07-review-month-and-recovery.sql`, their runner bodies `review-reporting-migration-body.sql`, `review-month-recovery-migration-body.sql`, `disable-review-reporting.sql`, `disable-review-v26.sql`, and `preflight-review-reporting.sql` under `supabase/review-candidates/`. Backend tests/helpers: `tests/backend-launch/assemble-reporting-migration.py`, `assemble-month-recovery-migration.py`, `handler.test.mjs`, `reporting.test.mjs`, `reporting.sql`, `reporting-http.py`, `run-reporting-local.sh`, `month-recovery.test.mjs`, `month-recovery.sql`. `vercel.json` is branch-only guard as described above. Review these exact paths rather than importing the entire test-only branch.

## API, integration and safe failure

`POST /api/launch` keeps the v2.4 contract and adds:

- Authenticated `{operation:"report_review",jurisdiction:"OR"|"WA",sourceId,reviewId,reason:"not_firsthand"|"harassment_or_private_info"|"other"}` returns `{id,status:"submitted",existing:boolean}` only after a validated persisted receipt. It accepts published reviews on the mapped guide, permits 10 new reports/account/24h, and keeps retries idempotent. Reporting never changes a review or rating.
- Authenticated `operator_queue` with `kind:"report"` returns pending reports to site admins; `resolve_report` with `id` returns `{id,status:"resolved"}` after persistence and audit. Involved reporters, authors and approved owners cannot resolve that report. Reporter IDs are omitted and nonpublic review text is null. A previously resolved report retry has `existing:true` and is not reopened.
- `submit_review` and `submit_revision` accept optional `tripMonth` in `YYYY-MM` or null. It persists as the first day of the month in the existing date field. On revision, omission preserves the published month, null clears it, and a new month takes effect only after approval. Moderator queue includes `trip_month` and `trip_month_specified`. Treat the stored day as a representation of the month, not an actual trip day.
- Confirmed actor/guide duplicates return HTTP 409 `{error:"duplicate_review"}`; generic conflicts remain `{error:"conflict"}` and unknown network outcomes stay unknown. Authenticated `{operation:"own_review_for_guide",jurisdiction,sourceId}` returns `{review:null}` or `{review:{id,status}}` for that actor only, allowing recovery without paginated history.
- Public `{operation:"review_write_availability",jurisdiction,sourceId}` returns `{available:boolean}` after checking the server/DB gates, mapped guide, database recovery/read-only state and v2 submit execution grants. Errors/unmapped guides are not readiness. This is advisory, not a guarantee of Auth delivery, quota or a future write. Hide review-request links/QR on false or error, and clear readiness after submission returns `launch_unavailable` or `service_unavailable`; never infer a receipt from this check or a public read.

Basic reviews still require quality 1–5, 1–3000 trimmed characters, firsthand attestation and relationship disclosure. Intensity, rebooking and structured trip answers remain optional, preserving missing/not-applicable/false/rating distinctions. Claims and protected source identity behavior are unchanged.

## Migration order and rollback

Use one transaction-owning, history-recording supported migration runner and coordinate with 05. Create each version with `supabase migration new` in 01's authorized migration environment, insert the exact reviewed body, verify SHA-256 and reconcile the existing divergent hosted history before applying; do not blindly `db push` or submit wrapped review scripts as runner migrations.

1. Existing v2.4 launch body `supabase/review-candidates/launch-migration-body.sql`, SHA-256 `209c5fe39125ef17096941dac3c814c9e57b2e0b0be4789c9f49dc0510f34b9a`.
2. v2.5 reporting body `supabase/review-candidates/review-reporting-migration-body.sql`, SHA-256 `eb474d321d404d96a48cae430481fa37a270f319a2ca85971ba10cd0d01a18d5`.
3. v2.6 month/recovery body `supabase/review-candidates/review-month-recovery-migration-body.sql`, SHA-256 `c0c7c4bfe48dc695a32b794120adff950abd260685e41ceb91d810cab00eb683`.

Recheck project identity, exact catalog/Storage policy fingerprint, reporting table metadata, new names, permissions and actual migration history immediately before changes. The earlier Oregon mapping seed is separate and needs exact-body and provenance acceptance; it is not applied. Do not fabricate production users or reviews.

The report-only disable body SHA-256 `13bae10eba73ff8e90fdafb3763510925c62c008b7ed41e40c6f496251dfd57a`; the v2.6-only disable body SHA-256 `2a9f6af51f93802c3d8061f06f4ebd0f9cd6614c17c0afff650339c059d646f0`. Both revoke their entrypoints and retain persisted data; neither is a complete catalog restore. The prior v2.4 emergency disable sets the DB gate false and revokes private functions; separately disable server/UI flags, quiesce requests and restore the known-good app deployment. See `HOSTED-PLAN.md` for exact preflight and safety boundaries.

## Executed verification and limits

From this worktree:

```
/private/tmp/rmg-beta-node22/node --test tests/backend-launch/*.test.mjs
/private/tmp/rmg-beta-node22/node node_modules/typescript/bin/tsc --noEmit --incremental false
RMG_INDEPENDENT_SQL_DIR=/Users/sambezzant/release-qa/20261117-rmg-reporting-d4a3 RMG_REPORT_PQ_LIB_DIR=/opt/homebrew/opt/postgresql@17/lib/postgresql RMG_REPORT_POSTGREST=/private/tmp/ratemyguide-postgrest-v12.2.12/postgrest bash tests/backend-launch/run-reporting-local.sh
```

All returned 0. Node 22.22.2: 27/27; TypeScript exit 0. Isolated PostgreSQL 17.12 executed v2.4 + exact v2.5/v2.6 bodies, existing claim/revision/identity/rating checks, new month/recovery/availability/reporting tests, concurrency and both disable paths. It also ran 05's unchanged SQL files with SHA-256 `f9f665b3e28153c372c1f29ce32989c28de5ccadff4dac6206a28f67ca21e966` and `5460f8121e6af31944359b82bac774468f0a732901933b1cc4b5c690acee70a1`. Local PostgREST 12.2.12 with synthetic JWTs exercised month/revision persistence, guide recovery, readiness and report moderation. These are not real hosted Auth, real-user reporting or 05 acceptance of this successor.

`/private/tmp/rmg-beta-node22/node --test tests/read-only-launch-boundaries.test.mjs` returned 1: 3 passed and the exact-object deployment guard assertion rejected the additional `codex/rmg-backend-launch-20261117:false` branch guard. No assertions were edited. The branch protection is intentional and must not be misreported as a passing full launch suite. A full build and final integrated browser/Auth test remain 01/05 work; disk was about 247 MiB free before the local database run.
