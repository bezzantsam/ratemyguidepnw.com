\set ON_ERROR_STOP on
CREATE FUNCTION public.expect_month_error(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE; END;
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Expected SQLSTATE %, got %',expected,coalesce(actual,'success'); END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.expect_month_error(text,text) TO anon,authenticated;
INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference) VALUES
 ('OR','month-one','10000000-0000-0000-0000-000000000001',now(),'synthetic'),
 ('OR','month-two','10000000-0000-0000-0000-000000000002',now(),'synthetic'),
 ('WA','wa-777','10000000-0000-0000-0000-000000000002',now(),'synthetic');
SET ROLE anon;
SELECT public.fixture_assert((public.rmg_review_write_availability('OR','month-one')->>'available')::boolean,'readiness sees mapped guide and write grants');
SELECT public.expect_month_error($q$SELECT public.rmg_own_review_for_guide('OR','month-one')$q$,'42501');
SELECT public.expect_month_error($q$SELECT public.rmg_review_write_availability('WA','wrong')$q$,'P0002');
RESET ROLE;
REVOKE EXECUTE ON FUNCTION public.rmg_submit_review_v2(text,text,smallint,smallint,boolean,text,boolean,text,jsonb,text) FROM authenticated;
SET ROLE anon;
SELECT public.fixture_assert(NOT (public.rmg_review_write_availability('OR','month-one')->>'available')::boolean,'readiness does not mistake public reads for revoked write access');
RESET ROLE;
GRANT EXECUTE ON FUNCTION public.rmg_submit_review_v2(text,text,smallint,smallint,boolean,text,boolean,text,jsonb,text) TO authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT public.fixture_assert(public.rmg_own_review_for_guide('OR','month-one')=jsonb_build_object('id','30000000-0000-0000-0000-000000000001'::uuid,'status','published'),'guide-specific recovery returns own existing review');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
SELECT public.fixture_assert(public.rmg_own_review_for_guide('OR','month-one') IS NULL,'guide-specific recovery hides other authors');
SELECT public.expect_month_error($q$SELECT public.rmg_submit_review_v2('OR','month-two',5::smallint,NULL::smallint,NULL,'Good',true,'none',NULL,'2026-13')$q$,'22023');
SELECT set_config('tests.month_review',public.rmg_submit_review_v2('OR','month-two',5::smallint,NULL::smallint,NULL,'Good',true,'none',NULL,'2025-08')->>'id',false);
SELECT public.fixture_assert(public.rmg_own_review_for_guide('WA','wa-777')->>'id'=current_setting('tests.month_review'),'cross-state mapped identity recovers the same review');
RESET ROLE;
SELECT public.fixture_assert((SELECT trip_month='2025-08-01'::date AND status='pending' FROM public.reviews WHERE id=current_setting('tests.month_review')::uuid),'month persists in pending review');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.rmg_decide_submission('review',current_setting('tests.month_review')::uuid,true,'Independent review of genuine fixture');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
SELECT set_config('tests.month_revision',public.rmg_submit_revision_v2(current_setting('tests.month_review')::uuid,4::smallint,NULL::smallint,NULL,'Revised',true,'none',NULL,true,'2026-05')->>'id',false);
RESET ROLE;
SET ROLE anon;
SELECT public.fixture_assert((SELECT trip_month='2025-08-01'::date AND quality=5 FROM public.public_angler_reviews WHERE id=current_setting('tests.month_review')::uuid),'pending month edit leaves published review unchanged');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.fixture_assert(public.rmg_revision_queue(0,100)->0->>'trip_month'='2026-05-01' AND (public.rmg_revision_queue(0,100)->0->>'trip_month_specified')::boolean,'moderator sees proposed month');
SELECT public.rmg_decide_revision(current_setting('tests.month_revision')::uuid,true,'Independent review of proposed change');
RESET ROLE;
SELECT public.fixture_assert((SELECT trip_month='2026-05-01'::date AND quality=4 FROM public.reviews WHERE id=current_setting('tests.month_review')::uuid),'approved revision publishes month and rating atomically');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
SELECT set_config('tests.month_revision2',public.rmg_submit_revision_v2(current_setting('tests.month_review')::uuid,3::smallint,NULL::smallint,NULL,'Preserve',true,'none',NULL,false,NULL)->>'id',false);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.rmg_decide_revision(current_setting('tests.month_revision2')::uuid,true,'Independent review of omitted month');
RESET ROLE;
SELECT public.fixture_assert((SELECT trip_month='2026-05-01'::date FROM public.reviews WHERE id=current_setting('tests.month_review')::uuid),'omitted month preserves published month');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
SELECT set_config('tests.month_revision3',public.rmg_submit_revision_v2(current_setting('tests.month_review')::uuid,3::smallint,NULL::smallint,NULL,'Clear',true,'none',NULL,true,NULL)->>'id',false);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.rmg_decide_revision(current_setting('tests.month_revision3')::uuid,true,'Independent review of cleared month');
RESET ROLE;
SELECT public.fixture_assert((SELECT trip_month IS NULL FROM public.reviews WHERE id=current_setting('tests.month_review')::uuid),'explicit null clears month only after approval');
