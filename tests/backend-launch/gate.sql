\set ON_ERROR_STOP on
SET ROLE anon;
DO $$BEGIN
 BEGIN PERFORM public.rmg_resolve_guide('OR','fixture-1'); RAISE EXCEPTION 'public resolver available while disabled'; EXCEPTION WHEN SQLSTATE 'P5030' THEN NULL; END;
END$$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
DO $$BEGIN
 BEGIN PERFORM public.rmg_submit_review('OR','fixture-1',5::smallint,NULL,NULL,'Good',true,'none'); RAISE EXCEPTION 'review available while disabled'; EXCEPTION WHEN SQLSTATE 'P5030' THEN NULL; END;
 BEGIN PERFORM public.rmg_decide_submission('claim','20000000-0000-0000-0000-000000000002',true,'Manual ownership check completed'); RAISE EXCEPTION 'moderation available while disabled'; EXCEPTION WHEN SQLSTATE 'P5030' THEN NULL; END;
 BEGIN UPDATE rmg_private.launch_control SET enabled=true WHERE singleton; RAISE EXCEPTION 'user toggled launch gate'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
RESET ROLE;
SELECT public.fixture_assert((SELECT NOT enabled FROM rmg_private.launch_control WHERE singleton),'database launch gate defaults off');
