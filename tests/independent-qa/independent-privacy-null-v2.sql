\set ON_ERROR_STOP on
-- Supplemental independently authored QA assertions, disposable cluster only.
BEGIN;
DO $$BEGIN
 IF session_user <> 'audit_owner' OR current_database() <> 'postgres'
    OR to_regprocedure('public.fixture_assert(boolean,text)') IS NULL
    OR (SELECT count(*) FROM auth.users) <> 6
    OR (SELECT count(*) FROM public.guides) <> 3
    OR NOT EXISTS (SELECT 1 FROM public.guides WHERE id='10000000-0000-0000-0000-000000000002' AND full_name='Fixture two')
 THEN RAISE EXCEPTION 'Refuse: not the dedicated synthetic audit cluster'; END IF;
END$$;
-- Independently check default-off before explicitly enabling this synthetic transaction.
SET LOCAL ROLE anon;
DO $$BEGIN
 BEGIN PERFORM public.rmg_resolve_guide('OR','fixture-2');
  RAISE EXCEPTION 'QA: disabled launch resolved a guide';
 EXCEPTION WHEN SQLSTATE 'P5030' THEN NULL; END;
END$$;
RESET ROLE;
UPDATE rmg_private.launch_control SET enabled=true WHERE singleton;
SELECT public.fixture_assert((SELECT enabled FROM rmg_private.launch_control WHERE singleton),'synthetic gate enabled only within rolled-back transaction');
INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference)
 VALUES ('OR','fixture-2','10000000-0000-0000-0000-000000000002',now(),'synthetic independent mapping');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
SELECT public.rmg_submit_review('OR','fixture-2',2::smallint,3::smallint,true,repeat('fictional a ',9),true,'none')->>'id' AS qa_review_a \gset
SELECT set_config('qa.review_a', :'qa_review_a', true);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',true);
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.reviews WHERE id=current_setting('qa.review_a')::uuid),'unrelated authenticated reviewer cannot read pending body through base table');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.claim_evidence),'unrelated authenticated reviewer cannot read claim evidence');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
SELECT public.rmg_submit_review('OR','fixture-2',5::smallint,3::smallint,true,repeat('fictional mod ',9),true,'none')->>'id' AS qa_review_self \gset
SELECT set_config('qa.review_self', :'qa_review_self', true);
DO $$DECLARE msg text;BEGIN
 BEGIN
  PERFORM public.rmg_decide_submission('review',current_setting('qa.review_self')::uuid,true,'Synthetic manual review evidence documented');
  RAISE EXCEPTION 'QA: moderator self-approved review';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
  IF msg <> 'Cannot approve your own submission' THEN RAISE; END IF;
 END;
END$$;
SELECT public.rmg_decide_submission('review',current_setting('qa.review_a')::uuid,true,'Synthetic manual review evidence documented');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT public.fixture_assert((SELECT communication IS NULL AND professionalism IS NULL AND safety IS NULL AND equipment IS NULL AND knowledge IS NULL AND effort IS NULL AND value_rating IS NULL FROM public.public_angler_reviews WHERE id=current_setting('qa.review_a')::uuid),'skipped optional scores remain NULL, not zero');
RESET ROLE;
ROLLBACK;
\echo 'PASS independent disposable privacy, self-approval and null assertions; transaction rolled back'
