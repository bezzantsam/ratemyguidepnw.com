\set ON_ERROR_STOP on
-- 05 independent fixed-boundary assertions, disposable synthetic cluster ONLY.
BEGIN;
DO $$BEGIN
 IF session_user <> 'audit_owner' OR current_database() <> 'postgres'
    OR to_regprocedure('public.fixture_assert(boolean,text)') IS NULL
    OR (SELECT count(*) FROM auth.users) <> 6 OR (SELECT count(*) FROM public.guides) <> 3
 THEN RAISE EXCEPTION 'Refuse: not the dedicated synthetic audit cluster'; END IF;
END$$;
INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference)
VALUES ('OR','fixture-1','10000000-0000-0000-0000-000000000001',now(),'independent synthetic mapping');
UPDATE rmg_private.launch_control SET enabled=true WHERE singleton;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
DO $$BEGIN
 BEGIN
  PERFORM public.rmg_submit_claim('OR','fixture-1','Synthetic claimant','',repeat('x',1201));
  RAISE EXCEPTION 'QA: 1201-character claim evidence accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END$$;
SELECT public.fixture_assert(public.rmg_submit_claim('OR','fixture-1','Synthetic claimant','',repeat('x',1200))->>'status'='pending','1200-character claim evidence accepted');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
DO $$DECLARE item record; BEGIN
 FOR item IN SELECT * FROM (VALUES
  ('boat',repeat('x',251),'',NULL::smallint,'',''),
  ('gear','',repeat('x',501),NULL::smallint,'',''),
  ('experience','','',81::smallint,'',''),
  ('expertise','','',NULL::smallint,repeat('x',501),''),
  ('species','','',NULL::smallint,'',repeat('x',351))
 ) AS v(label,boat,gear,years,expertise,species) LOOP
  BEGIN
   PERFORM public.rmg_edit_details('OR','fixture-1',item.boat,item.gear,item.years,item.expertise,item.species);
   RAISE EXCEPTION 'QA: out-of-range % accepted',item.label;
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 END LOOP;
END$$;
SELECT public.fixture_assert(public.rmg_edit_details('OR','fixture-1',repeat('x',250),repeat('x',500),80::smallint,repeat('x',500),repeat('x',350))->>'status'='saved','all maximum supported profile values accepted');
RESET ROLE;
SELECT public.fixture_assert((SELECT length(boat)=250 AND length(gear)=500 AND years_experience=80 AND length(expertise)=500 AND length(targeted_species)=350 FROM public.guide_details WHERE guide_id='10000000-0000-0000-0000-000000000001'),'maximum profile values persisted in synthetic transaction');
ROLLBACK;
\echo 'PASS independent claim and profile boundary assertions; transaction rolled back'
