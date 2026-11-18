\set ON_ERROR_STOP on
-- 05 independent cross-state identity and pagination, dedicated synthetic fixture only.
BEGIN;
DO $$BEGIN
 IF session_user <> 'audit_owner' OR current_database() <> 'postgres'
    OR to_regprocedure('public.fixture_assert(boolean,text)') IS NULL
    OR (SELECT count(*) FROM auth.users) <> 6 OR (SELECT count(*) FROM public.guides) <> 3
 THEN RAISE EXCEPTION 'Refuse: not the dedicated synthetic audit cluster'; END IF;
END$$;
INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference) VALUES
 ('OR','fixture-1','10000000-0000-0000-0000-000000000001',now(),'synthetic OR'),
 ('WA','wa-001','10000000-0000-0000-0000-000000000001',now(),'synthetic WA alias'),
 ('OR','fixture-2','10000000-0000-0000-0000-000000000002',now(),'synthetic OR');
UPDATE rmg_private.launch_control SET enabled=true WHERE singleton;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
SELECT set_config('qa.all',public.rmg_my_submissions(0,100)::text,true);
SELECT public.fixture_assert(jsonb_array_length(current_setting('qa.all')::jsonb)=3,'actor one gets exactly own review and claim rows without alias duplication');
SELECT public.fixture_assert((SELECT count(*)=1 FROM jsonb_array_elements(current_setting('qa.all')::jsonb) x WHERE x->>'id'='30000000-0000-0000-0000-000000000001' AND x->'identities' @> '[{"jurisdiction":"OR","source_id":"fixture-1"},{"jurisdiction":"WA","source_id":"wa-001"}]'::jsonb AND jsonb_array_length(x->'identities')=2),'same review has both exact reviewed state identities');
SELECT public.fixture_assert((SELECT count(*)=1 FROM jsonb_array_elements(current_setting('qa.all')::jsonb) x WHERE x->>'id'='30000000-0000-0000-0000-000000000003' AND x->'identities'='[]'::jsonb AND x->>'jurisdiction' IS NULL AND x->>'source_id' IS NULL),'unmapped guide remains unknown');
SELECT public.fixture_assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(current_setting('qa.all')::jsonb) x WHERE x->>'id' IN ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001')),'another user review and claim remain hidden');
SELECT public.fixture_assert((SELECT jsonb_agg(a ORDER BY n) = current_setting('qa.all')::jsonb FROM (SELECT n,jsonb_array_elements(public.rmg_my_submissions(n,1)) AS a FROM generate_series(0,2) n) p),'one-row pages preserve order and do not duplicate aliases');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
SELECT public.fixture_assert((SELECT count(*)=1 FROM jsonb_array_elements(public.rmg_my_submissions(0,100)) x WHERE x->>'id'='20000000-0000-0000-0000-000000000001' AND x->'identities' @> '[{"jurisdiction":"OR","source_id":"fixture-1"},{"jurisdiction":"WA","source_id":"wa-001"}]'::jsonb),'approved owner sees own claim under both reviewed aliases');
SELECT public.fixture_assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.rmg_my_submissions(0,100)) x WHERE x->>'id'='30000000-0000-0000-0000-000000000001'),'approved owner cannot see other author submission');
RESET ROLE;
ROLLBACK;
\echo 'PASS independent cross-state actor and pagination assertions; rolled back'
