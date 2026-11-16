\set ON_ERROR_STOP on
SET ROLE anon;
SELECT public.qa_assert(current_user='anon' AND NOT (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user) AND current_setting('row_security')='on','anonymous role really enforces RLS');
SELECT public.qa_assert((SELECT array_agg(id::text ORDER BY id) = ARRAY['30000000-0000-0000-0000-000000000001'] FROM public.public_angler_reviews),'anonymous view returns exact published fixture');
SELECT public.qa_assert((SELECT array_agg(id::text ORDER BY id) = ARRAY['30000000-0000-0000-0000-000000000001'] FROM public.reviews),'anonymous direct table returns exact published fixture');
SELECT public.qa_expect('SELECT author_id FROM public.public_angler_reviews','42703',NULL);
SELECT public.qa_expect('SELECT author_id FROM public.reviews','42501',NULL);
SELECT public.qa_assert((SELECT count(*) FROM public.claim_evidence)=0 AND (SELECT count(*) FROM public.moderation_audit)=0,'anonymous sees no private evidence or audits');
SELECT public.qa_expect('SELECT * FROM public.admin_pending_reviews','42501',NULL);
SELECT public.qa_expect('SELECT * FROM public.admin_pending_claims','42501',NULL);
SELECT public.qa_expect($q$SELECT public.admin_decide_review('30000000-0000-0000-0000-000000000002',true,NULL)$q$,'42501',NULL);
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
SELECT public.qa_assert(current_user='authenticated' AND NOT (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user) AND current_setting('row_security')='on','authenticated role really enforces RLS');
SELECT public.qa_assert((SELECT array_agg(id::text ORDER BY id) = ARRAY['30000000-0000-0000-0000-000000000001'] FROM public.public_angler_reviews),'nonadmin view returns exact published fixture');
SELECT public.qa_assert((SELECT array_agg(id::text ORDER BY id) = ARRAY['30000000-0000-0000-0000-000000000001'] FROM public.reviews),'nonadmin direct table returns exact published fixture');
SELECT public.qa_expect('SELECT author_id FROM public.reviews','42501',NULL);
SELECT public.qa_assert((SELECT count(*)=0 FROM public.claim_evidence) AND (SELECT count(*)=0 FROM public.admin_pending_claims) AND (SELECT count(*)=0 FROM public.admin_pending_reviews),'other user cannot read evidence or either queue');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT public.qa_assert((SELECT public_evidence='QA private evidence' FROM public.claim_evidence WHERE claim_id='20000000-0000-0000-0000-000000000002'),'claimant reads exact own evidence');
SELECT public.qa_assert((SELECT count(*)=0 FROM public.admin_pending_claims),'claimant cannot use admin queue');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.qa_assert((SELECT count(*)=3 FROM public.admin_pending_reviews) AND (SELECT count(*)=2 FROM public.admin_pending_claims),'application admin can read real queues including draft targets');
SELECT public.qa_assert((SELECT public_evidence='QA private evidence' FROM public.admin_pending_claims WHERE id='20000000-0000-0000-0000-000000000002'),'admin reads exact evidence through queue');
SELECT public.qa_expect('SELECT author_id FROM public.reviews','42501',NULL);
SELECT public.qa_expect($q$SELECT public.admin_decide_claim('20000000-0000-0000-0000-000000000002',true,NULL)$q$,'42501',NULL);
SELECT public.qa_expect($q$INSERT INTO public.reviews(guide_id,author_id,quality,intensity,would_book_again,body) VALUES ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000004',4,4,true,repeat('fixture ',12))$q$,'42501',NULL);
SELECT public.qa_expect($q$INSERT INTO public.guide_claims(guide_id,claimant_id) VALUES ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000004')$q$,'42501',NULL);
SELECT public.qa_expect($q$INSERT INTO public.claim_evidence(claim_id,claimant_name,public_evidence) VALUES ('20000000-0000-0000-0000-000000000002','Fixture','fixture evidence')$q$,'42501',NULL);
SELECT public.qa_expect($q$UPDATE public.guide_details SET expertise='bad' WHERE guide_id='10000000-0000-0000-0000-000000000001'$q$,'42501',NULL);
SELECT public.qa_expect($q$UPDATE public.guide_media SET caption='bad' WHERE id='40000000-0000-0000-0000-000000000001'$q$,'42501',NULL);
RESET ROLE;
-- Distinguish application admin privileges from the owner used by the harness.
SELECT public.qa_assert((SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AND has_table_privilege(current_user,'public.reviews','INSERT'),'only the test database owner retains superuser setup privileges');
DO $$DECLARE t text; r text; c record; op text; f text; BEGIN
 FOREACH t IN ARRAY ARRAY['reviews','guide_claims','claim_evidence','guide_details','guide_media'] LOOP
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   FOREACH op IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    IF has_table_privilege(r,'public.'||t,op) THEN RAISE EXCEPTION 'table grant survives: % % %',r,t,op; END IF;
   END LOOP;
   FOR c IN SELECT attname FROM pg_attribute WHERE attrelid=('public.'||t)::regclass AND attnum>0 AND NOT attisdropped LOOP
    FOREACH op IN ARRAY ARRAY['INSERT','UPDATE','REFERENCES'] LOOP
     IF has_column_privilege(r,'public.'||t,c.attname,op) THEN RAISE EXCEPTION 'column grant survives: % %.% %',r,t,c.attname,op; END IF;
    END LOOP;
   END LOOP;
  END LOOP;
 END LOOP;
 FOREACH f IN ARRAY ARRAY['public.admin_decide_review(uuid,boolean,text)','public.admin_decide_claim(uuid,boolean,text)','public.refresh_guide_rating(uuid)','public.reviews_rating_trigger()','public.throttle_review_submission()'] LOOP
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF has_function_privilege(r,f,'EXECUTE') THEN RAISE EXCEPTION 'function grant survives: % %',r,f; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=f::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'PUBLIC function grant survives: %',f; END IF;
 END LOOP;
 RAISE NOTICE 'PASS: table, column, direct role, and PUBLIC function grants removed';
END$$;
SELECT public.qa_assert((SELECT status='pending' AND published_at IS NULL FROM public.reviews WHERE id='30000000-0000-0000-0000-000000000002') AND (SELECT status='pending' FROM public.guide_claims WHERE id='20000000-0000-0000-0000-000000000002') AND (SELECT review_count=1 AND average_quality=4 FROM public.guides WHERE id='10000000-0000-0000-0000-000000000001') AND (SELECT count(*)=0 FROM public.moderation_audit),'denied operations leave rows, aggregates and audits unchanged');
