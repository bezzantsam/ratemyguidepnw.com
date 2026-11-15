\set ON_ERROR_STOP on
-- State B: no moderation grants and no customer DML, even for an approved owner.
SET ROLE anon;
SELECT public.fixture_assert((SELECT count(*)=1 FROM public.public_angler_reviews),'anonymous reads exactly the published review');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.claim_evidence) AND (SELECT count(*)=0 FROM public.moderation_audit),'anonymous cannot see private evidence or moderation audit');
DO $$BEGIN
 BEGIN PERFORM author_id FROM public.reviews; RAISE EXCEPTION 'author leaked'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM count(*) FROM public.admin_pending_claims; RAISE EXCEPTION 'anonymous accessed admin queue'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO public.reviews(guide_id,author_id,quality,intensity,would_book_again,body) VALUES ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',4,4,true,repeat('fixture ',12)); RAISE EXCEPTION 'anonymous review insert allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
DO $$BEGIN
 BEGIN INSERT INTO public.guide_claims(guide_id,claimant_id) VALUES ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000005'); RAISE EXCEPTION 'claim insert allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO public.claim_evidence(claim_id,claimant_name,public_evidence) VALUES ('20000000-0000-0000-0000-000000000001','Fixture','fixture evidence'); RAISE EXCEPTION 'evidence insert allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.guide_details SET expertise='changed' WHERE guide_id='10000000-0000-0000-0000-000000000001'; RAISE EXCEPTION 'owner detail update allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.guide_media SET caption='changed' WHERE id='40000000-0000-0000-0000-000000000001'; RAISE EXCEPTION 'owner media update allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO public.reviews(guide_id,author_id,quality,intensity,would_book_again,body) VALUES ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000005',4,4,true,repeat('fixture ',12)); RAISE EXCEPTION 'review insert allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.admin_decide_review('30000000-0000-0000-0000-000000000002',true,NULL); RAISE EXCEPTION 'admin review call allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.admin_decide_claim('20000000-0000-0000-0000-000000000002',true,NULL); RAISE EXCEPTION 'admin claim call allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.refresh_guide_rating('10000000-0000-0000-0000-000000000001'); RAISE EXCEPTION 'rating RPC allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'PASS: locked state denies direct customer writes and moderation RPCs';
END$$;
SELECT public.fixture_assert((SELECT count(*)=2 FROM public.admin_pending_reviews),'admin review queue includes published and draft guide pending reviews');
SELECT public.fixture_assert((SELECT count(*)=1 FROM public.admin_pending_claims),'administrator sees pending claim queue');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.admin_pending_claims),'claimant cannot access admin queue');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.admin_pending_reviews),'nonadmin cannot access admin review queue');
SELECT public.fixture_assert((SELECT count(*)=1 FROM public.claim_evidence),'claimant can access own private evidence only');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.claim_evidence),'other user cannot read private evidence');
SELECT public.fixture_assert((SELECT count(*)=1 FROM public.public_angler_reviews),'authenticated nonadmin reads only published reviews');
SELECT public.fixture_assert((SELECT count(id)=0 FROM public.reviews WHERE id='30000000-0000-0000-0000-000000000002'),'authenticated nonadmin cannot read pending review');
DO $$BEGIN
 BEGIN PERFORM author_id FROM public.reviews; RAISE EXCEPTION 'authenticated author leak'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
RESET ROLE;
SELECT public.fixture_assert((SELECT expertise='original' FROM public.guide_details WHERE guide_id='10000000-0000-0000-0000-000000000001') AND (SELECT caption='original' FROM public.guide_media WHERE id='40000000-0000-0000-0000-000000000001') AND (SELECT count(*)=3 FROM public.reviews) AND (SELECT count(*)=2 FROM public.guide_claims) AND (SELECT count(*)=1 FROM public.claim_evidence) AND (SELECT count(*)=0 FROM public.moderation_audit),'denied locked operations leave protected state unchanged');
-- Inspect all affected table and column privileges, including column-only grants.
DO $$DECLARE t text; r text; c record; op text; BEGIN
 FOREACH t IN ARRAY ARRAY['reviews','guide_claims','claim_evidence','guide_details','guide_media'] LOOP
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   FOREACH op IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    IF has_table_privilege(r,'public.'||t,op) THEN RAISE EXCEPTION 'unexpected % % on %',r,op,t; END IF;
   END LOOP;
   FOR c IN SELECT attname FROM pg_attribute WHERE attrelid=('public.'||t)::regclass AND attnum>0 AND NOT attisdropped LOOP
    FOREACH op IN ARRAY ARRAY['INSERT','UPDATE','REFERENCES'] LOOP
     IF has_column_privilege(r,'public.'||t,c.attname,op) THEN RAISE EXCEPTION 'unexpected % % on %.%',r,op,t,c.attname; END IF;
    END LOOP;
   END LOOP;
  END LOOP;
 END LOOP;
 RAISE NOTICE 'PASS: all captured customer table and column write grants removed';
END$$;
