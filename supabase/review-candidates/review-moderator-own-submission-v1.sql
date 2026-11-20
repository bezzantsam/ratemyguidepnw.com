-- Apply after richer-review-ratings-v1.sql. Keep author IDs out of queue DTOs.
CREATE FUNCTION rmg_private.is_own_pending_review_v1(p_review_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.is_site_admin() AND EXISTS (
  SELECT 1 FROM public.reviews r WHERE r.id=$1 AND r.status='pending' AND r.author_id=auth.uid())
$$;
REVOKE ALL ON FUNCTION rmg_private.is_own_pending_review_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION rmg_private.is_own_pending_review_v1(uuid) TO authenticated;

CREATE OR REPLACE VIEW public.admin_pending_reviews WITH (security_invoker=true) AS
 SELECT r.id,r.guide_id,CASE WHEN c.catalog_source_id IS NOT NULL THEN NULL ELSE g.full_name END AS guide_name,r.body,r.quality,r.safety,r.communication,
  r.professionalism,r.created_at,r.trip_month,r.firsthand_attested,r.relationship_disclosure,
  r.trip_responses,r.intensity,r.would_book_again,c.catalog_source_id,c.catalog_listing_sha256,
  r.equipment,r.knowledge,r.effort,r.value_rating,
  rmg_private.is_own_pending_review_v1(r.id) AS is_own_submission
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
   CASE WHEN v.ratings ? 'value' THEN (v.ratings->>'value')::numeric::smallint ELSE r.value_rating END AS value_rating,
   v.submitter_id=actor AS is_own_submission
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
