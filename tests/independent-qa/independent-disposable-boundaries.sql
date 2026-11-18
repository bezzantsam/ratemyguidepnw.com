\set ON_ERROR_STOP on
-- Independent 05 assertions. Run ONLY after reconstruct.py, fixtures.sql and
-- both draft SQL files in a fresh 06 synthetic cluster. No hosted database.
BEGIN;
DO $$BEGIN
 IF session_user <> 'audit_owner' OR current_database() <> 'postgres'
    OR to_regprocedure('public.fixture_assert(boolean,text)') IS NULL
    OR (SELECT count(*) FROM auth.users) <> 6
    OR (SELECT count(*) FROM public.guides) <> 3
    OR NOT EXISTS (SELECT 1 FROM public.guides WHERE id='10000000-0000-0000-0000-000000000001' AND full_name='Fixture one')
    OR NOT EXISTS (SELECT 1 FROM public.guides WHERE id='10000000-0000-0000-0000-000000000002' AND full_name='Fixture two')
 THEN RAISE EXCEPTION 'Refuse: not the dedicated synthetic audit cluster'; END IF;
END$$;
INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference) VALUES
 ('OR','fixture-1','10000000-0000-0000-0000-000000000001',now(),'synthetic independent mapping'),
 ('OR','fixture-2','10000000-0000-0000-0000-000000000002',now(),'synthetic independent mapping');

-- An unapproved claimant has no edit rights. These fixture IDs are not users.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
DO $$ BEGIN
 BEGIN
  PERFORM public.rmg_edit_details('OR','fixture-2','forged','',NULL::smallint,'','');
  RAISE EXCEPTION 'QA: unapproved claimant edited guide';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;

-- Two distinct authors submit pending scores to the same mapped guide.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
SELECT public.rmg_submit_review('OR','fixture-2',2::smallint,3::smallint,true,repeat('fictional a ',9),true,'none')->>'id' AS qa_review_a \gset
SELECT set_config('qa.review_a', :'qa_review_a', true);
DO $$ BEGIN
 BEGIN
  PERFORM public.rmg_submit_review('OR','fixture-2',2::smallint,3::smallint,true,repeat('fictional a ',9),true,'none');
  RAISE EXCEPTION 'QA: duplicate review accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',true);
SELECT public.rmg_submit_review('OR','fixture-2',4::smallint,3::smallint,false,repeat('fictional b ',9),true,'none')->>'id' AS qa_review_b \gset
SELECT set_config('qa.review_b', :'qa_review_b', true);
DO $$ BEGIN
 BEGIN
  PERFORM public.rmg_own_status('review',current_setting('qa.review_a')::uuid);
  RAISE EXCEPTION 'QA: other reviewer status visible';
 EXCEPTION WHEN no_data_found THEN NULL;
 END;
 BEGIN
  UPDATE public.reviews SET status='published' WHERE id=current_setting('qa.review_a')::uuid;
  RAISE EXCEPTION 'QA: direct review status update accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  DELETE FROM public.reviews WHERE id=current_setting('qa.review_a')::uuid;
  RAISE EXCEPTION 'QA: direct review delete accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT public.fixture_assert((public.rmg_review_summary('OR','fixture-2')->>'count')::int=0,'pending synthetic reviews excluded from public count');
SELECT public.fixture_assert(public.rmg_review_summary('OR','fixture-2')->>'averageQuality' IS NULL,'empty public average is null, not zero');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.public_angler_reviews WHERE guide_id='10000000-0000-0000-0000-000000000002'),'pending rows not in public review view');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.claim_evidence),'anonymous claim evidence hidden');
DO $$ BEGIN
 BEGIN PERFORM public.rmg_resolve_guide('WA','fixture-2'); RAISE EXCEPTION 'QA: foreign-state mapping accepted'; EXCEPTION WHEN no_data_found THEN NULL; END;
END $$;
RESET ROLE;

-- Moderator publishes A and rejects B, then verify only A contributes.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
SELECT public.admin_decide_review(current_setting('qa.review_a')::uuid,true,'Synthetic manual review evidence documented');
SELECT public.admin_decide_review(current_setting('qa.review_b')::uuid,false,'Synthetic rejection');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT public.fixture_assert((public.rmg_review_summary('OR','fixture-2')->>'count')::int=1,'published-only aggregate count');
SELECT public.fixture_assert((public.rmg_review_summary('OR','fixture-2')->>'averageQuality')::numeric=2,'rejected four-star score excluded from average');
SELECT public.fixture_assert((SELECT count(*)=1 FROM public.public_angler_reviews WHERE guide_id='10000000-0000-0000-0000-000000000002'),'only published synthetic review visible');
RESET ROLE;

-- Approved captain #5 is also a moderator but cannot suppress their guide's
-- independent pending review. All actor IDs and reviews here are fictional.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
SELECT public.rmg_submit_review('OR','fixture-1',3::smallint,3::smallint,false,repeat('fictional c ',9),true,'none')->>'id' AS qa_review_c \gset
SELECT set_config('qa.review_c', :'qa_review_c', true);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
DO $$DECLARE msg text; BEGIN
 BEGIN
  PERFORM public.admin_decide_review(current_setting('qa.review_c')::uuid,false,'Synthetic rejection');
  RAISE EXCEPTION 'QA: captain suppressed independent review';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
  IF msg <> 'Guide owners cannot moderate their own guide' THEN RAISE; END IF;
 END;
END $$;
RESET ROLE;
SELECT public.fixture_assert((SELECT status='pending' FROM public.reviews WHERE id=current_setting('qa.review_c')::uuid),'captain attempt left independent review pending');

-- Approve the unrelated pending claim, then verify the matching owner can edit
-- declared fields without changing the immutable fixture guide identity.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
SELECT public.admin_decide_claim('20000000-0000-0000-0000-000000000002',true,'Synthetic manual ownership evidence reviewed');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
SELECT public.fixture_assert(public.rmg_edit_details('OR','fixture-2','Synthetic boat','Synthetic gear',NULL::smallint,'Synthetic expertise','Synthetic species')->>'status'='saved','approved claimant can edit documented fields');
RESET ROLE;
SELECT public.fixture_assert((SELECT full_name='Fixture two' AND slug='fixture-two' FROM public.guides WHERE id='10000000-0000-0000-0000-000000000002'),'allowed edit preserves guide identity');
SELECT public.fixture_assert((SELECT boat='Synthetic boat' AND years_experience IS NULL FROM public.guide_details WHERE guide_id='10000000-0000-0000-0000-000000000002'),'allowed owner data persisted and skipped year stays null');
SELECT public.fixture_assert((SELECT count(*)=3 FROM public.moderation_audit WHERE actor_id='00000000-0000-0000-0000-000000000004'),'both review decisions and claim decision audited');
ROLLBACK;
\echo 'PASS independent disposable authorization assertions; transaction rolled back'
