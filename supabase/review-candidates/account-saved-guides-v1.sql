BEGIN;

CREATE TABLE rmg_private.account_saved_guides (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 jurisdiction text NOT NULL CHECK (jurisdiction IN ('OR','WA')),
 source_id text NOT NULL CHECK (
  (jurisdiction='OR' AND source_id ~ '^OG\.[0-9]{7}(\.[A-Z0-9&]+)?$') OR
  (jurisdiction='WA' AND source_id ~ '^wa-[0-9]{3,9}$')
 ),
 entry_order bigint GENERATED ALWAYS AS IDENTITY,
 PRIMARY KEY (user_id,jurisdiction,source_id)
);
ALTER TABLE rmg_private.account_saved_guides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rmg_private.account_saved_guides FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT(jurisdiction,source_id) ON rmg_private.account_saved_guides TO authenticated;
CREATE POLICY account_saved_guides_own_read ON rmg_private.account_saved_guides FOR SELECT TO authenticated
 USING (user_id=(SELECT auth.uid()) AND (SELECT auth.jwt()->>'is_anonymous') IS DISTINCT FROM 'true');

-- Mutations are set operations, with the 50-guide limit checked under a per-account lock.
-- There is no client-supplied owner, and only the owner's ordered shortlist is returned.
CREATE FUNCTION public.rmg_account_saved_guides_v1(p_action text,p_guides jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 own_id uuid:=auth.uid();
 current_count integer;
 new_count integer;
 result_status text:='listed';
 guide jsonb;
 state text;
 source text;
BEGIN
 IF own_id IS NULL OR auth.jwt()->>'is_anonymous'='true' OR NOT EXISTS (
  SELECT 1 FROM auth.users WHERE id=own_id AND deleted_at IS NULL AND NOT COALESCE(is_anonymous,false)
 ) THEN RAISE EXCEPTION 'An account is required' USING ERRCODE='42501'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('list','save','remove','import')
  OR jsonb_typeof(p_guides) IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'Invalid shortlist request' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_guides)>50 OR
  (p_action IN ('save','remove') AND jsonb_array_length(p_guides)<>1) OR
  (p_action='list' AND jsonb_array_length(p_guides)<>0)
 THEN RAISE EXCEPTION 'Invalid shortlist request' USING ERRCODE='22023'; END IF;

 FOR guide IN SELECT value FROM jsonb_array_elements(p_guides) LOOP
  IF jsonb_typeof(guide) IS DISTINCT FROM 'object'
   OR guide - ARRAY['jurisdiction','sourceId'] <> '{}'::jsonb
   OR jsonb_typeof(guide->'jurisdiction') IS DISTINCT FROM 'string'
   OR jsonb_typeof(guide->'sourceId') IS DISTINCT FROM 'string'
  THEN RAISE EXCEPTION 'Invalid shortlist identity' USING ERRCODE='22023'; END IF;
  state:=guide->>'jurisdiction';
  source:=guide->>'sourceId';
  IF NOT ((state='OR' AND source ~ '^OG\.[0-9]{7}(\.[A-Z0-9&]+)?$') OR
          (state='WA' AND source ~ '^wa-[0-9]{3,9}$'))
  THEN RAISE EXCEPTION 'Invalid shortlist identity' USING ERRCODE='22023'; END IF;

  -- Check public source membership separately from review/claim eligibility.
  IF p_action IN ('save','import') AND NOT (
   (state='OR' AND EXISTS(SELECT 1 FROM rmg_private.guide_identity_map
                           WHERE jurisdiction='OR' AND source_id=source))
   OR (state='WA' AND EXISTS(SELECT 1 FROM rmg_private.wa_catalog_review_targets_v1
                            WHERE source_id=source))
  ) THEN RAISE EXCEPTION 'Unknown shortlist identity' USING ERRCODE='22023'; END IF;
 END LOOP;

 IF p_action<>'list' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(own_id::text,348731601));
 END IF;
 IF p_action='remove' THEN
  DELETE FROM rmg_private.account_saved_guides
   WHERE user_id=own_id AND jurisdiction=state AND source_id=source;
  result_status:='removed';
 ELSIF p_action IN ('save','import') THEN
  SELECT count(*) INTO current_count FROM rmg_private.account_saved_guides WHERE user_id=own_id;
  SELECT count(*) INTO new_count
   FROM (SELECT DISTINCT value->>'jurisdiction' AS j,value->>'sourceId' AS s
         FROM jsonb_array_elements(p_guides)) AS incoming
   WHERE NOT EXISTS(SELECT 1 FROM rmg_private.account_saved_guides saved
                    WHERE saved.user_id=own_id AND saved.jurisdiction=incoming.j AND saved.source_id=incoming.s);
  IF current_count+new_count>50 THEN
   result_status:='full';
  ELSE
   INSERT INTO rmg_private.account_saved_guides(user_id,jurisdiction,source_id)
    SELECT own_id,value->>'jurisdiction',value->>'sourceId'
    FROM jsonb_array_elements(p_guides) WITH ORDINALITY AS incoming(value,position)
    ORDER BY position ON CONFLICT (user_id,jurisdiction,source_id) DO NOTHING;
   result_status:=CASE p_action WHEN 'save' THEN 'saved' ELSE 'imported' END;
  END IF;
 END IF;
 RETURN jsonb_build_object('status',result_status,'items',COALESCE((
  SELECT jsonb_agg(jsonb_build_object('jurisdiction',jurisdiction,'sourceId',source_id) ORDER BY entry_order)
  FROM rmg_private.account_saved_guides WHERE user_id=own_id
 ),'[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.rmg_account_saved_guides_v1(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.rmg_account_saved_guides_v1(text,jsonb) TO authenticated;

COMMIT;
