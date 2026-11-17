\set ON_ERROR_STOP on
INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference) VALUES
 ('OR','fixture-1','10000000-0000-0000-0000-000000000001',now(),'synthetic reviewed identity'),
 ('OR','fixture-2','10000000-0000-0000-0000-000000000002',now(),'synthetic reviewed identity');
SET ROLE anon;
SELECT public.fixture_assert(public.rmg_resolve_guide('OR','fixture-1')='10000000-0000-0000-0000-000000000001','public reviewed mapping resolves');
DO $$BEGIN
 BEGIN PERFORM public.rmg_resolve_guide('WA','fixture-1'); RAISE EXCEPTION 'unknown mapping accepted'; EXCEPTION WHEN no_data_found THEN NULL; END;
 BEGIN PERFORM public.rmg_submit_claim('OR','fixture-1','test','',repeat('e',40)); RAISE EXCEPTION 'anon claim accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM rmg_private.guide_identity_map; RAISE EXCEPTION 'map leaked'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
DO $$BEGIN
 BEGIN PERFORM public.rmg_submit_review('OR','fixture-2',5::smallint,4::smallint,true,repeat('s',80),false,'none'); RAISE EXCEPTION 'missing attestation accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.rmg_submit_review('OR','fixture-2',5::smallint,4::smallint,true,repeat('s',80),true,'fake'); RAISE EXCEPTION 'bad relationship accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN INSERT INTO public.reviews(guide_id,author_id,quality,intensity,would_book_again,body,status) VALUES ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003',5,4,true,repeat('s',80),'published'); RAISE EXCEPTION 'direct write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
SELECT public.fixture_assert((public.rmg_submit_review('OR','fixture-2',5::smallint,4::smallint,true,repeat('x',90),true,'personal')->>'status')='pending','review persisted pending with attestation and disclosure');
SELECT public.fixture_assert((SELECT count(*)=1 FROM public.reviews WHERE status='published'),'pending review not published');
SELECT public.fixture_assert((public.rmg_submit_claim('OR','fixture-1','Synthetic Name','',repeat('e',40))->>'status')='pending','claim persisted pending');
SELECT public.fixture_assert((public.rmg_submit_claim('OR','fixture-1','Synthetic Name','',repeat('e',40))->>'existing')='true','duplicate pending claim returns existing receipt');
DO $$BEGIN
 BEGIN PERFORM public.rmg_edit_details('OR','fixture-2','','',NULL,'',''); RAISE EXCEPTION 'unapproved edit accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.rmg_own_status('claim','20000000-0000-0000-0000-000000000002'); RAISE EXCEPTION 'other claim visible'; EXCEPTION WHEN no_data_found THEN NULL; END;
END$$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
SELECT public.fixture_assert((public.rmg_edit_details('OR','fixture-1','Boat','Gear',5::smallint,'Expertise','Species')->>'status')='saved','approved owner may edit allowed fields');
DO $$BEGIN
 BEGIN PERFORM public.rmg_submit_review('OR','fixture-1',5::smallint,4::smallint,true,repeat('s',80),true,'none'); RAISE EXCEPTION 'owner review accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
RESET ROLE;
UPDATE auth.users SET is_anonymous=true WHERE id='00000000-0000-0000-0000-000000000006';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
DO $$BEGIN
 BEGIN PERFORM public.rmg_submit_claim('OR','fixture-1','Test name','',repeat('e',40)); RAISE EXCEPTION 'anonymous auth accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
RESET ROLE;
SELECT public.fixture_assert((SELECT count(*)=1 FROM public.reviews WHERE author_id='00000000-0000-0000-0000-000000000003' AND firsthand_attested AND relationship_disclosure='personal'),'attestation and relationship persisted');
SELECT public.fixture_assert((SELECT average_quality=5 AND review_count=1 FROM public.guides WHERE id='10000000-0000-0000-0000-000000000001'),'rating counts published reviews only');
SELECT set_config('tests.review_id',(SELECT id::text FROM public.reviews WHERE author_id='00000000-0000-0000-0000-000000000003' AND guide_id='10000000-0000-0000-0000-000000000002'),false);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.admin_decide_review(current_setting('tests.review_id')::uuid,true,'Independent synthetic evidence reviewed');
SELECT public.admin_decide_claim('20000000-0000-0000-0000-000000000002',true,'Independent ownership evidence reviewed');
RESET ROLE;
SELECT public.fixture_assert((SELECT count(*)=2 FROM public.moderation_audit WHERE actor_id='00000000-0000-0000-0000-000000000004'),'review and ownership decisions audited');
SELECT public.fixture_assert((SELECT average_quality=5 AND review_count=1 FROM public.guides WHERE id='10000000-0000-0000-0000-000000000002'),'only published review contributes to guide rating');
SET ROLE anon;
SELECT public.fixture_assert((public.rmg_review_summary('OR','fixture-2')->>'count')::int=1,'public summary returns published count');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.claim_evidence),'anonymous cannot see claim evidence');
DO $$BEGIN
 BEGIN PERFORM author_id FROM public.reviews; RAISE EXCEPTION 'reviewer identity leaked'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
RESET ROLE;
