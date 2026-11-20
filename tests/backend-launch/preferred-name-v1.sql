\set ON_ERROR_STOP on
INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference) VALUES
 ('OR','OG.0001225.F&F','10000000-0000-0000-0000-000000000001',now(),'synthetic'),
 ('OR','OG.0000002','10000000-0000-0000-0000-000000000002',now(),'synthetic'),
 ('OR','OG.0000004','10000000-0000-0000-0000-000000000004',now(),'synthetic'),
 ('WA','wa-777','10000000-0000-0000-0000-000000000001',now(),'synthetic reviewed cross-state');
UPDATE rmg_private.claim_control_v1 SET enabled=true WHERE singleton;
DELETE FROM public.site_admins WHERE user_id='00000000-0000-0000-0000-000000000005';
-- Seed one real moderated synthetic trip on a different approved Oregon claim.
UPDATE rmg_private.launch_control SET enabled=true;
UPDATE rmg_private.guide_offerings_control_v1 SET enabled=true;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
SELECT public.rmg_guide_offerings_authorized_v1('owner_save',
 '{"jurisdiction":"OR","sourceId":"OG.0000004","expectedRevision":0,"draft":{"vessels":[],"offerings":[
 {"id":"p1","title":"Fixture reef trip","jurisdiction":"OR","waterway":"Pacific nearshore","launchArea":"Astoria",
 "species":[],"months":[],"vesselId":null,"bookingStyle":"call_to_confirm","duration":"half_day",
 "methodIds":["bottom-fishing"],"gearIds":[]}]}}');
SELECT public.rmg_guide_offerings_authorized_v1('owner_submit',
 '{"jurisdiction":"OR","sourceId":"OG.0000004","expectedRevision":1}')->'proposal'->>'id' AS trip_proposal \gset
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.rmg_guide_offerings_authorized_v1('moderator_decide',
 jsonb_build_object('proposalId',:'trip_proposal','approve',true,'reason','Synthetic verified fixture trip'));
RESET ROLE;
SELECT set_config('test.trip_snapshot',public.rmg_guide_offerings_public_v1('public_batch','{"afterSourceId":null,"limit":30}')::text,false);
UPDATE rmg_private.launch_control SET enabled=false;
SELECT set_config('test.guide_hash',(SELECT md5(string_agg(row_to_json(x)::text,',' ORDER BY id)) FROM public.guides x),false);
SELECT set_config('test.claim_hash',(SELECT md5(string_agg(row_to_json(x)::text,',' ORDER BY id)) FROM public.guide_claims x),false);
SELECT set_config('test.review_hash',(SELECT md5(string_agg(row_to_json(x)::text,',' ORDER BY id)) FROM public.reviews x),false);
SELECT set_config('test.map_hash',(SELECT md5(string_agg(row_to_json(x)::text,',' ORDER BY jurisdiction,source_id)) FROM rmg_private.guide_identity_map x),false);
SELECT public.fixture_assert((SELECT enabled IS FALSE FROM rmg_private.profile_name_control_v1 WHERE singleton),'name-specific database gate defaults off');
UPDATE rmg_private.profile_name_control_v1 SET enabled=true WHERE singleton;
SET ROLE anon;
DO $$BEGIN
 BEGIN PERFORM public.rmg_profile_names_v1('OR',ARRAY['OG.0001225.F&F']); RAISE EXCEPTION 'disabled read accepted'; EXCEPTION WHEN SQLSTATE 'P5030' THEN NULL; END;
 BEGIN PERFORM public.rmg_set_profile_name_v1('OR','OG.0001225.F&F','Sam'); RAISE EXCEPTION 'anonymous write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.rmg_own_profile_name_v1('OR','OG.0001225.F&F'); RAISE EXCEPTION 'anonymous owner read accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM rmg_private.profile_name_audit_v1; RAISE EXCEPTION 'audit leaked'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
RESET ROLE;
UPDATE rmg_private.profile_name_control_v1 SET enabled=false WHERE singleton;
UPDATE rmg_private.launch_control SET enabled=true WHERE singleton;
-- Base reviews remain available with preferred names independently off.
SET ROLE anon;
SELECT public.fixture_assert((public.rmg_review_write_availability('OR','OG.0000004')->>'available')::boolean,'base review readiness is unaffected by closed name gate');
DO $$BEGIN
 BEGIN PERFORM public.rmg_profile_names_v1('OR',ARRAY['OG.0001225.F&F']); RAISE EXCEPTION 'public names bypassed closed name gate'; EXCEPTION WHEN SQLSTATE 'P5030' THEN NULL; END;
 BEGIN PERFORM rmg_private.profile_names_v1('OR',ARRAY['OG.0001225.F&F']); RAISE EXCEPTION 'private names bypassed closed name gate'; EXCEPTION WHEN SQLSTATE 'P5030' THEN NULL; END;
 BEGIN UPDATE rmg_private.profile_name_control_v1 SET enabled=true; RAISE EXCEPTION 'anon toggled name gate'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
RESET ROLE;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
SELECT public.fixture_assert(public.rmg_submit_review('OR','OG.0000004',5::smallint,NULL,NULL,'Synthetic test',true,'none')->>'status'='pending','base review write works with name gate off');
ROLLBACK;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
DO $$BEGIN
 BEGIN PERFORM public.rmg_set_profile_name_v1('OR','OG.0001225.F&F','Scott'); RAISE EXCEPTION 'public owner write bypassed closed name gate'; EXCEPTION WHEN SQLSTATE 'P5030' THEN NULL; END;
 BEGIN PERFORM rmg_private.set_profile_name_v1('OR','OG.0001225.F&F','Scott'); RAISE EXCEPTION 'private owner write bypassed closed name gate'; EXCEPTION WHEN SQLSTATE 'P5030' THEN NULL; END;
 BEGIN PERFORM public.rmg_own_profile_name_v1('OR','OG.0001225.F&F'); RAISE EXCEPTION 'public owner read bypassed closed name gate'; EXCEPTION WHEN SQLSTATE 'P5030' THEN NULL; END;
 BEGIN PERFORM rmg_private.own_profile_name_v1('OR','OG.0001225.F&F'); RAISE EXCEPTION 'private owner read bypassed closed name gate'; EXCEPTION WHEN SQLSTATE 'P5030' THEN NULL; END;
 BEGIN UPDATE rmg_private.profile_name_control_v1 SET enabled=true; RAISE EXCEPTION 'authenticated toggled name gate'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM rmg_private.require_profile_name_v1(); RAISE EXCEPTION 'internal gate helper exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
DO $$BEGIN
 BEGIN PERFORM public.rmg_admin_set_profile_name_v1('OR','OG.0001225.F&F','Scott','test'); RAISE EXCEPTION 'public admin write bypassed closed name gate'; EXCEPTION WHEN SQLSTATE 'P5030' THEN NULL; END;
 BEGIN PERFORM rmg_private.admin_set_profile_name_v1('OR','OG.0001225.F&F','Scott','test'); RAISE EXCEPTION 'private admin write bypassed closed name gate'; EXCEPTION WHEN SQLSTATE 'P5030' THEN NULL; END;
 BEGIN PERFORM public.rmg_profile_name_review_v1('OR','OG.0001225.F&F'); RAISE EXCEPTION 'public admin read bypassed closed name gate'; EXCEPTION WHEN SQLSTATE 'P5030' THEN NULL; END;
 BEGIN PERFORM rmg_private.profile_name_review_v1('OR','OG.0001225.F&F'); RAISE EXCEPTION 'private admin read bypassed closed name gate'; EXCEPTION WHEN SQLSTATE 'P5030' THEN NULL; END;
END$$;
RESET ROLE;
SELECT public.fixture_assert((SELECT count(*)=0 FROM rmg_private.profile_name_audit_v1),'closed name gate created no name audit rows');
UPDATE rmg_private.profile_name_control_v1 SET enabled=true WHERE singleton;
SET ROLE anon;
SELECT public.fixture_assert(public.rmg_profile_names_v1('OR',ARRAY['OG.0001225.F&F','missing'])='[]'::jsonb,'unmodified record returns no preferred name');
SELECT public.fixture_assert(public.rmg_profile_details('OR','OG.0001225.F&F') IS NULL,'legacy profile details remain hidden before any declaration');
SELECT public.fixture_assert(public.rmg_profile_details('OR','OG.0000004')->>'boat'='Prior boat','existing owner declarations remain readable');
DO $$BEGIN
 BEGIN PERFORM public.rmg_profile_names_v1('CA',ARRAY['OG.0001225.F&F']); RAISE EXCEPTION 'bad jurisdiction accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.rmg_profile_names_v1('OR',ARRAY[NULL]::text[]); RAISE EXCEPTION 'null source accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.rmg_profile_names_v1('OR',array_fill('OG.0001225.F&F'::text,ARRAY[101])); RAISE EXCEPTION 'oversized batch accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END$$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
DO $$BEGIN
 BEGIN PERFORM public.rmg_set_profile_name_v1('OR','OG.0001225.F&F','Other'); RAISE EXCEPTION 'unrelated owner write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.rmg_own_profile_name_v1('OR','OG.0001225.F&F'); RAISE EXCEPTION 'unrelated owner read accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.rmg_admin_set_profile_name_v1('OR','OG.0001225.F&F','Other','reason'); RAISE EXCEPTION 'nonadmin correction accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.rmg_profile_name_review_v1('OR','OG.0001225.F&F'); RAISE EXCEPTION 'nonadmin audit view accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM rmg_private.profile_name_admin_v1; RAISE EXCEPTION 'admin state exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM rmg_private.profile_name_audit_v1; RAISE EXCEPTION 'audit exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE rmg_private.profile_declarations SET preferred_name='Bypass'; RAISE EXCEPTION 'direct declaration write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
SELECT public.fixture_assert(public.rmg_own_profile_name_v1('OR','OG.0001225.F&F')->'name'='null'::jsonb AND NOT (public.rmg_own_profile_name_v1('OR','OG.0001225.F&F')->>'overridden')::boolean,'owner sees no declaration or override initially');
DO $$BEGIN
 BEGIN PERFORM public.rmg_set_profile_name_v1('OR','OG.0000002','Other'); RAISE EXCEPTION 'wrong guide write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.rmg_set_profile_name_v1('WA','OG.0001225.F&F','Other'); RAISE EXCEPTION 'wrong jurisdiction accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.rmg_set_profile_name_v1('OR','OG.0001225.F&F','<b>Bad</b>'); RAISE EXCEPTION 'HTML accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.rmg_set_profile_name_v1('OR','OG.0001225.F&F',repeat('é',81)); RAISE EXCEPTION 'overlong unicode name accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.rmg_set_profile_name_v1('OR','OG.0001225.F&F',E'Bad\nName'); RAISE EXCEPTION 'control char accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END$$;
SELECT public.fixture_assert(public.rmg_set_profile_name_v1('OR','OG.0001225.F&F','  Zoë 🐟  ')->>'status'='saved','approved owner can set trimmed Unicode name');
SELECT public.fixture_assert(public.rmg_profile_names_v1('OR',ARRAY['OG.0001225.F&F'])->0->>'preferred_name'='Zoë 🐟','Unicode name is returned');
SELECT public.fixture_assert(public.rmg_profile_names_v1('OR',ARRAY['OG.0001225.F&F'])->0->>'provenance'='captain','owner provenance public without actor');
SELECT public.fixture_assert(NOT ((public.rmg_profile_names_v1('OR',ARRAY['OG.0001225.F&F'])->0) ? 'actor_id'),'projection excludes private actor');
RESET ROLE;
SET ROLE anon;
SELECT public.fixture_assert(public.rmg_profile_names_v1('OR',ARRAY['OG.0001225.F&F'])->0->>'preferred_name'='Zoë 🐟','anonymous public projection returns active name');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
SELECT public.fixture_assert(public.rmg_profile_details('OR','OG.0001225.F&F') IS NULL,'name-only declaration cannot expose legacy details');
DO $$BEGIN
 BEGIN PERFORM public.rmg_edit_details('OR','OG.0001225.F&F','Boat','Gear',5::smallint,'Experience','Species');
 RAISE EXCEPTION 'legacy detail RPC unlocked'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM rmg_private.edit_details('OR','OG.0001225.F&F','Boat','Gear',5::smallint,'Experience','Species');
 RAISE EXCEPTION 'private legacy detail RPC unlocked'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
SELECT public.fixture_assert(public.rmg_profile_details('OR','OG.0001225.F&F') IS NULL
 AND public.rmg_profile_details('OR','OG.0000004')->>'boat'='Prior boat',
 'name-only rows leave legacy unverified details hidden and declared details visible');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.fixture_assert(public.rmg_admin_set_profile_name_v1('OR','OG.0001225.F&F',' Scott ',U&'\00A0Sam editorial correction\2003')->>'status'='saved','admin can record attributed correction');
SELECT public.fixture_assert(public.rmg_profile_names_v1('OR',ARRAY['OG.0001225.F&F'])->0->>'preferred_name'='Scott','admin correction wins');
SELECT public.fixture_assert(public.rmg_profile_name_review_v1('OR','OG.0001225.F&F')->>'captain_name'='Zoë 🐟' AND public.rmg_profile_name_review_v1('OR','OG.0001225.F&F')->>'admin_name'='Scott','admin can review both values');
SELECT public.fixture_assert(jsonb_array_length(public.rmg_profile_name_review_v1('OR','OG.0001225.F&F')->'history')=2 AND NOT (public.rmg_profile_name_review_v1('OR','OG.0001225.F&F')->'history'->0 ? 'actor_id'),'admin can review bounded history without actor IDs');
SELECT public.fixture_assert(public.rmg_profile_names_v1('WA',ARRAY['wa-777'])='[]'::jsonb,'held WA alias cannot inherit an Oregon display name');
DO $$BEGIN
 BEGIN PERFORM public.rmg_admin_set_profile_name_v1('OR','OG.0001225.F&F','Sam','  '); RAISE EXCEPTION 'missing reason accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.rmg_admin_set_profile_name_v1('OR','OG.0001225.F&F','Sam',U&'\00A0\2003'); RAISE EXCEPTION 'Unicode whitespace-only reason accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END$$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
SELECT public.fixture_assert(public.rmg_set_profile_name_v1('OR','OG.0001225.F&F','Captain Sam')->>'status'='saved','owner edit persists under override');
SELECT public.fixture_assert(public.rmg_profile_names_v1('OR',ARRAY['OG.0001225.F&F'])->0->>'preferred_name'='Scott','owner edit does not replace admin override');
SELECT public.fixture_assert(public.rmg_own_profile_name_v1('OR','OG.0001225.F&F')->>'name'='Captain Sam' AND (public.rmg_own_profile_name_v1('OR','OG.0001225.F&F')->>'overridden')::boolean,'owner can read own hidden value and override state');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.fixture_assert(public.rmg_admin_set_profile_name_v1('OR','OG.0001225.F&F',NULL,'remove editorial override')->>'status'='saved','admin can clear override');
SELECT public.fixture_assert(public.rmg_profile_names_v1('OR',ARRAY['OG.0001225.F&F'])->0->>'preferred_name'='Captain Sam','clearing override reveals owner value');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
SELECT public.fixture_assert(public.rmg_set_profile_name_v1('OR','OG.0001225.F&F','   ')->>'status'='saved','owner can clear with whitespace');
SELECT public.fixture_assert(public.rmg_profile_names_v1('OR',ARRAY['OG.0001225.F&F'])='[]'::jsonb,'cleared names no longer project');
SELECT public.fixture_assert(public.rmg_set_profile_name_v1('OR','OG.0001225.F&F',repeat('é',80))->>'status'='saved','80 Unicode codepoints accepted');
RESET ROLE;
SELECT public.fixture_assert((SELECT count(*)=6 FROM rmg_private.profile_name_audit_v1),'owner/admin changes and clear retain audit');
SELECT public.fixture_assert(rmg_private.normalize_preferred_name_v1(U&'\00A0Scott\2003')='Scott','Unicode whitespace trims independent of database locale');
SELECT public.fixture_assert(rmg_private.normalize_preferred_name_v1(U&'\00A0\2003') IS NULL,'Unicode whitespace-only input clears');
DO $$DECLARE cp integer; white text; BEGIN
 FOREACH cp IN ARRAY ARRAY[9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279] LOOP
  white:=chr(cp);
  IF rmg_private.normalize_preferred_name_v1(white||'Scott'||white) IS DISTINCT FROM 'Scott' OR rmg_private.normalize_preferred_name_v1(white) IS NOT NULL THEN RAISE EXCEPTION 'Unicode whitespace mismatch: %',cp; END IF;
 END LOOP;
 RAISE NOTICE 'PASS: all 25 ECMAScript whitespace characters trim and clear';
END$$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
SELECT public.fixture_assert(public.rmg_set_profile_name_v1('OR','OG.0000004',U&'\00A0\2003')->>'status'='saved','direct owner RPC clears Unicode whitespace');
SELECT public.fixture_assert(public.rmg_own_profile_name_v1('OR','OG.0000004')->'name'='null'::jsonb AND public.rmg_profile_names_v1('OR',ARRAY['OG.0000004'])='[]'::jsonb,'Unicode whitespace-only value is absent from projection');
SELECT public.fixture_assert(public.rmg_set_profile_name_v1('OR','OG.0000004',U&'\00A0Scott\2003')->>'status'='saved','direct owner RPC accepts Unicode padded name');
SELECT public.fixture_assert(public.rmg_own_profile_name_v1('OR','OG.0000004')->>'name'='Scott' AND public.rmg_profile_names_v1('OR',ARRAY['OG.0000004'])->0->>'preferred_name'='Scott','Unicode padded name round-trips trimmed');
RESET ROLE;
SELECT public.fixture_assert((SELECT count(*)=2 FROM rmg_private.profile_name_audit_v1 WHERE origin='admin' AND actor_id='00000000-0000-0000-0000-000000000004' AND reason IS NOT NULL),'admin evidence records actor and reason privately');
SELECT public.fixture_assert((SELECT count(*)=1 FROM rmg_private.profile_name_audit_v1 WHERE origin='admin' AND reason='Sam editorial correction'),'Unicode padded editorial reason is trimmed');
SELECT public.fixture_assert((SELECT md5(string_agg(row_to_json(x)::text,',' ORDER BY id)) FROM public.guides x)=current_setting('test.guide_hash'),'canonical guide rows unchanged');
SELECT public.fixture_assert((SELECT md5(string_agg(row_to_json(x)::text,',' ORDER BY id)) FROM public.guide_claims x)=current_setting('test.claim_hash'),'claim rows and links unchanged');
SELECT public.fixture_assert((SELECT md5(string_agg(row_to_json(x)::text,',' ORDER BY id)) FROM public.reviews x)=current_setting('test.review_hash'),'reviews and links unchanged');
SELECT public.fixture_assert((SELECT md5(string_agg(row_to_json(x)::text,',' ORDER BY jurisdiction,source_id)) FROM rmg_private.guide_identity_map x)=current_setting('test.map_hash'),'stable ID mappings unchanged');
-- Revoking the approval hides the formerly authorized owner name and blocks edits.
\set source_id 'OG.0001225.F&F'
\set claim_id '20000000-0000-0000-0000-000000000001'
\set operator_id '00000000-0000-0000-0000-000000000004'
\set reason 'Synthetic evidence of erroneous approval'
BEGIN;
\i :revocation_sql
COMMIT;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
SELECT public.fixture_assert(public.rmg_profile_names_v1('OR',ARRAY['OG.0001225.F&F'])='[]'::jsonb,'revoked owner name is not projected');
DO $$BEGIN
 BEGIN PERFORM public.rmg_set_profile_name_v1('OR','OG.0001225.F&F','Stale Owner'); RAISE EXCEPTION 'revoked owner edit accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.rmg_own_profile_name_v1('OR','OG.0001225.F&F'); RAISE EXCEPTION 'revoked owner read accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
RESET ROLE;
BEGIN;
UPDATE rmg_private.claim_control_v1 SET enabled=false;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',true);
DO $$BEGIN
 BEGIN PERFORM public.rmg_own_profile_name_v1('OR','OG.0000004'); RAISE EXCEPTION 'owner read bypassed paused claims'; EXCEPTION WHEN SQLSTATE 'P5030' THEN NULL; END;
 BEGIN PERFORM public.rmg_set_profile_name_v1('OR','OG.0000004','Blocked'); RAISE EXCEPTION 'owner write bypassed paused claims'; EXCEPTION WHEN SQLSTATE 'P5030' THEN NULL; END;
END$$;
SELECT public.fixture_assert(public.rmg_profile_names_v1('OR',ARRAY['OG.0000004'])->0->>'preferred_name'='Scott',
 'claims pause denies owner RPCs while retained approved name remains readable');
ROLLBACK;
UPDATE auth.users SET email_confirmed_at=NULL WHERE id='00000000-0000-0000-0000-000000000004';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
DO $$BEGIN
 BEGIN PERFORM public.rmg_admin_set_profile_name_v1('OR','OG.0001225.F&F','Invalid','reason'); RAISE EXCEPTION 'unconfirmed admin accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
RESET ROLE;
SELECT public.fixture_assert(public.rmg_guide_offerings_public_v1('public_batch','{"afterSourceId":null,"limit":30}')::text=current_setting('test.trip_snapshot'),
 'name changes and claim revocation leave the catalog publication identical');
