-- REVIEW-ONLY rollback candidate, not applied. Restricts new application writes
-- without deleting submitted reviews, claims, mapping records, or audit history.
-- The application deployment must also be rolled back separately. This does not
-- restore the pre-change privileges, which included unsafe direct-write grants.
BEGIN;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA rmg_private FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.rmg_resolve_guide(text,text),public.rmg_profile_details(text,text),public.rmg_review_summary(text,text),public.rmg_submit_review(text,text,smallint,smallint,boolean,text,boolean,text,jsonb),public.rmg_submit_claim(text,text,text,text,text),public.rmg_own_status(text,uuid),public.rmg_edit_details(text,text,text,text,smallint,text,text),public.admin_decide_review(uuid,boolean,text),public.admin_decide_claim(uuid,boolean,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.rmg_submit_revision(uuid,smallint,smallint,boolean,text,boolean,text,jsonb),public.rmg_revision_queue(integer,integer),public.rmg_decide_revision(uuid,boolean,text),public.rmg_my_submissions(integer,integer) FROM PUBLIC,anon,authenticated;
COMMIT;
