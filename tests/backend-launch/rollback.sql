\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
DO $$BEGIN
 BEGIN PERFORM public.rmg_own_status('claim','20000000-0000-0000-0000-000000000002'); RAISE EXCEPTION 'new RPC remains enabled'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.admin_decide_claim('20000000-0000-0000-0000-000000000002',true,'Independent ownership evidence reviewed'); RAISE EXCEPTION 'moderation remains enabled'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
RESET ROLE;
SELECT public.fixture_assert((SELECT status='approved' FROM public.guide_claims WHERE id='20000000-0000-0000-0000-000000000002'),'emergency disable preserves claim');
SELECT public.fixture_assert((SELECT count(*)=2 FROM public.moderation_audit WHERE actor_id='00000000-0000-0000-0000-000000000004'),'emergency disable preserves audit history');
