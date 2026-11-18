-- Generated transaction-runner body; do not add embedded BEGIN/COMMIT.

-- BEGIN SOURCE: emergency-disable-migration-body.sql
-- REVIEW-ONLY rollback candidate, not applied. Restricts new application writes
-- without deleting submitted reviews, claims, mapping records, or audit history.
-- The application deployment must also be rolled back separately. This does not
-- restore the pre-change privileges, which included unsafe direct-write grants.
UPDATE rmg_private.launch_control SET enabled=false WHERE singleton;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA rmg_private FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.rmg_resolve_guide(text,text),public.rmg_profile_details(text,text),public.rmg_review_summary(text,text),public.rmg_submit_review(text,text,smallint,smallint,boolean,text,boolean,text,jsonb),public.rmg_submit_claim(text,text,text,text,text),public.rmg_own_status(text,uuid),public.rmg_edit_details(text,text,text,text,smallint,text,text),public.admin_decide_review(uuid,boolean,text),public.admin_decide_claim(uuid,boolean,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.rmg_submit_revision(uuid,smallint,smallint,boolean,text,boolean,text,jsonb),public.rmg_revision_queue(integer,integer),public.rmg_decide_revision(uuid,boolean,text),public.rmg_my_submissions(integer,integer),public.rmg_decide_submission(text,uuid,boolean,text) FROM PUBLIC,anon,authenticated;
-- END SOURCE: emergency-disable-migration-body.sql

-- BEGIN SOURCE: disable-review-reporting.sql
-- Runner-managed emergency disable; preserve review flags and audit rows.
REVOKE EXECUTE ON FUNCTION public.rmg_report_review(text,text,uuid,text),public.rmg_report_queue(integer,integer),public.rmg_resolve_report(uuid),rmg_private.report_review(text,text,uuid,text),rmg_private.report_queue(integer,integer),rmg_private.resolve_report(uuid) FROM PUBLIC,anon,authenticated;
-- END SOURCE: disable-review-reporting.sql

-- BEGIN SOURCE: disable-review-v26.sql
-- Runner-managed emergency disable. Preserve reviews, revisions and audit rows.
REVOKE EXECUTE ON FUNCTION rmg_private.submit_review_v2(text,text,smallint,smallint,boolean,text,boolean,text,jsonb,text),rmg_private.submit_revision_v2(uuid,smallint,smallint,boolean,text,boolean,text,jsonb,boolean,text),rmg_private.own_review_for_guide(text,text),rmg_private.review_write_availability(text,text),public.rmg_submit_review_v2(text,text,smallint,smallint,boolean,text,boolean,text,jsonb,text),public.rmg_submit_revision_v2(uuid,smallint,smallint,boolean,text,boolean,text,jsonb,boolean,text),public.rmg_own_review_for_guide(text,text),public.rmg_review_write_availability(text,text) FROM PUBLIC,anon,authenticated;
-- END SOURCE: disable-review-v26.sql
