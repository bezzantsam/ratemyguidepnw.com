\set ON_ERROR_STOP on
-- Synthetic UUIDs and facts, never live user data.
INSERT INTO auth.users(id) VALUES ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003'),('00000000-0000-0000-0000-000000000004');
INSERT INTO public.guides(id,slug,full_name,listing_status) VALUES ('10000000-0000-0000-0000-000000000001','fixture-1','Fixture one','published'),('10000000-0000-0000-0000-000000000002','fixture-2','Fixture two','published');
INSERT INTO public.site_admins(user_id) VALUES ('00000000-0000-0000-0000-000000000004');
INSERT INTO public.guide_claims(id,guide_id,claimant_id,status) VALUES ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','approved'),('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','pending');
INSERT INTO public.claim_evidence(claim_id,claimant_name,public_evidence) VALUES ('20000000-0000-0000-0000-000000000002','Fixture claimant','synthetic evidence only');
INSERT INTO public.guide_details(guide_id,expertise) VALUES ('10000000-0000-0000-0000-000000000001','original');
CREATE FUNCTION public.audit_assert(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',message; END IF; RAISE NOTICE 'PASS: %',message; END$$;
GRANT EXECUTE ON FUNCTION public.audit_assert(boolean,text) TO anon,authenticated;
-- Denied calls and inserts are asserted via explicit exception handling.
SET ROLE anon;
DO $$BEGIN
 BEGIN INSERT INTO public.guide_claims(guide_id,claimant_id) VALUES ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002'); RAISE EXCEPTION 'anon inserted claim'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM public.claim_evidence) <> 0 THEN RAISE EXCEPTION 'anon read evidence'; END IF;
 RAISE NOTICE 'PASS: anonymous cannot submit claim or read evidence';
END$$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
DO $$BEGIN
 IF (SELECT count(*) FROM public.claim_evidence) <> 0 THEN RAISE EXCEPTION 'other user read evidence'; END IF;
 BEGIN PERFORM public.admin_decide_claim('20000000-0000-0000-0000-000000000002',true,NULL); RAISE EXCEPTION 'other user approved claim'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Not authorized' THEN RAISE; END IF; END;
 UPDATE public.guide_details SET expertise='unauthorized' WHERE guide_id='10000000-0000-0000-0000-000000000001';
 IF FOUND THEN RAISE EXCEPTION 'other user edited details'; END IF;
 RAISE NOTICE 'PASS: other user cannot read evidence, approve claim, or edit owner details';
END$$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT public.audit_assert((SELECT count(*) FROM public.claim_evidence)=1,'claimant reads own evidence');
INSERT INTO public.reviews(id,guide_id,author_id,quality,intensity,would_book_again,body) VALUES ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',5,4,true,repeat('synthetic ',10));
DO $$BEGIN
 BEGIN UPDATE public.reviews SET status='published',published_at=now() WHERE id='30000000-0000-0000-0000-000000000001'; IF FOUND THEN RAISE EXCEPTION 'user self published'; END IF; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.admin_decide_review('30000000-0000-0000-0000-000000000001',true,NULL); RAISE EXCEPTION 'user self approved'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Not authorized' THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS: ordinary user can submit pending but cannot publish or approve it';
END$$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
UPDATE public.guide_details SET expertise='owner edit' WHERE guide_id='10000000-0000-0000-0000-000000000001';
SELECT public.audit_assert((SELECT expertise='owner edit' FROM public.guide_details WHERE guide_id='10000000-0000-0000-0000-000000000001'),'approved owner can edit own detail');
DO $$BEGIN
 BEGIN INSERT INTO public.reviews(guide_id,author_id,quality,intensity,would_book_again,body) VALUES ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003',5,4,true,repeat('synthetic ',10)); RAISE EXCEPTION 'owner reviewed own guide'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'You cannot review a guide profile you own' THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS: approved owner cannot review own guide';
END$$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.audit_assert(public.is_site_admin(),'administrator identified');
SELECT public.audit_assert((SELECT count(*) FROM public.claim_evidence)=1,'administrator reads private claim evidence');
SELECT public.admin_decide_review('30000000-0000-0000-0000-000000000001',true,'synthetic');
SELECT public.audit_assert((SELECT review_count=1 AND average_quality=5 FROM public.guides WHERE id='10000000-0000-0000-0000-000000000002'),'published review updates aggregation');
SELECT public.admin_decide_claim('20000000-0000-0000-0000-000000000002',true,'synthetic');
SELECT public.audit_assert((SELECT count(*)=2 FROM public.moderation_audit),'admin decisions audited');
RESET ROLE;
-- Public review rows must exclude pending entries and private author IDs.
INSERT INTO public.reviews(id,guide_id,author_id,quality,intensity,would_book_again,body) VALUES ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004',3,4,false,repeat('synthetic ',10));
SET ROLE anon;
SELECT public.audit_assert((SELECT count(id)=0 FROM public.reviews WHERE id='30000000-0000-0000-0000-000000000002'),'anonymous cannot see pending review');
DO $$BEGIN
 BEGIN PERFORM author_id FROM public.reviews; RAISE EXCEPTION 'anonymous read author'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'PASS: anonymous cannot read reviewer identities';
END$$;
-- Test real view access, rather than assuming column grants and invoker view work together.
DO $$BEGIN
 BEGIN PERFORM count(*) FROM public.public_angler_reviews; RAISE EXCEPTION 'expected view grant mismatch'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'KNOWN GAP: public review view fails on underlying column privileges';
END$$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
DO $$BEGIN
 BEGIN PERFORM count(*) FROM public.admin_pending_reviews; RAISE EXCEPTION 'expected admin queue grant mismatch'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'KNOWN GAP: admin review queue fails on underlying column privileges';
END$$;
-- Expected unsafe baseline: the captured RPC permits admin self-approval.
SELECT public.admin_decide_review('30000000-0000-0000-0000-000000000002',true,'baseline gap');
RESET ROLE;
-- Captured claim RPC has the same self-approval gap (fixtures only).
INSERT INTO public.guides(id,slug,full_name,listing_status) VALUES ('10000000-0000-0000-0000-000000000003','fixture-3','Fixture three','published'),('10000000-0000-0000-0000-000000000004','fixture-4','Fixture four','published');
INSERT INTO public.guide_claims(id,guide_id,claimant_id) VALUES ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004'),('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000004');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.admin_decide_claim('20000000-0000-0000-0000-000000000003',true,'baseline gap');
RESET ROLE;
INSERT INTO public.reviews(id,guide_id,author_id,quality,intensity,would_book_again,body) VALUES ('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000004',3,4,false,repeat('synthetic ',10));
\ir ../../scripts/backend-audit/proposed-no-self-approval.sql
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
DO $$BEGIN
 BEGIN PERFORM public.admin_decide_review('30000000-0000-0000-0000-000000000003',true,NULL); RAISE EXCEPTION 'admin approved own review'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Cannot approve your own submission' THEN RAISE; END IF; END;
 BEGIN PERFORM public.admin_decide_claim('20000000-0000-0000-0000-000000000004',true,NULL); RAISE EXCEPTION 'admin approved own claim'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Cannot approve your own submission' THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS: proposed repair denies administrator self-approval for both target types';
END$$;
RESET ROLE;
-- The proposed guard still allows an administrator to decide other users' work.
INSERT INTO public.guides(id,slug,full_name,listing_status) VALUES ('10000000-0000-0000-0000-000000000005','fixture-5','Fixture five','published');
INSERT INTO public.guide_claims(id,guide_id,claimant_id) VALUES ('20000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000002');
INSERT INTO public.reviews(id,guide_id,author_id,quality,intensity,would_book_again,body) VALUES ('30000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000002',4,4,true,repeat('synthetic ',10));
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.admin_decide_review('30000000-0000-0000-0000-000000000004',true,'independent moderator');
SELECT public.admin_decide_claim('20000000-0000-0000-0000-000000000005',true,'independent moderator');
SELECT public.audit_assert((SELECT review_count=1 FROM public.guides WHERE id='10000000-0000-0000-0000-000000000005'),'proposed guard permits independent moderator and aggregation');
RESET ROLE;
