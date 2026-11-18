\set ON_ERROR_STOP on
-- Disposable synthetic QA ONLY: reproduce candidate contract vs retained catalog.
BEGIN;
DO $$BEGIN
 IF session_user <> 'audit_owner' OR current_database() <> 'postgres'
    OR to_regprocedure('public.fixture_assert(boolean,text)') IS NULL
    OR (SELECT count(*) FROM auth.users) <> 6
    OR (SELECT count(*) FROM public.guides) <> 3
 THEN RAISE EXCEPTION 'Refuse: not the dedicated synthetic audit cluster'; END IF;
END$$;
INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference)
VALUES ('OR','fixture-1','10000000-0000-0000-0000-000000000001',now(),'independent synthetic mapping');
UPDATE rmg_private.launch_control SET enabled=true WHERE singleton;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
DO $$DECLARE c text; BEGIN
 BEGIN
  PERFORM public.rmg_submit_claim('OR','fixture-1','Synthetic claimant','',repeat('x',1201));
  RAISE EXCEPTION 'QA: expected retained 1200-character constraint, request succeeded';
 EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS c = CONSTRAINT_NAME;
  IF c <> 'claim_evidence_public_evidence_check' THEN RAISE; END IF;
  RAISE NOTICE 'REPRO: 1201-character evidence fails %',c;
 END;
END$$;
SELECT public.fixture_assert(public.rmg_submit_claim('OR','fixture-1','Synthetic claimant','',repeat('x',1200))->>'status'='pending','1200-character evidence accepted at catalog boundary');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
DO $$DECLARE c text; item record; BEGIN
 FOR item IN SELECT * FROM (VALUES
  ('boat',repeat('x',251),'',NULL::smallint,'','', 'guide_details_boat_check'),
  ('experience','','',81::smallint,'','', 'guide_details_years_experience_check'),
  ('expertise','','',NULL::smallint,repeat('x',501),'', 'guide_details_expertise_check'),
  ('species','','',NULL::smallint,'',repeat('x',351), 'guide_details_targeted_species_check')
 ) AS v(label,boat,gear,years,expertise,species,expected_constraint) LOOP
  BEGIN
   PERFORM public.rmg_edit_details('OR','fixture-1',item.boat,item.gear,item.years,item.expertise,item.species);
   RAISE EXCEPTION 'QA: expected catalog constraint for %',item.label;
  EXCEPTION WHEN check_violation THEN
   GET STACKED DIAGNOSTICS c = CONSTRAINT_NAME;
   IF c <> item.expected_constraint THEN RAISE; END IF;
   RAISE NOTICE 'REPRO: allowed % rejected by %',item.label,c;
  END;
 END LOOP;
END$$;
SELECT public.fixture_assert(public.rmg_edit_details('OR','fixture-1','',repeat('x',500),NULL::smallint,'','')->>'status'='saved','500-character gear within both candidate and catalog limits');
DO $$BEGIN
 BEGIN
  PERFORM public.rmg_edit_details('OR','fixture-1','',repeat('x',501),NULL::smallint,'','');
  RAISE EXCEPTION 'QA: 501-character gear accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END$$;
RESET ROLE;
ROLLBACK;
\echo 'PASS reproduction assertions; all synthetic writes rolled back'
