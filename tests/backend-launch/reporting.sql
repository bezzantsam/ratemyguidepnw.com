\set ON_ERROR_STOP on
CREATE FUNCTION public.expect_reporting_error(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE; END;
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Expected SQLSTATE %, got %',expected,coalesce(actual,'success'); END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.expect_reporting_error(text,text) TO authenticated;
SELECT public.fixture_assert(NOT has_table_privilege('authenticated','public.review_flags','SELECT') AND NOT has_table_privilege('anon','public.review_flags','INSERT'),'reports have no direct client access');
SELECT public.fixture_assert(NOT has_function_privilege('anon','public.rmg_report_review(text,text,uuid,text)','EXECUTE'),'anonymous cannot submit reports');
UPDATE auth.users SET email_confirmed_at=NULL WHERE id='00000000-0000-0000-0000-000000000003';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
SELECT public.expect_reporting_error($q$SELECT public.rmg_report_review('OR','fixture-one','30000000-0000-0000-0000-000000000001','other')$q$,'42501');
RESET ROLE;
UPDATE auth.users SET email_confirmed_at=now() WHERE id='00000000-0000-0000-0000-000000000003';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
SELECT public.expect_reporting_error($q$SELECT public.rmg_report_review('OR','fixture-one','30000000-0000-0000-0000-000000000002','other')$q$,'P0002');
SELECT public.expect_reporting_error($q$SELECT public.rmg_report_review('OR','fixture-two','30000000-0000-0000-0000-000000000001','other')$q$,'P0002');
SELECT public.expect_reporting_error($q$SELECT public.rmg_report_review('OR','fixture-one','30000000-0000-0000-0000-000000000001','unreviewed')$q$,'22023');
SELECT public.expect_reporting_error($q$SELECT public.rmg_report_queue(0,10)$q$,'42501');
SELECT public.expect_reporting_error($q$SELECT public.rmg_resolve_report(gen_random_uuid())$q$,'42501');
DO $$DECLARE a jsonb;b jsonb; BEGIN
 a:=public.rmg_report_review('OR','fixture-one','30000000-0000-0000-0000-000000000001','not_firsthand');
 b:=public.rmg_report_review('OR','fixture-one','30000000-0000-0000-0000-000000000001','other');
 PERFORM public.fixture_assert(a->>'status'='submitted' AND a->>'existing'='false' AND b->>'existing'='true' AND a->>'id'=b->>'id','report retry is durable and idempotent');
END $$;
RESET ROLE;
SELECT public.fixture_assert((SELECT count(*)=1 FROM public.review_flags) AND (SELECT reason='not_firsthand' AND status='pending' FROM public.review_flags LIMIT 1),'report persisted once without changing reason on retry');
SELECT public.fixture_assert((SELECT body=repeat('published ',10) AND quality=5 AND status='published' FROM public.reviews WHERE id='30000000-0000-0000-0000-000000000001'),'reporting does not alter public review');
SELECT public.fixture_assert((SELECT review_count=1 AND average_quality=5 FROM public.guides WHERE id='10000000-0000-0000-0000-000000000001'),'reporting does not alter the published rating');
INSERT INTO public.site_admins(user_id) VALUES ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
SELECT public.expect_reporting_error($q$SELECT public.rmg_resolve_report((SELECT (public.rmg_report_queue(0,10)->0->>'id')::uuid))$q$,'42501');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT public.expect_reporting_error($q$SELECT public.rmg_resolve_report((SELECT (public.rmg_report_queue(0,10)->0->>'id')::uuid))$q$,'42501');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
SELECT public.expect_reporting_error($q$SELECT public.rmg_resolve_report((SELECT (public.rmg_report_queue(0,10)->0->>'id')::uuid))$q$,'42501');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT public.expect_reporting_error($q$SELECT public.rmg_submit_review('OR','fixture-one',5::smallint,NULL::smallint,NULL,'Again',true,'none',NULL)$q$,'P4091');
RESET ROLE;
UPDATE public.reviews SET status='removed' WHERE id='30000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
DO $$DECLARE q jsonb; BEGIN
 q:=public.rmg_report_queue(0,10);
 PERFORM public.fixture_assert(jsonb_array_length(q)=1 AND q->0->>'review_status'='removed' AND q->0->'public_review_body'='null'::jsonb AND NOT (q->0 ? 'reporter_id'),'moderator queue hides nonpublic review text and reporter identity');
END $$;
DO $$DECLARE rid uuid; response jsonb; BEGIN
 SELECT (public.rmg_report_queue(0,10)->0->>'id')::uuid INTO rid;
 response:=public.rmg_resolve_report(rid);
 PERFORM public.fixture_assert(response->>'status'='resolved' AND response->>'id'=rid::text,'moderator resolves persisted report');
END $$;
RESET ROLE;
SELECT public.fixture_assert((SELECT status='resolved' AND resolved_by='00000000-0000-0000-0000-000000000004' AND resolved_at IS NOT NULL FROM public.review_flags LIMIT 1),'resolution stores moderator and time');
SELECT public.fixture_assert((SELECT status='removed' AND quality=5 FROM public.reviews WHERE id='30000000-0000-0000-0000-000000000001') AND (SELECT count(*)=1 FROM public.moderation_audit WHERE reason LIKE 'resolved report %'),'resolution audits without modifying review');
-- Create separate fictional authors and guide IDs so the existing review throttle stays enabled.
INSERT INTO auth.users(id,email_confirmed_at) SELECT ('80000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,now() FROM generate_series(1,11) n;
INSERT INTO public.guides(id,slug,full_name,listing_status) SELECT ('90000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'rate-'||n,'Synthetic guide','published' FROM generate_series(1,11) n;
INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference) SELECT 'OR','rate-'||n,('90000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,now(),'fixture' FROM generate_series(1,11) n;
INSERT INTO public.reviews(id,guide_id,author_id,quality,body,status,published_at) SELECT ('70000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,('90000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,('80000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,5,'Synthetic','published',now() FROM generate_series(1,11) n;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
DO $$DECLARE n integer; result jsonb; BEGIN
 FOR n IN 1..10 LOOP result:=public.rmg_report_review('OR','rate-'||n,('70000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'other'); END LOOP;
 PERFORM public.fixture_assert((public.rmg_report_review('OR','rate-1','70000000-0000-0000-0000-000000000001','other')->>'existing')::boolean,'duplicate retry remains available after rate limit');
END $$;
SELECT public.expect_reporting_error($q$SELECT public.rmg_report_review('OR','rate-11','70000000-0000-0000-0000-000000000011','other')$q$,'P4290');
RESET ROLE;
SELECT public.fixture_assert((SELECT count(*)=10 FROM public.review_flags WHERE reporter_id='00000000-0000-0000-0000-000000000006'),'report rate limit persists at most ten distinct reports');
