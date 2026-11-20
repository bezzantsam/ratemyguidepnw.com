-- REVIEW-ONLY ADDITIVE CANDIDATE. Apply after the guarded Oregon claims foundation.
-- One DO statement provides an atomic DDL unit; runner/history semantics still
-- require independent testing. No identity mapping or legacy grant is changed.
DO $migration$
BEGIN
 IF to_regclass('rmg_private.profile_declarations') IS NULL OR
    to_regprocedure('rmg_private.require_actor()') IS NULL OR
    to_regprocedure('rmg_private.resolve_guide(text,text)') IS NULL OR
    to_regprocedure('rmg_private.edit_details(text,text,text,text,smallint,text,text)') IS NULL OR
    to_regprocedure('rmg_private.profile_details(text,text)') IS NULL THEN
  RAISE EXCEPTION 'Preferred-name v1 requires verified Oregon claims and the reviewed launch schema';
 END IF;

 EXECUTE $ddl$
  ALTER TABLE rmg_private.profile_declarations
   ADD COLUMN details_declared boolean NOT NULL DEFAULT true,
   ADD COLUMN preferred_name text,
   ADD COLUMN preferred_name_by uuid REFERENCES auth.users(id),
   ADD COLUMN preferred_name_at timestamptz,
   ADD CONSTRAINT profile_preferred_name_provenance_v1 CHECK (
    (preferred_name IS NULL AND preferred_name_by IS NULL AND preferred_name_at IS NULL) OR
    (preferred_name IS NOT NULL AND preferred_name_by IS NOT NULL AND preferred_name_at IS NOT NULL))
 $ddl$;
 -- A separate default-off gate prevents direct PostgREST/RPC access from
 -- bypassing the application-only feature flags when reviews are enabled.
 EXECUTE $ddl$
  CREATE TABLE rmg_private.profile_name_control_v1 (
   singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
   enabled boolean NOT NULL DEFAULT false
  )
 $ddl$;
 EXECUTE 'ALTER TABLE rmg_private.profile_name_control_v1 ENABLE ROW LEVEL SECURITY';
 EXECUTE 'REVOKE ALL ON rmg_private.profile_name_control_v1 FROM PUBLIC, anon, authenticated, service_role';
 EXECUTE 'INSERT INTO rmg_private.profile_name_control_v1(singleton,enabled) VALUES(true,false)';
 EXECUTE $ddl$
  CREATE FUNCTION rmg_private.require_profile_name_v1() RETURNS void
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
  BEGIN
   IF NOT COALESCE((SELECT enabled FROM rmg_private.profile_name_control_v1 WHERE singleton),false) THEN
    RAISE EXCEPTION 'Unavailable' USING ERRCODE='P5030';
   END IF;
  END $fn$
 $ddl$;
 EXECUTE 'REVOKE ALL ON FUNCTION rmg_private.require_profile_name_v1() FROM PUBLIC,anon,authenticated,service_role';

 EXECUTE $ddl$
  CREATE TABLE rmg_private.profile_name_admin_v1 (
   guide_id uuid PRIMARY KEY REFERENCES public.guides(id),
   preferred_name text NOT NULL,
   corrected_by uuid NOT NULL REFERENCES auth.users(id),
   corrected_at timestamptz NOT NULL DEFAULT now(),
   reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500)
  )
 $ddl$;
 EXECUTE $ddl$
  CREATE TABLE rmg_private.profile_name_audit_v1 (
   id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
   guide_id uuid NOT NULL REFERENCES public.guides(id),
   actor_id uuid NOT NULL REFERENCES auth.users(id),
   origin text NOT NULL CHECK (origin IN ('captain','admin')),
   old_name text,
   new_name text,
   reason text,
   created_at timestamptz NOT NULL DEFAULT now()
  )
 $ddl$;
 EXECUTE 'ALTER TABLE rmg_private.profile_name_admin_v1 ENABLE ROW LEVEL SECURITY';
 EXECUTE 'ALTER TABLE rmg_private.profile_name_audit_v1 ENABLE ROW LEVEL SECURITY';
 EXECUTE 'REVOKE ALL ON rmg_private.profile_name_admin_v1, rmg_private.profile_name_audit_v1 FROM PUBLIC, anon, authenticated, service_role';
 EXECUTE 'REVOKE ALL ON SEQUENCE rmg_private.profile_name_audit_v1_id_seq FROM PUBLIC, anon, authenticated, service_role';

 EXECUTE $ddl$
 CREATE FUNCTION rmg_private.normalize_preferred_name_v1(p_name text) RETURNS text
 LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $fn$
 DECLARE result text;
 BEGIN
  IF p_name IS NULL THEN RETURN NULL; END IF;
  result:=pg_catalog.btrim(p_name,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
  IF result='' THEN RETURN NULL; END IF;
  IF pg_catalog.char_length(result)>80 OR result ~ '[<>[:cntrl:]]' THEN
   RAISE EXCEPTION 'Invalid preferred name' USING ERRCODE='22023';
  END IF;
  RETURN result;
 END $fn$
 $ddl$;

 -- Existing detail APIs keep their signatures and JSON. A name-only
 -- declaration must never expose an older, unverified guide_details row.
 EXECUTE $ddl$
 CREATE OR REPLACE FUNCTION rmg_private.profile_details(p_jurisdiction text,p_source_id text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 DECLARE gid uuid:=rmg_private.resolve_guide(p_jurisdiction,p_source_id); result jsonb;
 BEGIN
  SELECT jsonb_build_object('boat',d.boat,'gear',d.gear,'years_experience',d.years_experience,'expertise',d.expertise,'targeted_species',d.targeted_species,'updated_at',d.updated_at) INTO result
  FROM public.guide_details d JOIN rmg_private.profile_declarations p ON p.guide_id=d.guide_id
  WHERE d.guide_id=gid AND p.details_declared AND EXISTS(SELECT 1 FROM public.guide_claims c WHERE c.guide_id=gid AND c.claimant_id=p.declared_by AND c.status='approved');
  RETURN result;
 END $fn$
 $ddl$;

 EXECUTE $ddl$
 CREATE FUNCTION rmg_private.set_profile_name_v1(p_jurisdiction text,p_source_id text,p_name text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
 DECLARE actor uuid:=rmg_private.require_actor(); gid uuid; name_value text; prior text;
 BEGIN
  -- SHARE conflicts with feature-gate disable, allowing in-flight writes to finish first.
  PERFORM 1 FROM rmg_private.profile_name_control_v1 WHERE singleton AND enabled FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='P5030'; END IF;
  SELECT c.guide_id INTO STRICT gid
  FROM public.guide_claims c WHERE c.id=rmg_private.approved_owner_claim_for_source_v1(p_jurisdiction,p_source_id,true);
  IF (SELECT count(*) FROM public.guide_claims c WHERE c.guide_id=gid AND c.status='approved')<>1
   THEN RAISE EXCEPTION 'Unambiguous approved ownership required' USING ERRCODE='42501'; END IF;
  name_value:=rmg_private.normalize_preferred_name_v1(p_name);
  SELECT preferred_name INTO prior FROM rmg_private.profile_declarations WHERE guide_id=gid;
  INSERT INTO rmg_private.profile_declarations(guide_id,declared_by,details_declared,preferred_name,preferred_name_by,preferred_name_at)
  VALUES(gid,actor,false,name_value,CASE WHEN name_value IS NOT NULL THEN actor END,CASE WHEN name_value IS NOT NULL THEN now() END)
  ON CONFLICT(guide_id) DO UPDATE SET preferred_name=excluded.preferred_name,preferred_name_by=excluded.preferred_name_by,preferred_name_at=excluded.preferred_name_at;
  INSERT INTO rmg_private.profile_name_audit_v1(guide_id,actor_id,origin,old_name,new_name) VALUES(gid,actor,'captain',prior,name_value);
  RETURN jsonb_build_object('status','saved');
 END $fn$
 $ddl$;
 EXECUTE $ddl$
 CREATE FUNCTION rmg_private.admin_set_profile_name_v1(p_jurisdiction text,p_source_id text,p_name text,p_reason text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
 DECLARE actor uuid:=rmg_private.require_actor(); gid uuid; name_value text; prior text; why text:=pg_catalog.btrim(coalesce(p_reason,''),U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
 BEGIN
  IF NOT public.is_site_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM rmg_private.profile_name_control_v1 WHERE singleton AND enabled FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='P5030'; END IF;
  IF char_length(why) NOT BETWEEN 1 AND 500 OR why ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'Invalid correction reason' USING ERRCODE='22023'; END IF;
  gid:=rmg_private.oregon_claim_guide_v1(p_jurisdiction,p_source_id);
  IF gid IS NULL THEN RAISE EXCEPTION 'Oregon listing unavailable' USING ERRCODE='P0002'; END IF;
  PERFORM 1 FROM public.guides WHERE id=gid FOR UPDATE;
  name_value:=rmg_private.normalize_preferred_name_v1(p_name);
  SELECT preferred_name INTO prior FROM rmg_private.profile_name_admin_v1 WHERE guide_id=gid;
  IF name_value IS NULL THEN DELETE FROM rmg_private.profile_name_admin_v1 WHERE guide_id=gid;
  ELSE INSERT INTO rmg_private.profile_name_admin_v1(guide_id,preferred_name,corrected_by,corrected_at,reason) VALUES(gid,name_value,actor,now(),why)
   ON CONFLICT(guide_id) DO UPDATE SET preferred_name=excluded.preferred_name,corrected_by=excluded.corrected_by,corrected_at=excluded.corrected_at,reason=excluded.reason;
  END IF;
  INSERT INTO rmg_private.profile_name_audit_v1(guide_id,actor_id,origin,old_name,new_name,reason) VALUES(gid,actor,'admin',prior,name_value,why);
  RETURN jsonb_build_object('status','saved');
 END $fn$
 $ddl$;
 EXECUTE $ddl$
 CREATE FUNCTION rmg_private.profile_names_v1(p_jurisdiction text,p_source_ids text[]) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 DECLARE result jsonb;
 BEGIN
  IF NOT COALESCE((SELECT enabled FROM rmg_private.launch_control WHERE singleton),false) THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='P5030'; END IF;
  PERFORM rmg_private.require_profile_name_v1();
  IF p_jurisdiction IS NULL OR p_jurisdiction NOT IN ('OR','WA') OR p_source_ids IS NULL OR cardinality(p_source_ids)>100 OR
     EXISTS(SELECT 1 FROM unnest(p_source_ids) s WHERE s IS NULL OR length(s) NOT BETWEEN 1 AND 100) THEN
   RAISE EXCEPTION 'Invalid profile names request' USING ERRCODE='22023';
  END IF;
  IF p_jurisdiction='WA' THEN RETURN '[]'::jsonb; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('jurisdiction',q.jurisdiction,'source_id',q.source_id,'preferred_name',q.effective_name,'provenance',q.provenance) ORDER BY q.source_id),'[]'::jsonb) INTO result
  FROM (
   SELECT m.jurisdiction,m.source_id,coalesce(a.preferred_name,CASE WHEN EXISTS(SELECT 1 FROM public.guide_claims c WHERE c.guide_id=m.guide_id AND c.claimant_id=d.preferred_name_by AND c.status='approved') AND (SELECT count(*) FROM public.guide_claims c WHERE c.guide_id=m.guide_id AND c.status='approved')=1 THEN d.preferred_name END) AS effective_name,
    CASE WHEN a.preferred_name IS NOT NULL THEN 'admin' ELSE 'captain' END AS provenance
   FROM rmg_private.guide_identity_map m JOIN public.guides g ON g.id=m.guide_id AND g.listing_status='published'
   LEFT JOIN rmg_private.profile_declarations d ON d.guide_id=m.guide_id LEFT JOIN rmg_private.profile_name_admin_v1 a ON a.guide_id=m.guide_id
   WHERE m.jurisdiction=p_jurisdiction AND m.source_id=ANY(p_source_ids)
  ) q WHERE q.effective_name IS NOT NULL;
  RETURN result;
 END $fn$
 $ddl$;
 EXECUTE $ddl$
 CREATE FUNCTION rmg_private.own_profile_name_v1(p_jurisdiction text,p_source_id text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
 DECLARE actor uuid:=rmg_private.require_actor(); gid uuid; result jsonb;
 BEGIN
  PERFORM rmg_private.require_profile_name_v1();
  SELECT c.guide_id INTO STRICT gid
  FROM public.guide_claims c WHERE c.id=rmg_private.approved_owner_claim_for_source_v1(p_jurisdiction,p_source_id,false);
  IF (SELECT count(*) FROM public.guide_claims c WHERE c.guide_id=gid AND c.status='approved')<>1
   THEN RAISE EXCEPTION 'Unambiguous approved ownership required' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('name',CASE WHEN d.preferred_name_by=actor THEN d.preferred_name ELSE NULL END,'overridden',a.preferred_name IS NOT NULL) INTO result
  FROM (SELECT gid AS id) x LEFT JOIN rmg_private.profile_declarations d ON d.guide_id=x.id LEFT JOIN rmg_private.profile_name_admin_v1 a ON a.guide_id=x.id;
  RETURN result;
 END $fn$
 $ddl$;
 EXECUTE $ddl$
 CREATE FUNCTION rmg_private.profile_name_review_v1(p_jurisdiction text,p_source_id text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 DECLARE actor uuid:=rmg_private.require_actor(); gid uuid; result jsonb;
 BEGIN
  IF NOT public.is_site_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  PERFORM rmg_private.require_profile_name_v1();
  gid:=rmg_private.oregon_claim_guide_v1(p_jurisdiction,p_source_id);
  IF gid IS NULL THEN RAISE EXCEPTION 'Oregon listing unavailable' USING ERRCODE='P0002'; END IF;
  SELECT jsonb_build_object('captain_name',d.preferred_name,'captain_name_active',coalesce(d.preferred_name IS NOT NULL AND EXISTS(SELECT 1 FROM public.guide_claims c WHERE c.guide_id=gid AND c.claimant_id=d.preferred_name_by AND c.status='approved'),false),'admin_name',a.preferred_name,
   'history',coalesce((SELECT jsonb_agg(jsonb_build_object('origin',h.origin,'old_name',h.old_name,'new_name',h.new_name,'reason',h.reason,'created_at',h.created_at) ORDER BY h.id DESC) FROM (SELECT id,origin,old_name,new_name,reason,created_at FROM rmg_private.profile_name_audit_v1 WHERE guide_id=gid ORDER BY id DESC LIMIT 50) h),'[]'::jsonb)) INTO result
  FROM (SELECT gid AS id) x LEFT JOIN rmg_private.profile_declarations d ON d.guide_id=x.id LEFT JOIN rmg_private.profile_name_admin_v1 a ON a.guide_id=x.id;
  RETURN result;
 END $fn$
 $ddl$;
 EXECUTE $ddl$ CREATE FUNCTION public.rmg_set_profile_name_v1(p_jurisdiction text,p_source_id text,p_name text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $fn$SELECT rmg_private.set_profile_name_v1($1,$2,$3)$fn$ $ddl$;
 EXECUTE $ddl$ CREATE FUNCTION public.rmg_admin_set_profile_name_v1(p_jurisdiction text,p_source_id text,p_name text,p_reason text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $fn$SELECT rmg_private.admin_set_profile_name_v1($1,$2,$3,$4)$fn$ $ddl$;
 EXECUTE $ddl$ CREATE FUNCTION public.rmg_own_profile_name_v1(p_jurisdiction text,p_source_id text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $fn$SELECT rmg_private.own_profile_name_v1($1,$2)$fn$ $ddl$;
 EXECUTE $ddl$ CREATE FUNCTION public.rmg_profile_name_review_v1(p_jurisdiction text,p_source_id text) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$SELECT rmg_private.profile_name_review_v1($1,$2)$fn$ $ddl$;
 EXECUTE $ddl$ CREATE FUNCTION public.rmg_profile_names_v1(p_jurisdiction text,p_source_ids text[]) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$SELECT rmg_private.profile_names_v1($1,$2)$fn$ $ddl$;
 EXECUTE 'REVOKE ALL ON FUNCTION rmg_private.normalize_preferred_name_v1(text),rmg_private.set_profile_name_v1(text,text,text),rmg_private.admin_set_profile_name_v1(text,text,text,text),rmg_private.profile_names_v1(text,text[]),rmg_private.profile_name_review_v1(text,text),public.rmg_profile_name_review_v1(text,text),rmg_private.own_profile_name_v1(text,text),public.rmg_own_profile_name_v1(text,text),public.rmg_set_profile_name_v1(text,text,text),public.rmg_admin_set_profile_name_v1(text,text,text,text),public.rmg_profile_names_v1(text,text[]) FROM PUBLIC,anon,authenticated,service_role';
 EXECUTE 'GRANT EXECUTE ON FUNCTION rmg_private.set_profile_name_v1(text,text,text),rmg_private.admin_set_profile_name_v1(text,text,text,text),public.rmg_set_profile_name_v1(text,text,text),public.rmg_admin_set_profile_name_v1(text,text,text,text),rmg_private.profile_name_review_v1(text,text),public.rmg_profile_name_review_v1(text,text),rmg_private.own_profile_name_v1(text,text),public.rmg_own_profile_name_v1(text,text) TO authenticated';
 EXECUTE 'GRANT EXECUTE ON FUNCTION rmg_private.profile_names_v1(text,text[]),public.rmg_profile_names_v1(text,text[]) TO anon,authenticated';
END
$migration$;
