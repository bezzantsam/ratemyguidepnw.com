\set ON_ERROR_STOP on
INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference) VALUES
 ('OR','fixture-1','10000000-0000-0000-0000-000000000001',now(),'synthetic'),
 ('OR','fixture-2','10000000-0000-0000-0000-000000000002',now(),'synthetic'),
 ('OR','fixture-4','10000000-0000-0000-0000-000000000004',now(),'synthetic'),
 ('WA','wa-777','10000000-0000-0000-0000-000000000001',now(),'synthetic reviewed cross-state');
DELETE FROM public.site_admins WHERE user_id='00000000-0000-0000-0000-000000000005';
SELECT set_config('test.guide_hash',(SELECT md5(string_agg(row_to_json(x)::text,',' ORDER BY id)) FROM public.guides x),false);
SELECT set_config('test.claim_hash',(SELECT md5(string_agg(row_to_json(x)::text,',' ORDER BY id)) FROM public.guide_claims x),false);
SELECT set_config('test.review_hash',(SELECT md5(string_agg(row_to_json(x)::text,',' ORDER BY id)) FROM public.reviews x),false);
SELECT set_config('test.map_hash',(SELECT md5(string_agg(row_to_json(x)::text,',' ORDER BY jurisdiction,source_id)) FROM rmg_private.guide_identity_map x),false);
SET ROLE anon;
DO $$BEGIN
 BEGIN PERFORM public.rmg_profile_names_v1('OR',ARRAY['fixture-1']); RAISE EXCEPTION 'disabled read accepted'; EXCEPTION WHEN SQLSTATE 'P5030' THEN NULL; END;
 BEGIN PERFORM public.rmg_set_profile_name_v1('OR','fixture-1','Sam'); RAISE EXCEPTION 'anonymous write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.rmg_own_profile_name_v1('OR','fixture-1'); RAISE EXCEPTION 'anonymous owner read accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM rmg_private.profile_name_audit_v1; RAISE EXCEPTION 'audit leaked'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
RESET ROLE;
UPDATE rmg_private.launch_control SET enabled=true WHERE singleton;
SET ROLE anon;
SELECT public.fixture_assert(public.rmg_profile_names_v1('OR',ARRAY['fixture-1','missing'])='[]'::jsonb,'unmodified record returns no preferred name');
SELECT public.fixture_assert(public.rmg_profile_details('OR','fixture-1') IS NULL,'legacy profile details remain hidden before any declaration');
SELECT public.fixture_assert(public.rmg_profile_details('OR','fixture-4')->>'boat'='Prior boat','existing owner declarations remain readable');
DO $$BEGIN
 BEGIN PERFORM public.rmg_profile_names_v1('CA',ARRAY['fixture-1']); RAISE EXCEPTION 'bad jurisdiction accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.rmg_profile_names_v1('OR',ARRAY[NULL]::text[]); RAISE EXCEPTION 'null source accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.rmg_profile_names_v1('OR',array_fill('fixture-1'::text,ARRAY[101])); RAISE EXCEPTION 'oversized batch accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END$$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
DO $$BEGIN
 BEGIN PERFORM public.rmg_set_profile_name_v1('OR','fixture-1','Other'); RAISE EXCEPTION 'unrelated owner write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.rmg_own_profile_name_v1('OR','fixture-1'); RAISE EXCEPTION 'unrelated owner read accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.rmg_admin_set_profile_name_v1('OR','fixture-1','Other','reason'); RAISE EXCEPTION 'nonadmin correction accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.rmg_profile_name_review_v1('OR','fixture-1'); RAISE EXCEPTION 'nonadmin audit view accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM rmg_private.profile_name_admin_v1; RAISE EXCEPTION 'admin state exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM rmg_private.profile_name_audit_v1; RAISE EXCEPTION 'audit exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE rmg_private.profile_declarations SET preferred_name='Bypass'; RAISE EXCEPTION 'direct declaration write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
SELECT public.fixture_assert(public.rmg_own_profile_name_v1('OR','fixture-1')->'name'='null'::jsonb AND NOT (public.rmg_own_profile_name_v1('OR','fixture-1')->>'overridden')::boolean,'owner sees no declaration or override initially');
DO $$BEGIN
 BEGIN PERFORM public.rmg_set_profile_name_v1('OR','fixture-2','Other'); RAISE EXCEPTION 'wrong guide write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.rmg_set_profile_name_v1('WA','fixture-1','Other'); RAISE EXCEPTION 'wrong jurisdiction accepted'; EXCEPTION WHEN no_data_found THEN NULL; END;
 BEGIN PERFORM public.rmg_set_profile_name_v1('OR','fixture-1','<b>Bad</b>'); RAISE EXCEPTION 'HTML accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.rmg_set_profile_name_v1('OR','fixture-1',repeat('é',81)); RAISE EXCEPTION 'overlong unicode name accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.rmg_set_profile_name_v1('OR','fixture-1',E'Bad\nName'); RAISE EXCEPTION 'control char accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END$$;
SELECT public.fixture_assert(public.rmg_set_profile_name_v1('OR','fixture-1','  Zoë 🐟  ')->>'status'='saved','approved owner can set trimmed Unicode name');
SELECT public.fixture_assert(public.rmg_profile_names_v1('OR',ARRAY['fixture-1'])->0->>'preferred_name'='Zoë 🐟','Unicode name is returned');
SELECT public.fixture_assert(public.rmg_profile_names_v1('OR',ARRAY['fixture-1'])->0->>'provenance'='captain','owner provenance public without actor');
SELECT public.fixture_assert(NOT ((public.rmg_profile_names_v1('OR',ARRAY['fixture-1'])->0) ? 'actor_id'),'projection excludes private actor');
RESET ROLE;
SET ROLE anon;
SELECT public.fixture_assert(public.rmg_profile_names_v1('OR',ARRAY['fixture-1'])->0->>'preferred_name'='Zoë 🐟','anonymous public projection returns active name');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
SELECT public.fixture_assert(public.rmg_profile_details('OR','fixture-1') IS NULL,'name-only declaration cannot expose legacy details');
SELECT public.fixture_assert(public.rmg_edit_details('OR','fixture-1','Boat','Gear',5::smallint,'Expertise','Species')->>'status'='saved','old detail write remains compatible');
SELECT public.fixture_assert(public.rmg_profile_details('OR','fixture-1')->>'boat'='Boat','old detail projection activates only after detail declaration');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.fixture_assert(public.rmg_admin_set_profile_name_v1('OR','fixture-1',' Scott ',U&'\00A0Sam editorial correction\2003')->>'status'='saved','admin can record attributed correction');
SELECT public.fixture_assert(public.rmg_profile_names_v1('OR',ARRAY['fixture-1'])->0->>'preferred_name'='Scott','admin correction wins');
SELECT public.fixture_assert(public.rmg_profile_name_review_v1('OR','fixture-1')->>'captain_name'='Zoë 🐟' AND public.rmg_profile_name_review_v1('OR','fixture-1')->>'admin_name'='Scott','admin can review both values');
SELECT public.fixture_assert(jsonb_array_length(public.rmg_profile_name_review_v1('OR','fixture-1')->'history')=2 AND NOT (public.rmg_profile_name_review_v1('OR','fixture-1')->'history'->0 ? 'actor_id'),'admin can review bounded history without actor IDs');
SELECT public.fixture_assert(public.rmg_profile_names_v1('WA',ARRAY['wa-777'])->0->>'provenance'='admin','reviewed cross-state source returns same preferred value');
DO $$BEGIN
 BEGIN PERFORM public.rmg_admin_set_profile_name_v1('OR','fixture-1','Sam','  '); RAISE EXCEPTION 'missing reason accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.rmg_admin_set_profile_name_v1('OR','fixture-1','Sam',U&'\00A0\2003'); RAISE EXCEPTION 'Unicode whitespace-only reason accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END$$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
SELECT public.fixture_assert(public.rmg_set_profile_name_v1('OR','fixture-1','Captain Sam')->>'status'='saved','owner edit persists under override');
SELECT public.fixture_assert(public.rmg_profile_names_v1('OR',ARRAY['fixture-1'])->0->>'preferred_name'='Scott','owner edit does not replace admin override');
SELECT public.fixture_assert(public.rmg_own_profile_name_v1('OR','fixture-1')->>'name'='Captain Sam' AND (public.rmg_own_profile_name_v1('OR','fixture-1')->>'overridden')::boolean,'owner can read own hidden value and override state');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.fixture_assert(public.rmg_admin_set_profile_name_v1('OR','fixture-1',NULL,'remove editorial override')->>'status'='saved','admin can clear override');
SELECT public.fixture_assert(public.rmg_profile_names_v1('OR',ARRAY['fixture-1'])->0->>'preferred_name'='Captain Sam','clearing override reveals owner value');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
SELECT public.fixture_assert(public.rmg_set_profile_name_v1('OR','fixture-1','   ')->>'status'='saved','owner can clear with whitespace');
SELECT public.fixture_assert(public.rmg_profile_names_v1('OR',ARRAY['fixture-1'])='[]'::jsonb,'cleared names no longer project');
SELECT public.fixture_assert(public.rmg_set_profile_name_v1('OR','fixture-1',repeat('é',80))->>'status'='saved','80 Unicode codepoints accepted');
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
SELECT public.fixture_assert(public.rmg_set_profile_name_v1('OR','fixture-4',U&'\00A0\2003')->>'status'='saved','direct owner RPC clears Unicode whitespace');
SELECT public.fixture_assert(public.rmg_own_profile_name_v1('OR','fixture-4')->'name'='null'::jsonb AND public.rmg_profile_names_v1('OR',ARRAY['fixture-4'])='[]'::jsonb,'Unicode whitespace-only value is absent from projection');
SELECT public.fixture_assert(public.rmg_set_profile_name_v1('OR','fixture-4',U&'\00A0Scott\2003')->>'status'='saved','direct owner RPC accepts Unicode padded name');
SELECT public.fixture_assert(public.rmg_own_profile_name_v1('OR','fixture-4')->>'name'='Scott' AND public.rmg_profile_names_v1('OR',ARRAY['fixture-4'])->0->>'preferred_name'='Scott','Unicode padded name round-trips trimmed');
RESET ROLE;
SELECT public.fixture_assert((SELECT count(*)=2 FROM rmg_private.profile_name_audit_v1 WHERE origin='admin' AND actor_id='00000000-0000-0000-0000-000000000004' AND reason IS NOT NULL),'admin evidence records actor and reason privately');
SELECT public.fixture_assert((SELECT count(*)=1 FROM rmg_private.profile_name_audit_v1 WHERE origin='admin' AND reason='Sam editorial correction'),'Unicode padded editorial reason is trimmed');
SELECT public.fixture_assert((SELECT md5(string_agg(row_to_json(x)::text,',' ORDER BY id)) FROM public.guides x)=current_setting('test.guide_hash'),'canonical guide rows unchanged');
SELECT public.fixture_assert((SELECT md5(string_agg(row_to_json(x)::text,',' ORDER BY id)) FROM public.guide_claims x)=current_setting('test.claim_hash'),'claim rows and links unchanged');
SELECT public.fixture_assert((SELECT md5(string_agg(row_to_json(x)::text,',' ORDER BY id)) FROM public.reviews x)=current_setting('test.review_hash'),'reviews and links unchanged');
SELECT public.fixture_assert((SELECT md5(string_agg(row_to_json(x)::text,',' ORDER BY jurisdiction,source_id)) FROM rmg_private.guide_identity_map x)=current_setting('test.map_hash'),'stable ID mappings unchanged');
-- Revoking the approval hides the formerly authorized owner name and blocks edits.
UPDATE public.guide_claims SET status='denied' WHERE id='20000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
SELECT public.fixture_assert(public.rmg_profile_names_v1('OR',ARRAY['fixture-1'])='[]'::jsonb,'revoked owner name is not projected');
DO $$BEGIN
 BEGIN PERFORM public.rmg_set_profile_name_v1('OR','fixture-1','Stale Owner'); RAISE EXCEPTION 'revoked owner edit accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.rmg_own_profile_name_v1('OR','fixture-1'); RAISE EXCEPTION 'revoked owner read accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
RESET ROLE;
INSERT INTO public.guide_claims(id,guide_id,claimant_id,status) VALUES ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000006','approved');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
SELECT public.fixture_assert(public.rmg_own_profile_name_v1('OR','fixture-1')->'name'='null'::jsonb AND NOT (public.rmg_own_profile_name_v1('OR','fixture-1')->>'overridden')::boolean,'new claimant cannot read previous owner declaration');
SELECT public.fixture_assert(public.rmg_profile_names_v1('OR',ARRAY['fixture-1'])='[]'::jsonb,'previous owner name stays hidden after ownership changes');
SELECT public.fixture_assert(NOT (public.rmg_own_profile_name_v1('OR','fixture-1') ? 'actor_id'),'owner response excludes private actor ID');
RESET ROLE;
UPDATE auth.users SET email_confirmed_at=NULL WHERE id='00000000-0000-0000-0000-000000000004';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
DO $$BEGIN
 BEGIN PERFORM public.rmg_admin_set_profile_name_v1('OR','fixture-1','Invalid','reason'); RAISE EXCEPTION 'unconfirmed admin accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
RESET ROLE;
