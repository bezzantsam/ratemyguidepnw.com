# Automatic review publication v1

Issue #128 authorizes immediate publication of valid authenticated reviews and edits, with administrators acting on reported posts. Claims and ownership retain their existing approval workflow. This candidate does not backfill existing submissions or change launch controls, authentication, identity gates or RLS.

## Prerequisites and preflight

Apply after the current identity/ratings/survey stack. The disposable runner records the exact order: final launch, Oregon reviews split, Oregon claims, legacy claim guard, structured offerings, public review summaries, WA pilot, listed identity, listed adapter, listed summaries, listed read-only correction, WA catalog targets, richer ratings, richer survey, and moderator own-submission visibility. Account saved guides is independent and remains unchanged.

Before activation, retain this read-only snapshot of the four replaced functions and their ACLs. The committed rollback was captured from production before activation; compare the current definitions to it and stop if another release changed them.

```sql
SELECT p.oid::regprocedure::text AS signature,
       pg_get_functiondef(p.oid) AS definition, p.proacl
FROM pg_proc p
WHERE p.oid IN (
 'rmg_private.submit_review(text,text,smallint,smallint,boolean,text,boolean,text,jsonb)'::regprocedure,
 'public.rmg_submit_revision(uuid,smallint,smallint,boolean,text,boolean,text,jsonb)'::regprocedure,
 'public.rmg_submit_revision_v2(uuid,smallint,smallint,boolean,text,boolean,text,jsonb,boolean,text)'::regprocedure,
 'public.rmg_submit_revision_v3(uuid,smallint,smallint,boolean,text,boolean,text,jsonb,boolean,text,jsonb)'::regprocedure
) ORDER BY signature;

SELECT current_setting('server_version') AS postgres_version,
 (SELECT enabled FROM rmg_private.launch_control WHERE singleton) AS launch_enabled,
 rmg_private.valid_trip_responses('{"version":1,"answers":{"kindness":{"state":"answered","value":5},"fishiness":{"state":"answered","value":4},"fish_landed":{"state":"answered","value":0}}}') AS richer_survey,
 position('retained_answers' IN pg_get_functiondef('rmg_private.submit_revision(uuid,smallint,smallint,boolean,text,boolean,text,jsonb)'::regprocedure))>0 AS retains_answers,
 to_regprocedure('public.rmg_resolve_report_v2(uuid,text,text)') AS report_v2;

SELECT status,count(*) FROM public.reviews GROUP BY status;
SELECT status,count(*) FROM rmg_private.review_revisions GROUP BY status;
SELECT status,count(*) FROM public.review_flags GROUP BY status;
```

On first activation, `report_v2` is absent; richer survey and answer retention must both be true. The migration checks its dependencies. Existing function ACLs are preserved; the older public revision wrappers can retain their historical `service_role` grants while private submission functions remain unavailable to that role.

## Rollout

1. Require passing PostgreSQL 17 and application/browser CI. The new workflow uses a fresh `postgres:17` service, synthetic credentials, and a runner that rejects nonlocal hosts, nonempty databases, an unexpected database/user, and nonfixture credentials.
2. Deploy the compatible frontend/backend first and verify the production deployment is ready. It must accept review `pending|published` and revision `pending|approved` receipts, refresh public content after publication, and expose explicit report keep/remove actions. Claim receipts remain pending.
3. Apply `automatic-review-publication-v1.sql` as **one transaction**, through the integration owner's existing migration process. It includes `NOTIFY pgrst,'reload schema'`; new report RPCs become usable after the schema cache refresh.
4. Verify the installed definitions, permissions and policy behavior. Report keep accepts an optional reason up to 500 characters; remove requires a nonblank reason up to 500. Removal is limited to a published or already removed review and cannot republish content. Do not create synthetic reviews in production to verify this change.

Automatic publication audits identify the policy with a null admin actor. Author identity remains on the review/proposal. Explicit moderation keeps the authenticated admin actor and reason.

## Rollback

Apply `automatic-review-publication-v1-rollback.sql` in one transaction. It restores the captured private review function and all three public edit wrappers, and revokes the automatic finalizer. Future submissions and edits return pending again. Already published posts, revision history and audit records remain intact. Keep/remove report moderation remains available for content already published, and the compatible frontend supports both policies. The rollback also reloads the PostgREST schema cache. Do not replay older whole migrations or mass-unpublish existing reviews.

## Verification

The committed PostgreSQL 17 runner reconstructs the observed schema, applies every prerequisite and the candidate, exercises 14 grouped behavior assertions plus 27 expected denials, then checks rollback across all three review/edit API versions and continued report removal. All synthetic test transactions roll back; the CI database is ephemeral.

Local verification additionally passes on PGlite 0.5.17 (PostgreSQL 18.7). This verifies SQL, RLS, grants, triggers and function behavior without sockets. It does not substitute for the PostgreSQL 17 CI gate or test cross-session deadlocks. No production changes are made by these tests.
