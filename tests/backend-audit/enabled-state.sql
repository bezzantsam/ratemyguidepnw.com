\set ON_ERROR_STOP on
-- State C: local fixture enables only administrator RPC execution. Customer DML remains off.
GRANT EXECUTE ON FUNCTION public.admin_decide_review(uuid,boolean,text),public.admin_decide_claim(uuid,boolean,text) TO authenticated;
INSERT INTO public.reviews(id,guide_id,author_id,quality,intensity,would_book_again,body) VALUES
 ('30000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',4,4,true,repeat('fixture ',12)),
 ('30000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004',4,4,true,repeat('fixture ',12));
INSERT INTO public.guide_claims(id,guide_id,claimant_id) VALUES ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','',false);
DO $$BEGIN
 BEGIN PERFORM public.admin_decide_review('30000000-0000-0000-0000-000000000002',true,NULL); RAISE EXCEPTION 'missing actor accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Not authorized' THEN RAISE; END IF; END;
 BEGIN PERFORM public.admin_decide_claim('20000000-0000-0000-0000-000000000002',true,NULL); RAISE EXCEPTION 'missing actor accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Not authorized' THEN RAISE; END IF; END;
END$$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
DO $$BEGIN
 BEGIN PERFORM public.admin_decide_review('30000000-0000-0000-0000-000000000002',true,NULL); RAISE EXCEPTION 'nonadmin accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Not authorized' THEN RAISE; END IF; END;
 BEGIN PERFORM public.admin_decide_claim('20000000-0000-0000-0000-000000000002',true,NULL); RAISE EXCEPTION 'nonadmin accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Not authorized' THEN RAISE; END IF; END;
END$$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
DO $$BEGIN
 BEGIN PERFORM public.admin_decide_review('30000000-0000-0000-0000-000000000004',false,NULL); RAISE EXCEPTION 'owner moderated review'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Guide owners cannot moderate their own guide' THEN RAISE; END IF; END;
END$$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
DO $$BEGIN
 BEGIN INSERT INTO public.guide_claims(guide_id,claimant_id) VALUES ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004'); RAISE EXCEPTION 'local moderator grant enabled customer write'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.admin_decide_review('30000000-0000-0000-0000-000000000005',true,NULL); RAISE EXCEPTION 'self approval accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Cannot approve your own submission' THEN RAISE; END IF; END;
 BEGIN PERFORM public.admin_decide_claim('20000000-0000-0000-0000-000000000003',true,NULL); RAISE EXCEPTION 'self approval accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Cannot approve your own submission' THEN RAISE; END IF; END;
 BEGIN PERFORM public.admin_decide_review('30000000-0000-0000-0000-000000000002',NULL,NULL); RAISE EXCEPTION 'null decision accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Decision required' THEN RAISE; END IF; END;
 BEGIN PERFORM public.admin_decide_claim('20000000-0000-0000-0000-000000000002',NULL,NULL); RAISE EXCEPTION 'null decision accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Decision required' THEN RAISE; END IF; END;
 BEGIN PERFORM public.admin_decide_review('30000000-0000-0000-0000-000000000001',true,NULL); RAISE EXCEPTION 'nonpending accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Only pending reviews can be decided' THEN RAISE; END IF; END;
 BEGIN PERFORM public.admin_decide_claim('20000000-0000-0000-0000-000000000001',true,NULL); RAISE EXCEPTION 'nonpending accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Only pending claims can be decided' THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS: unauthorized, owner-conflicted, self, NULL, missing-actor and replay decisions denied';
END$$;
RESET ROLE;
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.moderation_audit) AND (SELECT count(*)=4 FROM public.reviews WHERE status='pending' AND published_at IS NULL) AND (SELECT count(*)=2 FROM public.guide_claims WHERE status='pending') AND (SELECT status='approved' FROM public.guide_claims WHERE id='20000000-0000-0000-0000-000000000001') AND (SELECT review_count=0 FROM public.guides WHERE id='10000000-0000-0000-0000-000000000002'),'denied decisions leave all targets, ratings and audit unchanged');
-- An injected audit failure must roll back the target status and rating trigger.
CREATE FUNCTION public.fixture_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic audit failure'; END$$;
CREATE TRIGGER fixture_fail_audit BEFORE INSERT ON public.moderation_audit FOR EACH ROW EXECUTE FUNCTION public.fixture_fail_audit();
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
DO $$BEGIN
 BEGIN PERFORM public.admin_decide_review('30000000-0000-0000-0000-000000000002',true,NULL); RAISE EXCEPTION 'audit failure ignored'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'synthetic audit failure' THEN RAISE; END IF; END;
 BEGIN PERFORM public.admin_decide_claim('20000000-0000-0000-0000-000000000002',true,NULL); RAISE EXCEPTION 'audit failure ignored'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'synthetic audit failure' THEN RAISE; END IF; END;
END$$;
RESET ROLE;
DROP TRIGGER fixture_fail_audit ON public.moderation_audit;
SELECT public.fixture_assert((SELECT status='pending' AND published_at IS NULL FROM public.reviews WHERE id='30000000-0000-0000-0000-000000000002') AND (SELECT status='pending' FROM public.guide_claims WHERE id='20000000-0000-0000-0000-000000000002') AND (SELECT review_count=0 FROM public.guides WHERE id='10000000-0000-0000-0000-000000000002') AND (SELECT count(*)=0 FROM public.moderation_audit),'audit failure rolls back review, claim, rating and audit');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.admin_decide_review('30000000-0000-0000-0000-000000000002',true,'independent');
SELECT public.admin_decide_claim('20000000-0000-0000-0000-000000000002',true,'independent');
RESET ROLE;
SELECT public.fixture_assert((SELECT review_count=1 AND average_quality=3 FROM public.guides WHERE id='10000000-0000-0000-0000-000000000002') AND (SELECT status='approved' FROM public.guide_claims WHERE id='20000000-0000-0000-0000-000000000002') AND (SELECT count(*)=2 FROM public.moderation_audit),'independent decisions succeed and audit atomically');
