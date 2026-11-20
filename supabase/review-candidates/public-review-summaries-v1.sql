-- Directory ratings on the Oregon base. Public values use the profile RPC under invoker RLS.
CREATE FUNCTION rmg_private.directory_review_sources_v1(p_guides jsonb)
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
    WHEN 'WA' THEN (item->>'sourceId') ~ '^wa-[0-9]{3,9}$' END,false)
  THEN RAISE EXCEPTION 'Invalid guide identity' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF NOT COALESCE((SELECT enabled FROM rmg_private.launch_control WHERE singleton),false) THEN
  RAISE EXCEPTION 'Unavailable' USING ERRCODE='P5030';
 END IF;

 -- The same exact published mapping used by resolve_guide, limited to Oregon.
 -- No internal UUID leaves this helper.
 RETURN QUERY
 WITH requested AS (
  SELECT entry->>'sourceId' AS id,min(ordinality) AS first_position
  FROM jsonb_array_elements(p_guides) WITH ORDINALITY AS input(entry,ordinality)
  WHERE entry->>'jurisdiction'='OR' GROUP BY entry->>'sourceId'
 )
 SELECT m.source_id,requested.first_position
 FROM requested
 JOIN rmg_private.guide_identity_map m ON m.jurisdiction='OR' AND m.source_id=requested.id
 JOIN public.guides g ON g.id=m.guide_id AND g.listing_status='published';
END $$;

CREATE FUNCTION public.rmg_public_review_summaries_v1(p_guides jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH summaries AS MATERIALIZED (
  SELECT source_id,input_order,public.rmg_review_summary('OR',source_id) AS summary
  FROM rmg_private.directory_review_sources_v1($1)
 )
 SELECT jsonb_build_object('items',COALESCE(jsonb_agg(jsonb_build_object(
  'jurisdiction','OR','sourceId',source_id,'count',summary->'count','averageQuality',summary->'averageQuality'
 ) ORDER BY input_order),'[]'::jsonb))
 FROM summaries
$$;

REVOKE ALL ON FUNCTION rmg_private.directory_review_sources_v1(jsonb),
 public.rmg_public_review_summaries_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION rmg_private.directory_review_sources_v1(jsonb),
 public.rmg_public_review_summaries_v1(jsonb) TO anon,authenticated;
