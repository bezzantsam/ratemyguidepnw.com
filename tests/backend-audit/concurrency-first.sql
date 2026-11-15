\set ON_ERROR_STOP on
BEGIN;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.admin_decide_claim('20000000-0000-0000-0000-000000000009',true,'first');
SELECT pg_sleep(6);
COMMIT;
