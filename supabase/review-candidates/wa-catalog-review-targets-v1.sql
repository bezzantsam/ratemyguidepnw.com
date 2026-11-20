-- Apply after the listed Washington adapter and read-only summary repair.
DO $$
BEGIN
 IF to_regprocedure('rmg_private.wa_listed_review_target_v1(text,uuid)') IS NULL
  OR to_regprocedure('rmg_private.directory_review_sources_v1(jsonb)') IS NULL THEN
  RAISE EXCEPTION 'Reviewed Washington adapter and summary foundation required';
 END IF;
END $$;

CREATE TABLE rmg_private.wa_catalog_review_control_v1 (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 enabled boolean NOT NULL DEFAULT false
);
INSERT INTO rmg_private.wa_catalog_review_control_v1 DEFAULT VALUES;

CREATE TABLE rmg_private.wa_catalog_review_targets_v1 (
 source_id text PRIMARY KEY CHECK (source_id ~ '^wa-[0-9]{3,9}$'),
 source_key_sha256 text NOT NULL UNIQUE CHECK (source_key_sha256 ~ '^[0-9a-f]{64}$'),
 listing_sha256 text NOT NULL UNIQUE CHECK (listing_sha256 ~ '^[0-9a-f]{64}$'),
 review_identity uuid UNIQUE REFERENCES public.guides(id),
 requested_hold_reason text CHECK (requested_hold_reason ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
 hold_reason text CHECK (hold_reason ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
 CHECK ((review_identity IS NULL) = (hold_reason IS NOT NULL)),
 CHECK (requested_hold_reason IS NULL OR hold_reason IS NOT DISTINCT FROM requested_hold_reason)
);
ALTER TABLE rmg_private.wa_catalog_review_control_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE rmg_private.wa_catalog_review_targets_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rmg_private.wa_catalog_review_control_v1,rmg_private.wa_catalog_review_targets_v1
 FROM PUBLIC,anon,authenticated,service_role;

-- No public API or identity reuse. The reviewed manifest contains hashes and
-- hold codes only. The first insert assigns a fresh opaque review carrier.
CREATE FUNCTION rmg_private.seed_wa_review_catalog_v1(p_rows jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE item jsonb; source text; key_sha text; version_sha text; requested_hold text; hold text;
 prior rmg_private.wa_catalog_review_targets_v1%ROWTYPE; carrier uuid; checked_count integer:=0;
 held_count integer:=0; expected_keys text[]:=ARRAY['sourceId','sourceKeySha256','listingSha256','holdReason'];
BEGIN
 PERFORM 1 FROM rmg_private.wa_catalog_review_control_v1 WHERE singleton AND NOT enabled FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pause WA catalog reviews before provisioning' USING ERRCODE='P5030'; END IF;
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Invalid catalog manifest' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_rows) NOT BETWEEN 1 AND 1000 THEN
  RAISE EXCEPTION 'Invalid catalog manifest length' USING ERRCODE='22023'; END IF;
 IF (SELECT count(DISTINCT value->>'sourceId') FROM jsonb_array_elements(p_rows))<>jsonb_array_length(p_rows)
  OR (SELECT count(DISTINCT value->>'sourceKeySha256') FROM jsonb_array_elements(p_rows))<>jsonb_array_length(p_rows)
  OR (SELECT count(DISTINCT value->>'listingSha256') FROM jsonb_array_elements(p_rows))<>jsonb_array_length(p_rows)
 THEN RAISE EXCEPTION 'Duplicate or missing catalog identity' USING ERRCODE='22023'; END IF;

 FOR item IN SELECT value FROM jsonb_array_elements(p_rows) ORDER BY value->>'sourceId' LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION 'Invalid catalog row' USING ERRCODE='22023'; END IF;
  source:=item->>'sourceId'; key_sha:=item->>'sourceKeySha256'; version_sha:=item->>'listingSha256';
  requested_hold:=item->>'holdReason';
  IF NOT (item ?& expected_keys) OR (item-expected_keys)<>'{}'
   OR jsonb_typeof(item->'sourceId')<>'string' OR source !~ '^wa-[0-9]{3,9}$'
   OR jsonb_typeof(item->'sourceKeySha256')<>'string' OR key_sha !~ '^[0-9a-f]{64}$'
   OR jsonb_typeof(item->'listingSha256')<>'string' OR version_sha !~ '^[0-9a-f]{64}$'
   OR (item->'holdReason'<>'null' AND (jsonb_typeof(item->'holdReason')<>'string' OR requested_hold !~ '^[a-z0-9][a-z0-9_-]{0,79}$'))
  THEN RAISE EXCEPTION 'Invalid catalog row' USING ERRCODE='22023'; END IF;

  hold:=COALESCE(requested_hold,CASE
   WHEN EXISTS(SELECT 1 FROM rmg_private.guide_identity_map m WHERE m.jurisdiction='WA' AND m.source_id=source)
    THEN 'legacy-wa-mapping'
   WHEN EXISTS(SELECT 1 FROM rmg_private.wa_listed_review_identity_v1 w WHERE w.source_id=source)
    THEN 'existing-listed-pilot'
   WHEN EXISTS(SELECT 1 FROM rmg_private.wa_review_pilot_v1 w WHERE w.source_id=source)
    THEN 'existing-prospective-pilot' END);
  SELECT * INTO prior FROM rmg_private.wa_catalog_review_targets_v1 t WHERE t.source_id=source;
  IF FOUND THEN
   IF prior.source_key_sha256<>key_sha OR prior.listing_sha256<>version_sha
    OR prior.requested_hold_reason IS DISTINCT FROM requested_hold OR prior.hold_reason IS DISTINCT FROM hold
   THEN RAISE EXCEPTION 'Catalog identity drift for %',source USING ERRCODE='P0001'; END IF;
  ELSE
   carrier:=NULL;
   IF hold IS NULL THEN
    carrier:=gen_random_uuid();
    INSERT INTO public.guides(id,slug,full_name,listing_status)
    VALUES(carrier,'wa-catalog-review-anchor-'||carrier,'Washington catalog review target','draft');
   END IF;
   INSERT INTO rmg_private.wa_catalog_review_targets_v1
    (source_id,source_key_sha256,listing_sha256,review_identity,requested_hold_reason,hold_reason)
   VALUES(source,key_sha,version_sha,carrier,requested_hold,hold);
  END IF;
  checked_count:=checked_count+1;
  IF hold IS NOT NULL THEN held_count:=held_count+1; END IF;
 END LOOP;
 RETURN jsonb_build_object('checked',checked_count,'eligible',checked_count-held_count,'held',held_count);
END $$;

-- Retain draft-only carrier identities even if another subsystem tries to
-- turn one into a profile. Ratings trigger updates are outside these columns.
CREATE FUNCTION rmg_private.protect_wa_catalog_review_carrier_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM rmg_private.wa_catalog_review_targets_v1 w WHERE w.review_identity=OLD.id)
 THEN RAISE EXCEPTION 'Catalog review carrier fields are fixed' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_wa_catalog_review_carrier_v1
 BEFORE UPDATE OF id,slug,full_name,outfit_name,jurisdiction_id,license_number,verification_status,listing_status,website_url
 OR DELETE ON public.guides FOR EACH ROW
 WHEN (OLD.slug LIKE 'wa-catalog-review-anchor-%')
 EXECUTE FUNCTION rmg_private.protect_wa_catalog_review_carrier_v1();

CREATE FUNCTION rmg_private.wa_catalog_review_target_v1(p_versioned_source text,p_guide_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT w.review_identity FROM rmg_private.wa_catalog_review_targets_v1 w
 JOIN public.guides g ON g.id=w.review_identity
  AND g.slug='wa-catalog-review-anchor-'||w.review_identity
  AND g.listing_status='draft' AND g.verification_status='listed'
  AND g.full_name='Washington catalog review target' AND g.outfit_name IS NULL
  AND g.license_number IS NULL AND g.jurisdiction_id IS NULL AND g.website_url IS NULL
 WHERE w.hold_reason IS NULL AND (p_versioned_source IS NOT NULL OR p_guide_id IS NOT NULL)
  AND (p_versioned_source IS NULL OR (split_part(p_versioned_source,'@',1)=w.source_id
   AND p_versioned_source=w.source_id||'@catalog:'||w.listing_sha256))
  AND (p_guide_id IS NULL OR p_guide_id=w.review_identity)
  AND COALESCE((SELECT enabled FROM rmg_private.wa_catalog_review_control_v1 WHERE singleton),false)
  AND COALESCE((SELECT enabled FROM rmg_private.launch_control WHERE singleton),false)
  AND NOT EXISTS (SELECT 1 FROM rmg_private.guide_identity_map m
     WHERE (m.jurisdiction='WA' AND m.source_id=w.source_id) OR m.guide_id=w.review_identity)
  AND NOT EXISTS (SELECT 1 FROM rmg_private.wa_listed_review_identity_v1 p
     WHERE p.source_id=w.source_id OR p.review_identity=w.review_identity)
  AND NOT EXISTS (SELECT 1 FROM rmg_private.wa_review_pilot_v1 p
     WHERE p.source_id=w.source_id OR p.guide_id=w.review_identity)
$$;

CREATE FUNCTION rmg_private.lock_wa_catalog_review_v1() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM rmg_private.wa_catalog_review_control_v1 WHERE singleton AND enabled FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Washington catalog reviews paused' USING ERRCODE='P5030'; END IF;
END $$;

REVOKE ALL ON FUNCTION rmg_private.seed_wa_review_catalog_v1(jsonb),
 rmg_private.protect_wa_catalog_review_carrier_v1(),rmg_private.wa_catalog_review_target_v1(text,uuid),
 rmg_private.lock_wa_catalog_review_v1() FROM PUBLIC,anon,authenticated,service_role;

-- Extend the established review entry points without changing their signatures or ACLs.
CREATE OR REPLACE FUNCTION rmg_private.review_target_for_write_v1(p_jurisdiction text,p_source_id text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE gid uuid;
BEGIN
 IF p_jurisdiction='OR' THEN RETURN rmg_private.resolve_guide(p_jurisdiction,p_source_id); END IF;
 IF p_jurisdiction IS DISTINCT FROM 'WA' OR p_source_id IS NULL THEN
  RAISE EXCEPTION 'Review identity unavailable' USING ERRCODE='P5030';
 END IF;
 IF strpos(p_source_id,'@catalog:')>0 THEN
  PERFORM rmg_private.lock_wa_catalog_review_v1();
  gid:=rmg_private.wa_catalog_review_target_v1(p_source_id,NULL);
  IF gid IS NULL THEN RAISE EXCEPTION 'Washington catalog review target unavailable' USING ERRCODE='P5030'; END IF;
  RETURN gid;
 END IF;
 PERFORM 1 FROM rmg_private.wa_review_pilot_v1 WHERE singleton FOR SHARE;
 IF position('@' IN p_source_id)>0 THEN
  PERFORM 1 FROM rmg_private.wa_listed_review_identity_v1
   WHERE source_id=split_part(p_source_id,'@',1) FOR SHARE;
  gid:=rmg_private.wa_listed_review_target_v1(p_source_id,NULL);
 ELSE
  gid:=rmg_private.wa_review_target_v1(p_source_id,NULL);
 END IF;
 IF gid IS NULL THEN RAISE EXCEPTION 'Washington review target unavailable' USING ERRCODE='P5030'; END IF;
 RETURN gid;
END $$;

CREATE OR REPLACE FUNCTION rmg_private.lock_review_guide_v1(p_guide_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM rmg_private.wa_catalog_review_targets_v1 w WHERE w.review_identity=p_guide_id) THEN
  PERFORM rmg_private.lock_wa_catalog_review_v1();
  IF rmg_private.wa_catalog_review_target_v1(NULL,p_guide_id) IS NULL THEN
   RAISE EXCEPTION 'Washington catalog review identity unavailable' USING ERRCODE='P5030'; END IF;
  RETURN;
 END IF;
 IF rmg_private.has_oregon_review_guide_v1(p_guide_id) THEN RETURN; END IF;
 PERFORM 1 FROM rmg_private.wa_review_pilot_v1 WHERE singleton FOR SHARE;
 IF rmg_private.wa_review_target_v1(NULL,p_guide_id) IS NOT NULL THEN RETURN; END IF;
 PERFORM 1 FROM rmg_private.wa_listed_review_identity_v1 WHERE review_identity=p_guide_id FOR SHARE;
 IF rmg_private.wa_listed_review_target_v1(NULL,p_guide_id) IS NULL THEN
  RAISE EXCEPTION 'Review identity unavailable' USING ERRCODE='P5030';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION rmg_private.review_read_target_v1(p_jurisdiction text,p_source_id text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE gid uuid;
BEGIN
 IF p_jurisdiction='WA' AND position('@' IN p_source_id)>0 THEN
  IF strpos(p_source_id,'@catalog:')>0 THEN
   gid:=rmg_private.wa_catalog_review_target_v1(p_source_id,NULL);
  ELSE
   gid:=rmg_private.wa_listed_review_target_v1(p_source_id,NULL);
  END IF;
  IF gid IS NULL THEN RAISE EXCEPTION 'Listed Washington review target unavailable' USING ERRCODE='P5030'; END IF;
  RETURN gid;
 END IF;
 RETURN rmg_private.resolve_guide(p_jurisdiction,p_source_id);
END $$;

CREATE OR REPLACE FUNCTION rmg_private.review_write_availability(p_jurisdiction text,p_source_id text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE gid uuid; available boolean;
BEGIN
 IF p_jurisdiction='OR' THEN
  gid:=rmg_private.resolve_guide(p_jurisdiction,p_source_id);
 ELSIF p_jurisdiction='WA' AND p_source_id IS NOT NULL THEN
  IF strpos(p_source_id,'@catalog:')>0 THEN
   gid:=rmg_private.wa_catalog_review_target_v1(p_source_id,NULL);
  ELSE
   gid:=COALESCE(rmg_private.wa_review_target_v1(p_source_id,NULL),rmg_private.wa_listed_review_target_v1(p_source_id,NULL));
  END IF;
 END IF;
 IF gid IS NULL THEN RETURN jsonb_build_object('available', false); END IF;
 available:=NOT pg_catalog.pg_is_in_recovery() AND current_setting('transaction_read_only')='off'
  AND pg_catalog.has_table_privilege(current_user,'public.reviews','INSERT')
  AND pg_catalog.has_schema_privilege('authenticated','public','USAGE')
  AND pg_catalog.has_schema_privilege('authenticated','rmg_private','USAGE')
  AND pg_catalog.has_function_privilege('authenticated','public.rmg_submit_review_v2(text,text,smallint,smallint,boolean,text,boolean,text,jsonb,text)','EXECUTE')
  AND pg_catalog.has_function_privilege('authenticated','rmg_private.submit_review_v2(text,text,smallint,smallint,boolean,text,boolean,text,jsonb,text)','EXECUTE');
 RETURN jsonb_build_object('available',available);
END $$;

CREATE OR REPLACE FUNCTION rmg_private.review_queue_eligible_v1(p_guide_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN public.is_site_admin() AND EXISTS (
  SELECT 1 FROM auth.users u WHERE u.id=auth.uid()
   AND u.email_confirmed_at IS NOT NULL AND NOT COALESCE(u.is_anonymous,false)
   AND u.deleted_at IS NULL
 ) AND COALESCE((SELECT enabled FROM rmg_private.launch_control WHERE singleton),false)
 THEN (rmg_private.has_oregon_review_guide_v1($1) OR rmg_private.wa_review_target_v1(NULL,$1) IS NOT NULL OR rmg_private.wa_listed_review_target_v1(NULL,$1) IS NOT NULL
  OR rmg_private.wa_catalog_review_target_v1(NULL,$1) IS NOT NULL)
 ELSE false END
$$;

-- The moderator sees the exact catalog version and resolves its public label
-- in the app. Neutral carrier names are never treated as directory evidence.
CREATE FUNCTION rmg_private.wa_catalog_moderator_identity_v1(p_guide_id uuid)
RETURNS TABLE(catalog_source_id text,catalog_listing_sha256 text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT w.source_id,w.listing_sha256 FROM rmg_private.wa_catalog_review_targets_v1 w
 WHERE w.review_identity=$1 AND rmg_private.review_queue_eligible_v1($1)
  AND rmg_private.wa_catalog_review_target_v1(NULL,$1) IS NOT NULL
$$;
REVOKE ALL ON FUNCTION rmg_private.wa_catalog_moderator_identity_v1(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION rmg_private.wa_catalog_moderator_identity_v1(uuid) TO authenticated;

CREATE OR REPLACE VIEW public.admin_pending_reviews WITH (security_invoker=true) AS
 SELECT r.id,r.guide_id,g.full_name AS guide_name,r.body,r.quality,r.safety,r.communication,
  r.professionalism,r.created_at,r.trip_month,r.firsthand_attested,r.relationship_disclosure,
  r.trip_responses,r.intensity,r.would_book_again,c.catalog_source_id,c.catalog_listing_sha256
 FROM public.reviews r JOIN public.guides g ON g.id=r.guide_id
 LEFT JOIN LATERAL rmg_private.wa_catalog_moderator_identity_v1(r.guide_id) c ON true
 WHERE r.status='pending' AND rmg_private.review_queue_eligible_v1(r.guide_id);

CREATE OR REPLACE FUNCTION rmg_private.revision_queue(p_offset integer,p_limit integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor();result jsonb;
BEGIN
 IF NOT public.is_site_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.created_at,q.id),'[]'::jsonb) INTO result FROM
  (SELECT v.id,v.review_id,g.full_name AS guide_name,m.jurisdiction,m.source_id,c.catalog_source_id,c.catalog_listing_sha256,v.quality,v.intensity,v.would_book_again,v.body,v.relationship_disclosure,v.trip_responses,v.trip_month,v.trip_month_specified,v.created_at FROM rmg_private.review_revisions v JOIN public.reviews r ON r.id=v.review_id JOIN public.guides g ON g.id=r.guide_id JOIN LATERAL (
   SELECT i.jurisdiction,i.source_id FROM rmg_private.guide_identity_map i
   WHERE i.guide_id=g.id AND g.listing_status='published'
    AND (i.jurisdiction='OR' OR (i.jurisdiction='WA' AND rmg_private.wa_review_target_v1(i.source_id,g.id) IS NOT NULL))
   UNION ALL
   SELECT 'WA',w.source_id FROM rmg_private.wa_listed_review_identity_v1 w
   WHERE w.review_identity=g.id AND rmg_private.wa_listed_review_target_v1(NULL,g.id) IS NOT NULL
   UNION ALL
   SELECT 'WA',w.source_id FROM rmg_private.wa_catalog_review_targets_v1 w
   WHERE w.review_identity=g.id AND rmg_private.wa_catalog_review_target_v1(NULL,g.id) IS NOT NULL
  ) m ON true LEFT JOIN LATERAL rmg_private.wa_catalog_moderator_identity_v1(g.id) c ON true
  WHERE v.status='pending' ORDER BY v.created_at,v.id OFFSET p_offset LIMIT p_limit) q;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION rmg_private.report_queue(p_offset integer,p_limit integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor(); result jsonb;
BEGIN
 IF NOT public.is_site_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.created_at,q.id),'[]'::jsonb) INTO result FROM (
  SELECT f.id,f.review_id,f.reason,f.created_at,r.status AS review_status,
   CASE WHEN r.status='published' AND r.published_at IS NOT NULL THEN r.body ELSE NULL END AS public_review_body,
   g.full_name AS guide_name,m.jurisdiction,m.source_id,c.catalog_source_id,c.catalog_listing_sha256
  FROM public.review_flags f JOIN public.reviews r ON r.id=f.review_id JOIN public.guides g ON g.id=r.guide_id
  JOIN LATERAL (
   SELECT i.jurisdiction,i.source_id FROM rmg_private.guide_identity_map i
   WHERE i.guide_id=g.id AND g.listing_status='published'
    AND (i.jurisdiction='OR' OR (i.jurisdiction='WA' AND rmg_private.wa_review_target_v1(i.source_id,g.id) IS NOT NULL))
   UNION ALL
   SELECT 'WA',w.source_id FROM rmg_private.wa_listed_review_identity_v1 w
   WHERE w.review_identity=g.id AND rmg_private.wa_listed_review_target_v1(NULL,g.id) IS NOT NULL
   UNION ALL
   SELECT 'WA',w.source_id FROM rmg_private.wa_catalog_review_targets_v1 w
   WHERE w.review_identity=g.id AND rmg_private.wa_catalog_review_target_v1(NULL,g.id) IS NOT NULL
  ) m ON true LEFT JOIN LATERAL rmg_private.wa_catalog_moderator_identity_v1(g.id) c ON true
  WHERE f.status='pending' ORDER BY f.created_at,f.id OFFSET p_offset LIMIT p_limit
 ) q;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION rmg_private.my_submissions(p_offset integer,p_limit integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor(); result jsonb;
BEGIN
 IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id),'[]'::jsonb) INTO result FROM (
  SELECT z.kind,z.id,z.status,z.created_at,z.review_id,m.jurisdiction,m.source_id,
   COALESCE((SELECT jsonb_agg(jsonb_build_object('jurisdiction',i.jurisdiction,'source_id',i.source_id) ORDER BY i.jurisdiction,i.source_id) FROM (
    SELECT jurisdiction,source_id FROM rmg_private.guide_identity_map WHERE guide_id=z.guide_id
     AND NOT EXISTS(SELECT 1 FROM rmg_private.wa_catalog_review_targets_v1 w WHERE w.review_identity=z.guide_id)
    UNION ALL SELECT 'WA',source_id FROM rmg_private.wa_catalog_review_targets_v1
     WHERE z.kind IN ('review','revision') AND review_identity=z.guide_id
    UNION ALL SELECT 'WA',source_id FROM rmg_private.wa_listed_review_identity_v1
     WHERE z.kind IN ('review','revision') AND review_identity=z.guide_id
   ) i),'[]'::jsonb) AS identities FROM (
   SELECT 'review'::text kind,r.id,r.status,r.created_at,NULL::uuid review_id,r.guide_id FROM public.reviews r WHERE r.author_id=actor
   UNION ALL SELECT 'claim',c.id,c.status,c.created_at,NULL::uuid,c.guide_id FROM public.guide_claims c WHERE c.claimant_id=actor
   UNION ALL SELECT 'revision',v.id,v.status,v.created_at,v.review_id,r.guide_id FROM rmg_private.review_revisions v JOIN public.reviews r ON r.id=v.review_id WHERE v.submitter_id=actor
  ) z LEFT JOIN LATERAL (SELECT jurisdiction,source_id FROM (
    SELECT jurisdiction,source_id FROM rmg_private.guide_identity_map WHERE guide_id=z.guide_id
     AND NOT EXISTS(SELECT 1 FROM rmg_private.wa_catalog_review_targets_v1 w WHERE w.review_identity=z.guide_id)
    UNION ALL SELECT 'WA',source_id FROM rmg_private.wa_catalog_review_targets_v1
     WHERE z.kind IN ('review','revision') AND review_identity=z.guide_id
    UNION ALL SELECT 'WA',source_id FROM rmg_private.wa_listed_review_identity_v1
     WHERE z.kind IN ('review','revision') AND review_identity=z.guide_id
   ) identity ORDER BY jurisdiction,source_id LIMIT 1) m ON true
  ORDER BY z.created_at DESC,z.id OFFSET p_offset LIMIT p_limit
 ) q;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION rmg_private.review_carrier_visible_v1(p_guide_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN EXISTS (SELECT 1 FROM rmg_private.wa_catalog_review_targets_v1 w WHERE w.review_identity=$1)
  THEN rmg_private.wa_catalog_review_target_v1(NULL,$1) IS NOT NULL
  ELSE NOT EXISTS (SELECT 1 FROM rmg_private.wa_listed_review_identity_v1 w WHERE w.review_identity=$1)
   OR rmg_private.wa_listed_review_target_v1(NULL,$1) IS NOT NULL END
$$;

CREATE OR REPLACE FUNCTION rmg_private.directory_review_sources_v1(p_guides jsonb)
RETURNS TABLE(source_id text, input_order bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE item jsonb;
BEGIN
 IF jsonb_typeof(p_guides) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Invalid guide batch' USING ERRCODE='22023';
 END IF;
 IF jsonb_array_length(p_guides)>30 THEN
  RAISE EXCEPTION 'Invalid guide batch size' USING ERRCODE='22023';
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_guides) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION 'Invalid guide identity' USING ERRCODE='22023';
  END IF;
  IF (item-ARRAY['jurisdiction','sourceId'])<>'{}'::jsonb
   OR jsonb_typeof(item->'jurisdiction') IS DISTINCT FROM 'string'
   OR jsonb_typeof(item->'sourceId') IS DISTINCT FROM 'string'
   OR length(item->>'sourceId')>100
   OR NOT COALESCE(CASE item->>'jurisdiction'
    WHEN 'OR' THEN (item->>'sourceId') ~ '^OG\.[0-9]{7}(\.[A-Z0-9&]+)?$'
    WHEN 'WA' THEN (item->>'sourceId') ~ '^wa-[0-9]{3,9}(@(catalog:)?[0-9a-f]{64})?$' END,false)
  THEN RAISE EXCEPTION 'Invalid guide identity' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF NOT COALESCE((SELECT enabled FROM rmg_private.launch_control WHERE singleton),false) THEN
  RAISE EXCEPTION 'Unavailable' USING ERRCODE='P5030';
 END IF;

 -- Oregon uses the exact published mapping; Washington uses the accepted
 -- versioned read resolver for the selected lane. The STABLE public RPC runs read-only.
 RETURN QUERY
 WITH requested AS (
  SELECT entry->>'jurisdiction' AS jurisdiction,entry->>'sourceId' AS id,min(ordinality) AS first_position
  FROM jsonb_array_elements(p_guides) WITH ORDINALITY AS input(entry,ordinality)
  GROUP BY entry->>'jurisdiction',entry->>'sourceId'
 )
 SELECT m.source_id,requested.first_position
 FROM requested
 JOIN rmg_private.guide_identity_map m ON m.jurisdiction='OR' AND m.source_id=requested.id
 JOIN public.guides g ON g.id=m.guide_id AND g.listing_status='published'
 WHERE requested.jurisdiction='OR'
 UNION ALL
 SELECT requested.id,requested.first_position
 FROM requested
 WHERE requested.jurisdiction='WA' AND strpos(requested.id,'@')>0
  AND CASE WHEN strpos(requested.id,'@catalog:')>0
   THEN rmg_private.wa_catalog_review_target_v1(requested.id,NULL) IS NOT NULL
   ELSE rmg_private.wa_listed_review_target_v1(requested.id,NULL) IS NOT NULL END;
END $$;
