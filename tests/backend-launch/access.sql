\set ON_ERROR_STOP on
INSERT INTO public.guides(id,slug,full_name,listing_status) VALUES
 ('10000000-0000-0000-0000-000000000004','fixture-four','Fixture four','published'),
 ('10000000-0000-0000-0000-000000000005','fixture-five','Fixture five','published');
INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference) VALUES
 ('OR','fixture-1','10000000-0000-0000-0000-000000000001',now(),'synthetic reviewed identity'),
 ('OR','fixture-2','10000000-0000-0000-0000-000000000002',now(),'synthetic reviewed identity'),
 ('OR','fixture-4','10000000-0000-0000-0000-000000000004',now(),'synthetic reviewed identity'),
 ('OR','fixture-5','10000000-0000-0000-0000-000000000005',now(),'synthetic reviewed identity');
SET ROLE anon;
SELECT public.fixture_assert(public.rmg_resolve_guide('OR','fixture-1')='10000000-0000-0000-0000-000000000001','public reviewed mapping resolves');
SELECT public.fixture_assert(public.rmg_profile_details('OR','fixture-1') IS NULL,'legacy details are not labeled as captain declarations without provenance');
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
 BEGIN PERFORM public.rmg_submit_review('OR','fixture-2',5::smallint,4::smallint,true,repeat('s',80),true,'none','{"version":1,"answers":{"religion":{"state":"answered","value":"x"}}}'::jsonb); RAISE EXCEPTION 'profiling field accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN INSERT INTO public.reviews(guide_id,author_id,quality,intensity,would_book_again,body,status) VALUES ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003',5,4,true,repeat('s',80),'published'); RAISE EXCEPTION 'direct write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
SELECT public.fixture_assert((public.rmg_submit_review('OR','fixture-2',5::smallint,4::smallint,true,repeat('x',90),true,'personal','{"version":1,"answers":{"children_present":{"state":"answered","value":false},"guide_patience":{"state":"not_applicable"},"effort":{"state":"answered","value":1}}}'::jsonb)->>'status')='pending','review persisted pending with attestation and disclosure');
SELECT public.fixture_assert((SELECT count(*)=1 FROM public.reviews WHERE status='published'),'pending review not published');
SELECT public.fixture_assert((public.rmg_submit_claim('OR','fixture-1','Synthetic Name','',repeat('e',40))->>'status')='pending','claim persisted pending');
SELECT public.fixture_assert((public.rmg_submit_claim('OR','fixture-1','Synthetic Name','',repeat('e',40))->>'existing')='true','duplicate pending claim returns existing receipt');
SELECT public.rmg_submit_review('OR','fixture-4',5::smallint,NULL,NULL,'Good',true,'none');
SELECT public.rmg_submit_review('OR','fixture-5',5::smallint,4::smallint,true,repeat('s',80),true,'none');
SELECT public.rmg_submit_claim('OR','fixture-2','Synthetic Name','',repeat('e',40));
SELECT public.rmg_submit_claim('OR','fixture-4','Synthetic Name','',repeat('e',40));
DO $$BEGIN
 BEGIN PERFORM public.rmg_submit_review('OR','fixture-1',5::smallint,4::smallint,true,repeat('s',80),true,'none'); RAISE EXCEPTION 'review rate limit missing'; EXCEPTION WHEN SQLSTATE 'P4290' THEN NULL; END;
 BEGIN PERFORM public.rmg_submit_claim('OR','fixture-5','Synthetic Name','',repeat('e',40)); RAISE EXCEPTION 'claim rate limit missing'; EXCEPTION WHEN SQLSTATE 'P4290' THEN NULL; END;
 RAISE NOTICE 'PASS: per-account review and claim limits fail closed';
END$$;
DO $$BEGIN
 BEGIN PERFORM public.rmg_edit_details('OR','fixture-2','','',NULL,'',''); RAISE EXCEPTION 'unapproved edit accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.rmg_own_status('claim','20000000-0000-0000-0000-000000000002'); RAISE EXCEPTION 'other claim visible'; EXCEPTION WHEN no_data_found THEN NULL; END;
END$$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
SELECT public.fixture_assert((public.rmg_edit_details('OR','fixture-1','Boat','Gear',5::smallint,'Expertise','Species')->>'status')='saved','approved owner may edit allowed fields');
SELECT public.fixture_assert((public.rmg_profile_details('OR','fixture-1')->>'boat')='Boat','owner declaration can be read back with provenance');
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
SELECT public.fixture_assert((SELECT count(*)=1 FROM public.reviews WHERE author_id='00000000-0000-0000-0000-000000000003' AND guide_id='10000000-0000-0000-0000-000000000002' AND firsthand_attested AND relationship_disclosure='personal'),'attestation and relationship persisted');
SELECT public.fixture_assert((SELECT trip_responses->'answers'->'children_present'->'value'='false'::jsonb AND trip_responses->'answers'->'guide_patience'->>'state'='not_applicable' AND NOT (trip_responses->'answers' ? 'dog_present') FROM public.reviews WHERE author_id='00000000-0000-0000-0000-000000000003' AND guide_id='10000000-0000-0000-0000-000000000002'),'false, not applicable, and missing remain distinct');
SELECT public.fixture_assert((SELECT average_quality=5 AND review_count=1 FROM public.guides WHERE id='10000000-0000-0000-0000-000000000001'),'rating counts published reviews only');
SELECT set_config('tests.review_id',(SELECT id::text FROM public.reviews WHERE author_id='00000000-0000-0000-0000-000000000003' AND guide_id='10000000-0000-0000-0000-000000000002'),false);
SELECT set_config('tests.basic_review_id',(SELECT id::text FROM public.reviews WHERE author_id='00000000-0000-0000-0000-000000000003' AND guide_id='10000000-0000-0000-0000-000000000004'),false);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.fixture_assert((public.rmg_decide_submission('review',current_setting('tests.review_id')::uuid,true,'Independent synthetic evidence reviewed')->>'status')='published','review decision returns published receipt');
SELECT public.fixture_assert((public.rmg_decide_submission('review',current_setting('tests.basic_review_id')::uuid,true,'Independent synthetic evidence reviewed')->>'status')='published','basic review decision returns published receipt');
SELECT public.fixture_assert((public.rmg_decide_submission('claim','20000000-0000-0000-0000-000000000002',true,'Independent ownership evidence reviewed')->>'status')='approved','claim decision returns approved receipt');
RESET ROLE;
SELECT public.fixture_assert((SELECT count(*)=3 FROM public.moderation_audit WHERE actor_id='00000000-0000-0000-0000-000000000004'),'review and ownership decisions audited');
SELECT public.fixture_assert((SELECT average_quality=5 AND review_count=1 FROM public.guides WHERE id='10000000-0000-0000-0000-000000000002'),'only published review contributes to guide rating');
SET ROLE anon;
SELECT public.fixture_assert((public.rmg_review_summary('OR','fixture-2')->>'count')::int=1,'public summary returns published count');
SELECT public.fixture_assert((public.rmg_review_summary('OR','fixture-4')->>'wouldBookAgainResponses')::int=0 AND public.rmg_review_summary('OR','fixture-4')->'wouldBookAgainPercent'='null'::jsonb,'missing rebooking is not counted as no');
SELECT public.fixture_assert((SELECT intensity IS NULL AND would_book_again IS NULL AND body='Good' FROM public.public_angler_reviews WHERE id=current_setting('tests.basic_review_id')::uuid),'basic text/star review retains optional nulls');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.claim_evidence),'anonymous cannot see claim evidence');
DO $$BEGIN
 BEGIN PERFORM author_id FROM public.reviews; RAISE EXCEPTION 'reviewer identity leaked'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
RESET ROLE;
