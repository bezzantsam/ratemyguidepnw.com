-- Install after the WA catalog review adapter. Keep the existing v2 RPCs and read gates.
CREATE FUNCTION rmg_private.valid_review_ratings_v1(p_ratings jsonb, p_revision boolean)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN jsonb_typeof(p_ratings) IS DISTINCT FROM 'object' THEN false ELSE NOT EXISTS (
  SELECT 1 FROM jsonb_each(p_ratings) AS item(key,value)
  WHERE key NOT IN ('communication','professionalism','safety','equipment','knowledge','effort','value')
     OR NOT (value IN ('1','2','3','4','5') OR (p_revision AND value='null'))
 ) END
$$;

ALTER TABLE rmg_private.review_revisions ADD COLUMN ratings jsonb
 CHECK (ratings IS NULL OR rmg_private.valid_review_ratings_v1(ratings,true));

CREATE FUNCTION rmg_private.submit_review_v3(
 p_jurisdiction text,p_source_id text,p_quality smallint,p_intensity smallint,p_rebook boolean,
 p_body text,p_firsthand boolean,p_relationship text,p_trip_responses jsonb,p_trip_month text,p_ratings jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE receipt jsonb;
BEGIN
 IF p_rebook IS NULL OR NOT rmg_private.valid_review_ratings_v1(p_ratings,false) THEN
  RAISE EXCEPTION 'Invalid review ratings' USING ERRCODE='22023';
 END IF;
 receipt:=rmg_private.submit_review_v2(p_jurisdiction,p_source_id,p_quality,p_intensity,p_rebook,
  p_body,p_firsthand,p_relationship,p_trip_responses,p_trip_month);
 UPDATE public.reviews SET
  communication=(p_ratings->>'communication')::numeric::smallint,
  professionalism=(p_ratings->>'professionalism')::numeric::smallint,
  safety=(p_ratings->>'safety')::numeric::smallint,
  equipment=(p_ratings->>'equipment')::numeric::smallint,
  knowledge=(p_ratings->>'knowledge')::numeric::smallint,
  effort=(p_ratings->>'effort')::numeric::smallint,
  value_rating=(p_ratings->>'value')::numeric::smallint
 WHERE id=(receipt->>'id')::uuid;
 RETURN receipt;
END $$;

CREATE FUNCTION rmg_private.submit_revision_v3(
 p_review_id uuid,p_quality smallint,p_intensity smallint,p_rebook boolean,
 p_body text,p_firsthand boolean,p_relationship text,p_trip_responses jsonb,
 p_trip_month_specified boolean,p_trip_month text,p_ratings jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE receipt jsonb;
BEGIN
 IF NOT rmg_private.valid_review_ratings_v1(p_ratings,true) THEN
  RAISE EXCEPTION 'Invalid review ratings' USING ERRCODE='22023';
 END IF;
 -- The v2 path locks the published original and allows only one pending revision.
 -- A missing booking answer on this path retains the original answer, including NULL.
 receipt:=rmg_private.submit_revision_v2(p_review_id,p_quality,p_intensity,p_rebook,
  p_body,p_firsthand,p_relationship,p_trip_responses,p_trip_month_specified,p_trip_month);
 UPDATE rmg_private.review_revisions v SET ratings=p_ratings,
  would_book_again=coalesce(p_rebook,r.would_book_again)
 FROM public.reviews r WHERE v.id=(receipt->>'id')::uuid AND r.id=v.review_id;
 RETURN receipt;
END $$;

CREATE FUNCTION public.rmg_submit_review_v3(
 p_jurisdiction text,p_source_id text,p_quality smallint,p_intensity smallint,p_rebook boolean,
 p_body text,p_firsthand boolean,p_relationship text,p_trip_responses jsonb,p_trip_month text,p_ratings jsonb
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT rmg_private.submit_review_v3($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
$$;

CREATE FUNCTION public.rmg_submit_revision_v3(
 p_review_id uuid,p_quality smallint,p_intensity smallint,p_rebook boolean,
 p_body text,p_firsthand boolean,p_relationship text,p_trip_responses jsonb,
 p_trip_month_specified boolean,p_trip_month text,p_ratings jsonb
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT rmg_private.submit_revision_v3($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
$$;

REVOKE ALL ON FUNCTION rmg_private.valid_review_ratings_v1(jsonb,boolean),
 rmg_private.submit_review_v3(text,text,smallint,smallint,boolean,text,boolean,text,jsonb,text,jsonb),
 rmg_private.submit_revision_v3(uuid,smallint,smallint,boolean,text,boolean,text,jsonb,boolean,text,jsonb),
 public.rmg_submit_review_v3(text,text,smallint,smallint,boolean,text,boolean,text,jsonb,text,jsonb),
 public.rmg_submit_revision_v3(uuid,smallint,smallint,boolean,text,boolean,text,jsonb,boolean,text,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION rmg_private.submit_review_v3(text,text,smallint,smallint,boolean,text,boolean,text,jsonb,text,jsonb),
 rmg_private.submit_revision_v3(uuid,smallint,smallint,boolean,text,boolean,text,jsonb,boolean,text,jsonb),
 public.rmg_submit_review_v3(text,text,smallint,smallint,boolean,text,boolean,text,jsonb,text,jsonb),
 public.rmg_submit_revision_v3(uuid,smallint,smallint,boolean,text,boolean,text,jsonb,boolean,text,jsonb)
 TO authenticated;

CREATE OR REPLACE FUNCTION rmg_private.decide_revision(p_id uuid,p_approve boolean,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor(); vid uuid; gid uuid; original public.reviews%ROWTYPE; proposal rmg_private.review_revisions%ROWTYPE;
BEGIN
 PERFORM rmg_private.lock_launch_for_write_v1();
 IF NOT public.is_site_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_approve IS NULL OR length(coalesce(p_reason,''))>500 OR (p_approve AND length(btrim(coalesce(p_reason,'')))<20) THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE='22023'; END IF;
 SELECT v.review_id,r.guide_id INTO vid,gid FROM rmg_private.review_revisions v JOIN public.reviews r ON r.id=v.review_id WHERE v.id=p_id;
 IF vid IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE='P0002'; END IF;
 PERFORM rmg_private.lock_review_guide_v1(gid);
 PERFORM 1 FROM public.guides WHERE id=gid FOR UPDATE;
 SELECT * INTO original FROM public.reviews WHERE id=vid FOR UPDATE;
 SELECT * INTO proposal FROM rmg_private.review_revisions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR original.guide_id IS DISTINCT FROM gid OR proposal.review_id IS DISTINCT FROM vid OR original.status<>'published' OR proposal.status<>'pending' THEN RAISE EXCEPTION 'Revision unavailable' USING ERRCODE='P0001'; END IF;
 IF actor=proposal.submitter_id OR EXISTS(SELECT 1 FROM public.guide_claims WHERE guide_id=gid AND claimant_id=actor AND status='approved') THEN RAISE EXCEPTION 'Conflicting moderator' USING ERRCODE='42501'; END IF;
 IF p_approve THEN
  UPDATE public.reviews SET quality=proposal.quality,intensity=proposal.intensity,
   would_book_again=proposal.would_book_again,body=proposal.body,
   relationship_disclosure=proposal.relationship_disclosure,trip_responses=proposal.trip_responses,
   trip_month=CASE WHEN proposal.trip_month_specified THEN proposal.trip_month ELSE original.trip_month END,
   communication=CASE WHEN proposal.ratings ? 'communication' THEN (proposal.ratings->>'communication')::numeric::smallint ELSE original.communication END,
   professionalism=CASE WHEN proposal.ratings ? 'professionalism' THEN (proposal.ratings->>'professionalism')::numeric::smallint ELSE original.professionalism END,
   safety=CASE WHEN proposal.ratings ? 'safety' THEN (proposal.ratings->>'safety')::numeric::smallint ELSE original.safety END,
   equipment=CASE WHEN proposal.ratings ? 'equipment' THEN (proposal.ratings->>'equipment')::numeric::smallint ELSE original.equipment END,
   knowledge=CASE WHEN proposal.ratings ? 'knowledge' THEN (proposal.ratings->>'knowledge')::numeric::smallint ELSE original.knowledge END,
   effort=CASE WHEN proposal.ratings ? 'effort' THEN (proposal.ratings->>'effort')::numeric::smallint ELSE original.effort END,
   value_rating=CASE WHEN proposal.ratings ? 'value' THEN (proposal.ratings->>'value')::numeric::smallint ELSE original.value_rating END
  WHERE id=vid;
 END IF;
 UPDATE rmg_private.review_revisions SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,decided_at=now(),decided_by=actor WHERE id=p_id;
 INSERT INTO public.moderation_audit(actor_id,target_type,target_id,old_status,new_status,reason) VALUES(actor,'review',vid,'published','published',left((CASE WHEN p_approve THEN 'approved revision ' ELSE 'rejected revision ' END)||p_id::text||'; '||coalesce(p_reason,''),500));
 RETURN jsonb_build_object('id',p_id,'status',CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END);
END $$;

CREATE OR REPLACE VIEW public.admin_pending_reviews WITH (security_invoker=true) AS
 SELECT r.id,r.guide_id,CASE WHEN c.catalog_source_id IS NOT NULL THEN NULL ELSE g.full_name END AS guide_name,r.body,r.quality,r.safety,r.communication,
  r.professionalism,r.created_at,r.trip_month,r.firsthand_attested,r.relationship_disclosure,
  r.trip_responses,r.intensity,r.would_book_again,c.catalog_source_id,c.catalog_listing_sha256,
  r.equipment,r.knowledge,r.effort,r.value_rating
 FROM public.reviews r JOIN public.guides g ON g.id=r.guide_id
 LEFT JOIN LATERAL rmg_private.wa_catalog_moderator_identity_v1(r.guide_id) c ON true
 WHERE r.status='pending' AND rmg_private.review_queue_eligible_v1(r.guide_id);

CREATE OR REPLACE FUNCTION rmg_private.revision_queue(p_offset integer,p_limit integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor();result jsonb;
BEGIN
 IF NOT public.is_site_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.created_at,q.id),'[]'::jsonb) INTO result FROM
  (SELECT v.id,v.review_id,CASE WHEN c.catalog_source_id IS NOT NULL THEN NULL ELSE g.full_name END AS guide_name,m.jurisdiction,m.source_id,c.catalog_source_id,c.catalog_listing_sha256,v.quality,v.intensity,v.would_book_again,v.body,v.relationship_disclosure,v.trip_responses,v.trip_month,v.trip_month_specified,v.created_at,
   CASE WHEN v.ratings ? 'communication' THEN (v.ratings->>'communication')::numeric::smallint ELSE r.communication END AS communication,
   CASE WHEN v.ratings ? 'professionalism' THEN (v.ratings->>'professionalism')::numeric::smallint ELSE r.professionalism END AS professionalism,
   CASE WHEN v.ratings ? 'safety' THEN (v.ratings->>'safety')::numeric::smallint ELSE r.safety END AS safety,
   CASE WHEN v.ratings ? 'equipment' THEN (v.ratings->>'equipment')::numeric::smallint ELSE r.equipment END AS equipment,
   CASE WHEN v.ratings ? 'knowledge' THEN (v.ratings->>'knowledge')::numeric::smallint ELSE r.knowledge END AS knowledge,
   CASE WHEN v.ratings ? 'effort' THEN (v.ratings->>'effort')::numeric::smallint ELSE r.effort END AS effort,
   CASE WHEN v.ratings ? 'value' THEN (v.ratings->>'value')::numeric::smallint ELSE r.value_rating END AS value_rating
   FROM rmg_private.review_revisions v JOIN public.reviews r ON r.id=v.review_id JOIN public.guides g ON g.id=r.guide_id JOIN LATERAL (
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
