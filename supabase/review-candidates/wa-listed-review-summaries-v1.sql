-- Apply after public-review-summaries-v1.sql and wa-listed-review-adapter-v1.sql.
-- Both existing function signatures and their grants stay in place.
DO $$
BEGIN
 IF to_regprocedure('rmg_private.wa_listed_review_target_v1(text,uuid)') IS NULL
  OR to_regprocedure('public.rmg_resolve_review_target_v1(text,text)') IS NULL
  OR to_regprocedure('public.rmg_public_review_summaries_v1(jsonb)') IS NULL THEN
  RAISE EXCEPTION 'Oregon batch and Washington listed review adapter required';
 END IF;
END $$;
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
    WHEN 'WA' THEN (item->>'sourceId') ~ '^wa-[0-9]{3,9}(@[0-9a-f]{64})?$' END,false)
  THEN RAISE EXCEPTION 'Invalid guide identity' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF NOT COALESCE((SELECT enabled FROM rmg_private.launch_control WHERE singleton),false) THEN
  RAISE EXCEPTION 'Unavailable' USING ERRCODE='P5030';
 END IF;

 -- Oregon uses the existing exact published mapping. Washington requires the
 -- server's versioned source and the same readiness check as the profile.
 -- No internal UUID leaves this helper.
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
  -- Resolve in the batch snapshot as well as checking the profile readiness
  -- RPC. A concurrent reopening cannot admit a version absent in this snapshot.
  AND rmg_private.wa_listed_review_target_v1(requested.id,NULL) IS NOT NULL
  AND rmg_private.review_write_availability('WA',requested.id)->'available'='true'::jsonb;
END $$;

CREATE OR REPLACE FUNCTION public.rmg_public_review_summaries_v1(p_guides jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH targets AS (
  SELECT source_id,input_order,CASE WHEN strpos(source_id,'@')>0 THEN 'WA' ELSE 'OR' END AS jurisdiction
  FROM rmg_private.directory_review_sources_v1($1)
 ), summaries AS MATERIALIZED (
  SELECT jurisdiction,split_part(source_id,'@',1) AS source_id,input_order,
   public.rmg_review_summary(jurisdiction,source_id) AS summary
  FROM targets
 )
 SELECT jsonb_build_object('items',COALESCE(jsonb_agg(jsonb_build_object(
  'jurisdiction',jurisdiction,'sourceId',source_id,'count',summary->'count','averageQuality',summary->'averageQuality'
 ) ORDER BY input_order),'[]'::jsonb))
 FROM summaries
$$;
