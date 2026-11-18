\set ON_ERROR_STOP on
BEGIN;
REVOKE USAGE ON SCHEMA rmg_private FROM authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
DO $$BEGIN BEGIN PERFORM public.rmg_submit_review_v2('OR','fixture-two',4::smallint,NULL,NULL,'Synthetic permission test',true,'none',NULL,NULL); RAISE EXCEPTION 'unexpected write despite denied schema usage'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS reproduction control: authenticated write denied'; END; END$$;
RESET ROLE;
SET ROLE anon;
SELECT public.fixture_assert(NOT (public.rmg_review_write_availability('OR','fixture-two')->>'available')::boolean,'readiness must be false when authenticated schema usage is revoked');
ROLLBACK;
