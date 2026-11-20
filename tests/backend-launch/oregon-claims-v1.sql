\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION public.fixture_claim_denial(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE=expected THEN RETURN; END IF; RAISE;
  END;
  RAISE EXCEPTION 'Expected SQLSTATE % for claim fixture call',expected;
END $$;
CREATE FUNCTION public.fixture_approved_owner(source text) RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT c.guide_id FROM public.guide_claims c WHERE c.id=rmg_private.approved_owner_claim_for_source_v1('OR',source,true);
$$;
REVOKE ALL ON FUNCTION public.fixture_approved_owner(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fixture_approved_owner(text) TO authenticated;
INSERT INTO public.guides(id,slug,full_name,listing_status) VALUES
 ('10000000-0000-0000-0000-000000000101','fixture-claim-one','Fixture claimant listing','published'),
 ('10000000-0000-0000-0000-000000000102','fixture-claim-two','Fixture neighboring listing','published');
INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference) VALUES
 ('OR','OG.0001225.F&F','10000000-0000-0000-0000-000000000101',now(),'fixture'),
 ('WA','wa-fixture','10000000-0000-0000-0000-000000000101',now(),'fixture'),
 ('OR','OG.0000484.BRO','10000000-0000-0000-0000-000000000102',now(),'fixture');
SELECT public.fixture_assert(NOT has_function_privilege('authenticated','public.admin_decide_claim(uuid,boolean,text)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.rmg_submit_claim(text,text,text,text,text)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.rmg_edit_details(text,text,text,text,smallint,text,text)','EXECUTE')
 AND NOT has_function_privilege('authenticated','rmg_private.approved_owner_claim_for_source_v1(text,text,boolean)','EXECUTE')
 AND NOT has_table_privilege('authenticated','public.admin_pending_claims','SELECT'), 'legacy writes and queue stay revoked');
SET ROLE anon;
SELECT public.fixture_assert(public.rmg_claim_availability_v1('OR','OG.0001225.F&F')='{"available":false}'::jsonb,'claim gate defaults closed');
SELECT public.fixture_claim_denial($q$SELECT public.rmg_claim_status_v1('OR','OG.0001225.F&F')$q$,'42501');
RESET ROLE;
UPDATE rmg_private.claim_control_v1 SET enabled=true WHERE singleton;
SET ROLE anon;
SELECT public.fixture_assert(public.rmg_claim_availability_v1('OR','OG.0001225.F&F')='{"available":true}'::jsonb
 AND public.rmg_claim_availability_v1('OR','OG.0001225')='{"available":false}'::jsonb
 AND public.rmg_claim_availability_v1('WA','wa-fixture')='{"available":false}'::jsonb,
 'signed-out exact Oregon source available while review gate closed, alias and stem held');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
SELECT public.fixture_claim_denial($q$SELECT public.rmg_submit_claim_v1('WA','wa-fixture','Fixture Captain','','Private verifiable ownership evidence')$q$,'P0002');
SELECT public.fixture_assert(public.rmg_claim_status_v1('OR','OG.0001225.F&F')->>'status'='none','initial signed-in status');
SELECT (public.rmg_submit_claim_v1('OR','OG.0001225.F&F','Fixture Captain','','Private verifiable ownership evidence')->>'id') AS owner_claim \gset
SELECT public.fixture_assert(public.rmg_submit_claim_v1('OR','OG.0001225.F&F','Fixture Captain','','Private verifiable ownership evidence')->>'existing'='true'
 AND public.rmg_claim_status_v1('OR','OG.0001225.F&F')->>'status'='pending','pending persists and retries retain one receipt');
SELECT public.fixture_claim_denial($q$SELECT public.rmg_claim_queue_v1(0,50)$q$,'42501');
SELECT public.fixture_claim_denial($q$SELECT public.fixture_approved_owner('OG.0001225.F&F')$q$,'42501');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
SELECT public.fixture_assert(NOT EXISTS (SELECT 1 FROM public.claim_evidence WHERE claim_id=:'owner_claim'),'evidence private from competing account');
SELECT public.fixture_assert(public.rmg_claim_status_v1('OR','OG.0001225.F&F')->>'status'='none','competing account cannot read pending claim');
SELECT (public.rmg_submit_claim_v1('OR','OG.0001225.F&F','Second Captain','','Second private verifiable ownership evidence')->>'id') AS other_claim \gset
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
SELECT public.fixture_assert(EXISTS (SELECT FROM jsonb_array_elements(public.rmg_claim_queue_v1(0,50)) item WHERE item->>'id'=:'owner_claim' AND item->>'source_id'='OG.0001225.F&F' AND item->>'public_evidence'='Private verifiable ownership evidence'), 'moderator sees exact source and proof');
SELECT public.fixture_claim_denial(format('SELECT public.rmg_decide_claim_v1(%L,true,%L)',:'owner_claim','short'),'22023');
SELECT public.fixture_assert(public.rmg_decide_claim_v1(:'owner_claim',true,'Independently checked registration and business')->>'status'='approved','approved claim receipt');
SELECT public.fixture_claim_denial(format('SELECT public.rmg_decide_claim_v1(%L,true,%L)',:'other_claim','Independently checked registration and business'),'P0001');
SELECT public.fixture_assert(public.rmg_decide_claim_v1(:'other_claim',false,'Independent proof did not match')->>'status'='denied','competing claim can be rejected');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
SELECT public.fixture_assert(public.rmg_claim_status_v1('OR','OG.0001225.F&F')->>'status'='denied','rejected claim persists');
SELECT public.fixture_claim_denial($q$SELECT public.fixture_approved_owner('OG.0001225.F&F')$q$,'42501');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
SELECT public.fixture_assert(public.rmg_claim_status_v1('OR','OG.0001225.F&F')->>'status'='approved'
 AND public.fixture_approved_owner('OG.0001225.F&F')='10000000-0000-0000-0000-000000000101','approved owner resumes on exact listing');
SELECT public.fixture_claim_denial($q$SELECT public.fixture_approved_owner('OG.0000484.BRO')$q$,'42501');
RESET ROLE;
UPDATE public.guide_claims SET status='denied' WHERE id=:'owner_claim';
SET ROLE authenticated;
SELECT public.fixture_claim_denial($q$SELECT public.fixture_approved_owner('OG.0001225.F&F')$q$,'42501');
RESET ROLE;
UPDATE public.guide_claims SET status='approved' WHERE id=:'owner_claim';
UPDATE rmg_private.launch_control SET enabled=true WHERE singleton;
UPDATE rmg_private.claim_control_v1 SET enabled=false WHERE singleton;
SET ROLE authenticated;
SELECT public.fixture_claim_denial($q$SELECT public.fixture_approved_owner('OG.0001225.F&F')$q$,'P5030');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
SELECT public.fixture_assert(public.rmg_claim_availability_v1('OR','OG.0001225.F&F')='{"available":false}'::jsonb
 AND public.rmg_review_write_availability('OR','OG.0000484.BRO')='{"available":true}'::jsonb
 AND public.rmg_submit_review_v2('OR','OG.0000484.BRO',4::smallint,NULL,NULL,'test review',true,'none',NULL,'2026-05')->>'status'='pending','claim pause leaves Oregon review write available');
RESET ROLE;
SELECT public.fixture_assert((SELECT count(*)=2 FROM public.guide_claims WHERE id IN (:'owner_claim',:'other_claim'))
 AND (SELECT count(*)=2 FROM public.claim_evidence WHERE claim_id IN (:'owner_claim',:'other_claim')),'claim pause retains rows and evidence');
ROLLBACK;
