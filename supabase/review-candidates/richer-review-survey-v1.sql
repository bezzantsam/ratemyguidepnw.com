-- Extend the existing trip-response wire and checks without rewriting history.
-- Apply after richer-review-ratings-v1.sql. Both legacy and richer RPCs use these helpers.
CREATE OR REPLACE FUNCTION rmg_private.valid_trip_responses(doc jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE item record; answer jsonb; val jsonb; value_text text;
BEGIN
 IF doc IS NULL THEN RETURN true; END IF;
 IF jsonb_typeof(doc) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 IF doc->'version' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(doc->'answers') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_object_keys(doc) k WHERE k NOT IN ('version','answers')) THEN RETURN false; END IF;
 FOR item IN SELECT key,value FROM jsonb_each(doc->'answers') LOOP
  answer:=item.value;
  IF item.key NOT IN ('target_species','setting','teaching_requested','teaching_experience','children_present','guide_patience','effort','attentiveness','organization','kindness','fishiness','cleanliness','agreed_duration_minutes','actual_duration_minutes','fish_landed','duration_change_reason','response_slow_catch','dog_present','dog_previously_disclosed','conversation_preference','respect_for_boundaries') OR jsonb_typeof(answer) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(answer) k WHERE k NOT IN ('state','value')) THEN RETURN false; END IF;
  IF answer->>'state'='not_applicable' THEN IF answer ? 'value' THEN RETURN false; END IF; CONTINUE; END IF;
  IF answer->>'state' IS DISTINCT FROM 'answered' OR NOT (answer ? 'value') THEN RETURN false; END IF;
  val:=answer->'value'; value_text:=val #>> '{}';
  IF item.key IN ('teaching_requested','children_present','dog_present','dog_previously_disclosed') THEN
   IF jsonb_typeof(val)<>'boolean' THEN RETURN false; END IF;
  ELSIF item.key IN ('teaching_experience','guide_patience','effort','attentiveness','organization','kindness','fishiness','cleanliness','response_slow_catch','respect_for_boundaries') THEN
   IF jsonb_typeof(val)<>'number' OR value_text !~ '^[1-5]$' THEN RETURN false; END IF;
  ELSIF item.key IN ('agreed_duration_minutes','actual_duration_minutes') THEN
   IF jsonb_typeof(val)<>'number' OR value_text !~ '^(0|[1-9][0-9]{0,3})$' THEN RETURN false; END IF;
   IF value_text::integer>1440 THEN RETURN false; END IF;
  ELSIF item.key='fish_landed' THEN
   IF jsonb_typeof(val)<>'number' OR value_text !~ '^(0|[1-9][0-9]{0,9})$' THEN RETURN false; END IF;
   IF value_text::bigint>2147483647 THEN RETURN false; END IF;
  ELSIF item.key='target_species' THEN
   IF jsonb_typeof(val)<>'string' OR value_text NOT IN ('chinook','coho','steelhead','other','unknown') THEN RETURN false; END IF;
  ELSIF item.key='setting' THEN
   IF jsonb_typeof(val)<>'string' OR value_text NOT IN ('river','ocean','estuary','other','unknown') THEN RETURN false; END IF;
  ELSIF item.key='duration_change_reason' THEN
   IF jsonb_typeof(val)<>'string' OR value_text NOT IN ('weather','safety','customer_request','guide_decision','other','unknown') THEN RETURN false; END IF;
  ELSIF item.key='conversation_preference' THEN
   IF jsonb_typeof(val)<>'string' OR value_text NOT IN ('talkative','quiet','no_preference') THEN RETURN false; END IF;
  END IF;
 END LOOP;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION rmg_private.submit_revision(p_review_id uuid,p_quality smallint,p_intensity smallint,p_rebook boolean,p_body text,p_firsthand boolean,p_relationship text,p_trip_responses jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor(); gid uuid; original public.reviews%ROWTYPE; rid uuid; retained_answers jsonb;
BEGIN
 PERFORM rmg_private.lock_launch_for_write_v1();
 IF p_quality IS NULL OR p_quality NOT BETWEEN 1 AND 5 OR (p_intensity IS NOT NULL AND p_intensity NOT BETWEEN 1 AND 5) OR p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 1 AND 3000 OR p_firsthand IS DISTINCT FROM true OR p_relationship IS NULL OR p_relationship NOT IN ('none','personal','financial','other') OR NOT rmg_private.valid_trip_responses(p_trip_responses) THEN RAISE EXCEPTION 'Invalid review revision' USING ERRCODE='22023'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,84013));
 SELECT guide_id INTO gid FROM public.reviews WHERE id=p_review_id AND author_id=actor;
 IF gid IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE='P0002'; END IF;
 PERFORM rmg_private.lock_review_guide_v1(gid);
 PERFORM 1 FROM public.guides WHERE id=gid FOR UPDATE;
 SELECT * INTO original FROM public.reviews WHERE id=p_review_id FOR UPDATE;
 IF NOT FOUND OR original.author_id<>actor OR original.guide_id<>gid OR original.status<>'published' THEN RAISE EXCEPTION 'Not found' USING ERRCODE='P0002'; END IF;
 IF EXISTS(SELECT 1 FROM public.guide_claims c WHERE c.guide_id=gid AND c.claimant_id=actor AND c.status='approved') THEN RAISE EXCEPTION 'Owner cannot revise own guide review' USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM rmg_private.review_revisions WHERE submitter_id=actor AND created_at>now()-interval '24 hours')>=3 THEN RAISE EXCEPTION 'Revision limit reached' USING ERRCODE='P4290'; END IF;
 -- Older clients may submit a survey without these answers. Retain only the
 -- supplied review metrics that were previously recorded and are absent from the edit.
 SELECT jsonb_object_agg(key,value) INTO retained_answers
 FROM jsonb_each(original.trip_responses->'answers')
 WHERE key IN ('organization','kindness','fishiness','fish_landed')
  AND NOT coalesce((p_trip_responses->'answers') ? key,false);
 IF retained_answers IS NOT NULL THEN
  p_trip_responses:=jsonb_build_object('version',1,
   'answers',retained_answers||coalesce(p_trip_responses->'answers','{}'::jsonb));
 END IF;
 INSERT INTO rmg_private.review_revisions(review_id,submitter_id,quality,intensity,would_book_again,body,relationship_disclosure,trip_responses) VALUES(p_review_id,actor,p_quality,p_intensity,p_rebook,btrim(p_body),p_relationship,p_trip_responses) RETURNING id INTO rid;
 RETURN jsonb_build_object('id',rid,'status','pending');
END $$;
