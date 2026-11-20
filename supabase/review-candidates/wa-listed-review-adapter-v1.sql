-- Additive after the listed identity proof. No enrollment or population data.
-- The neutral row exists solely to satisfy the existing review foreign key.
CREATE FUNCTION rmg_private.prepare_wa_listed_review_carrier_v1(
 p_source_id text, p_listing_sha256 text, p_packet_sha256 text
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE binding rmg_private.wa_listed_review_identity_v1%ROWTYPE;
BEGIN
 SELECT * INTO binding FROM rmg_private.wa_listed_review_identity_v1
 WHERE source_id=p_source_id AND listing_sha256=p_listing_sha256 AND packet_sha256=p_packet_sha256
 FOR UPDATE;
 IF NOT FOUND OR binding.enabled OR EXISTS (SELECT 1 FROM rmg_private.guide_identity_map m
  WHERE (m.jurisdiction='WA' AND m.source_id=p_source_id) OR m.guide_id=binding.review_identity)
 THEN RAISE EXCEPTION 'Listed review carrier unavailable' USING ERRCODE='P5030'; END IF;
 INSERT INTO public.guides(id,slug,full_name,listing_status)
 VALUES (binding.review_identity,'wa-review-anchor-'||binding.review_identity,'Washington review target','draft');
 RETURN binding.review_identity;
END $$;

-- Freeze the opaque draft identity without blocking ordinary rating maintenance.
CREATE FUNCTION rmg_private.protect_wa_listed_review_carrier_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM rmg_private.wa_listed_review_identity_v1 w WHERE w.review_identity=OLD.id)
 THEN RAISE EXCEPTION 'Listed review carrier fields are fixed' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_wa_listed_review_carrier_v1
 BEFORE UPDATE OF id,slug,full_name,outfit_name,jurisdiction_id,license_number,verification_status,listing_status,website_url
 OR DELETE ON public.guides FOR EACH ROW
 WHEN (OLD.slug LIKE 'wa-review-anchor-%')
 EXECUTE FUNCTION rmg_private.protect_wa_listed_review_carrier_v1();

CREATE FUNCTION rmg_private.wa_listed_review_target_v1(p_versioned_source text,p_guide_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT w.review_identity FROM rmg_private.wa_listed_review_identity_v1 w
 JOIN public.guides g ON g.id=w.review_identity AND g.slug='wa-review-anchor-'||w.review_identity
  AND g.listing_status='draft' AND g.verification_status='listed'
  AND g.full_name='Washington review target' AND g.outfit_name IS NULL
  AND g.license_number IS NULL AND g.jurisdiction_id IS NULL AND g.website_url IS NULL
 WHERE w.enabled
   AND (p_versioned_source IS NOT NULL OR p_guide_id IS NOT NULL)
   AND (p_versioned_source IS NULL OR p_versioned_source=w.source_id||'@'||w.listing_sha256)
   AND (p_guide_id IS NULL OR p_guide_id=w.review_identity)
   AND COALESCE((SELECT enabled FROM rmg_private.launch_control WHERE singleton),false)
   AND NOT EXISTS (SELECT 1 FROM rmg_private.wa_review_pilot_v1 WHERE singleton AND enabled)
   AND NOT EXISTS (SELECT 1 FROM rmg_private.guide_identity_map m
     WHERE (m.jurisdiction='WA' AND m.source_id=w.source_id) OR m.guide_id=w.review_identity)
$$;

CREATE OR REPLACE FUNCTION rmg_private.review_target_for_write_v1(p_jurisdiction text,p_source_id text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE gid uuid;
BEGIN
 IF p_jurisdiction='OR' THEN RETURN rmg_private.resolve_guide(p_jurisdiction,p_source_id); END IF;
 IF p_jurisdiction IS DISTINCT FROM 'WA' OR p_source_id IS NULL THEN
  RAISE EXCEPTION 'Review identity unavailable' USING ERRCODE='P5030';
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
 IF rmg_private.has_oregon_review_guide_v1(p_guide_id) THEN RETURN; END IF;
 PERFORM 1 FROM rmg_private.wa_review_pilot_v1 WHERE singleton FOR SHARE;
 IF rmg_private.wa_review_target_v1(NULL,p_guide_id) IS NOT NULL THEN RETURN; END IF;
 PERFORM 1 FROM rmg_private.wa_listed_review_identity_v1 WHERE review_identity=p_guide_id FOR SHARE;
 IF rmg_private.wa_listed_review_target_v1(NULL,p_guide_id) IS NULL THEN
  RAISE EXCEPTION 'Review identity unavailable' USING ERRCODE='P5030';
 END IF;
END $$;

CREATE FUNCTION rmg_private.review_read_target_v1(p_jurisdiction text,p_source_id text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE gid uuid;
BEGIN
 IF p_jurisdiction='WA' AND position('@' IN p_source_id)>0 THEN
  gid:=rmg_private.wa_listed_review_target_v1(p_source_id,NULL);
  IF gid IS NULL THEN RAISE EXCEPTION 'Listed Washington review target unavailable' USING ERRCODE='P5030'; END IF;
  RETURN gid;
 END IF;
 RETURN rmg_private.resolve_guide(p_jurisdiction,p_source_id);
END $$;

CREATE FUNCTION public.rmg_resolve_review_target_v1(p_jurisdiction text,p_source_id text) RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT rmg_private.review_read_target_v1($1,$2)
$$;

CREATE OR REPLACE FUNCTION public.rmg_review_summary(p_jurisdiction text,p_source_id text) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('count',count(*),'averageQuality',round(avg(quality)::numeric,2),'wouldBookAgainPercent',round(100.0*avg(would_book_again::int),2),'wouldBookAgainResponses',count(would_book_again))
 FROM public.public_angler_reviews WHERE guide_id=rmg_private.review_read_target_v1($1,$2)
$$;

CREATE OR REPLACE FUNCTION rmg_private.own_review_for_guide(p_jurisdiction text,p_source_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor(); gid uuid; result jsonb;
BEGIN
 gid:=rmg_private.review_read_target_v1(p_jurisdiction,p_source_id);
 SELECT jsonb_build_object('id',r.id,'status',r.status) INTO result
 FROM public.reviews r WHERE r.guide_id=gid AND r.author_id=actor;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION rmg_private.prepare_wa_listed_review_carrier_v1(text,text,text),
 rmg_private.protect_wa_listed_review_carrier_v1(),rmg_private.wa_listed_review_target_v1(text,uuid),
 rmg_private.review_read_target_v1(text,text),public.rmg_resolve_review_target_v1(text,text)
 FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rmg_private.review_read_target_v1(text,text),
 public.rmg_resolve_review_target_v1(text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION rmg_private.review_write_availability(p_jurisdiction text,p_source_id text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE gid uuid; available boolean;
BEGIN
 IF p_jurisdiction='OR' THEN
  gid:=rmg_private.resolve_guide(p_jurisdiction,p_source_id);
 ELSIF p_jurisdiction='WA' AND p_source_id IS NOT NULL THEN
  gid:=COALESCE(rmg_private.wa_review_target_v1(p_source_id,NULL),rmg_private.wa_listed_review_target_v1(p_source_id,NULL));
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
 THEN (rmg_private.has_oregon_review_guide_v1($1) OR rmg_private.wa_review_target_v1(NULL,$1) IS NOT NULL OR rmg_private.wa_listed_review_target_v1(NULL,$1) IS NOT NULL)
 ELSE false END
$$;

CREATE OR REPLACE FUNCTION rmg_private.revision_queue(p_offset integer,p_limit integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor();result jsonb;
BEGIN
 IF NOT public.is_site_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.created_at,q.id),'[]'::jsonb) INTO result FROM
  (SELECT v.id,v.review_id,g.full_name AS guide_name,m.jurisdiction,m.source_id,v.quality,v.intensity,v.would_book_again,v.body,v.relationship_disclosure,v.trip_responses,v.trip_month,v.trip_month_specified,v.created_at FROM rmg_private.review_revisions v JOIN public.reviews r ON r.id=v.review_id JOIN public.guides g ON g.id=r.guide_id JOIN LATERAL (
   SELECT i.jurisdiction,i.source_id FROM rmg_private.guide_identity_map i
   WHERE i.guide_id=g.id AND g.listing_status='published'
    AND (i.jurisdiction='OR' OR (i.jurisdiction='WA' AND rmg_private.wa_review_target_v1(i.source_id,g.id) IS NOT NULL))
   UNION ALL
   SELECT 'WA',w.source_id FROM rmg_private.wa_listed_review_identity_v1 w
   WHERE w.review_identity=g.id AND rmg_private.wa_listed_review_target_v1(NULL,g.id) IS NOT NULL
  ) m ON true WHERE v.status='pending' ORDER BY v.created_at,v.id OFFSET p_offset LIMIT p_limit) q;
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
   g.full_name AS guide_name,m.jurisdiction,m.source_id
  FROM public.review_flags f JOIN public.reviews r ON r.id=f.review_id JOIN public.guides g ON g.id=r.guide_id
  JOIN LATERAL (
   SELECT i.jurisdiction,i.source_id FROM rmg_private.guide_identity_map i
   WHERE i.guide_id=g.id AND g.listing_status='published'
    AND (i.jurisdiction='OR' OR (i.jurisdiction='WA' AND rmg_private.wa_review_target_v1(i.source_id,g.id) IS NOT NULL))
   UNION ALL
   SELECT 'WA',w.source_id FROM rmg_private.wa_listed_review_identity_v1 w
   WHERE w.review_identity=g.id AND rmg_private.wa_listed_review_target_v1(NULL,g.id) IS NOT NULL
  ) m ON true
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
    UNION ALL SELECT 'WA',source_id FROM rmg_private.wa_listed_review_identity_v1
     WHERE z.kind='review' AND review_identity=z.guide_id
   ) i),'[]'::jsonb) AS identities FROM (
   SELECT 'review'::text kind,r.id,r.status,r.created_at,NULL::uuid review_id,r.guide_id FROM public.reviews r WHERE r.author_id=actor
   UNION ALL SELECT 'claim',c.id,c.status,c.created_at,NULL::uuid,c.guide_id FROM public.guide_claims c WHERE c.claimant_id=actor
   UNION ALL SELECT 'revision',v.id,v.status,v.created_at,v.review_id,r.guide_id FROM rmg_private.review_revisions v JOIN public.reviews r ON r.id=v.review_id WHERE v.submitter_id=actor
  ) z LEFT JOIN LATERAL (SELECT jurisdiction,source_id FROM (
    SELECT jurisdiction,source_id FROM rmg_private.guide_identity_map WHERE guide_id=z.guide_id
    UNION ALL SELECT 'WA',source_id FROM rmg_private.wa_listed_review_identity_v1
     WHERE z.kind='review' AND review_identity=z.guide_id
   ) identity ORDER BY jurisdiction,source_id LIMIT 1) m ON true
  ORDER BY z.created_at DESC,z.id OFFSET p_offset LIMIT p_limit
 ) q;
 RETURN result;
END $$;

-- A paused carrier stays in storage. Its previously published review also stops
-- appearing through the public view or direct anon/authenticated review SELECT.
CREATE FUNCTION rmg_private.review_carrier_visible_v1(p_guide_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT NOT EXISTS (SELECT 1 FROM rmg_private.wa_listed_review_identity_v1 w WHERE w.review_identity=$1)
   OR rmg_private.wa_listed_review_target_v1(NULL,$1) IS NOT NULL
$$;
REVOKE ALL ON FUNCTION rmg_private.review_carrier_visible_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rmg_private.review_carrier_visible_v1(uuid) TO anon, authenticated;
CREATE POLICY listed_review_carrier_visibility_v1 ON public.reviews
 AS RESTRICTIVE FOR SELECT TO anon, authenticated
 USING (rmg_private.review_carrier_visible_v1(guide_id));
