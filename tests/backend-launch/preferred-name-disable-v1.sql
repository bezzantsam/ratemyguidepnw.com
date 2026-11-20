\set ON_ERROR_STOP on
SELECT public.fixture_assert(NOT has_function_privilege('authenticated','public.rmg_set_profile_name_v1(text,text,text)','EXECUTE'),'owner preferred-name RPC disabled');
SELECT public.fixture_assert(NOT has_function_privilege('authenticated','public.rmg_admin_set_profile_name_v1(text,text,text,text)','EXECUTE'),'admin preferred-name RPC disabled');
SELECT public.fixture_assert(NOT has_function_privilege('authenticated','public.rmg_profile_name_review_v1(text,text)','EXECUTE'),'admin name review RPC disabled');
SELECT public.fixture_assert(NOT has_function_privilege('authenticated','public.rmg_own_profile_name_v1(text,text)','EXECUTE'),'owner name read RPC disabled');
SELECT public.fixture_assert(NOT has_function_privilege('anon','public.rmg_profile_names_v1(text,text[])','EXECUTE'),'public preferred-name projection disabled');
SELECT public.fixture_assert((SELECT count(*)=8 FROM rmg_private.profile_name_audit_v1),'disable preserves preferred-name audit');
SELECT public.fixture_assert((SELECT preferred_name=repeat('é',80) FROM rmg_private.profile_declarations WHERE guide_id='10000000-0000-0000-0000-000000000001'),'disable preserves declared name');

SELECT public.fixture_assert((SELECT enabled IS FALSE FROM rmg_private.profile_name_control_v1 WHERE singleton),'additive disable closes the name-specific database gate');
SELECT public.fixture_assert((SELECT enabled IS TRUE FROM rmg_private.launch_control WHERE singleton),'additive disable leaves base launch gate enabled');
SET ROLE anon;
SELECT public.fixture_assert((public.rmg_review_write_availability('OR','OG.0000004')->>'available')::boolean,'base review readiness survives name disable');
RESET ROLE;

SELECT public.fixture_assert((SELECT enabled FROM rmg_private.claim_control_v1)
 AND (SELECT enabled FROM rmg_private.guide_offerings_control_v1)
 AND public.rmg_guide_offerings_public_v1('public_profile','{"jurisdiction":"OR","sourceId":"OG.0000004"}')
     ->'profile'->'offerings'->0->>'title'='Fixture reef trip',
 'name disable preserves the live claims and offerings controls and approved trips');
