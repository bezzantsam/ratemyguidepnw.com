-- LOCAL REVIEW CANDIDATE ONLY. Depends on 01-authorization-lockdown.sql.
-- Not a Supabase migration until generated and reviewed against a fresh hosted catalog.
BEGIN;
CREATE SCHEMA IF NOT EXISTS rmg_private;
REVOKE ALL ON SCHEMA rmg_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA rmg_private TO anon, authenticated;
CREATE TABLE rmg_private.launch_control (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false
);
ALTER TABLE rmg_private.launch_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rmg_private.launch_control FROM PUBLIC,anon,authenticated;
INSERT INTO rmg_private.launch_control(singleton,enabled) VALUES(true,false);

-- Maps only independently reviewed source IDs. No records are automatically matched.
CREATE TABLE rmg_private.guide_identity_map (
 jurisdiction text NOT NULL CHECK (jurisdiction IN ('OR','WA')),
 source_id text NOT NULL CHECK (length(source_id) BETWEEN 1 AND 100),
 guide_id uuid NOT NULL REFERENCES public.guides(id),
 reviewed_at timestamptz NOT NULL,
 review_reference text NOT NULL CHECK (length(review_reference) BETWEEN 1 AND 1000),
 PRIMARY KEY (jurisdiction,source_id), UNIQUE (jurisdiction,guide_id)
);
ALTER TABLE rmg_private.guide_identity_map ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rmg_private.guide_identity_map FROM PUBLIC, anon, authenticated;
CREATE TABLE rmg_private.profile_declarations (
 guide_id uuid PRIMARY KEY REFERENCES public.guides(id),
 declared_by uuid NOT NULL REFERENCES auth.users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rmg_private.profile_declarations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rmg_private.profile_declarations FROM PUBLIC,anon,authenticated;
ALTER TABLE public.reviews ADD COLUMN firsthand_attested boolean NOT NULL DEFAULT false;
ALTER TABLE public.reviews ADD COLUMN relationship_disclosure text;
ALTER TABLE public.reviews ADD COLUMN trip_responses jsonb;
-- Broaden legacy review text and permit genuinely unanswered optional fields.
ALTER TABLE public.reviews ALTER COLUMN intensity DROP NOT NULL;
ALTER TABLE public.reviews ALTER COLUMN would_book_again DROP NOT NULL;
ALTER TABLE public.reviews DROP CONSTRAINT reviews_body_check;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_body_check CHECK (char_length(btrim(body)) BETWEEN 1 AND 3000);
ALTER TABLE public.reviews ADD CONSTRAINT reviews_relationship_disclosure_check
 CHECK (relationship_disclosure IS NULL OR relationship_disclosure IN ('none','personal','financial','other'));
GRANT SELECT (relationship_disclosure,trip_responses) ON public.reviews TO anon,authenticated;
CREATE OR REPLACE VIEW public.public_angler_reviews WITH (security_invoker=true) AS
 SELECT id,guide_id,quality,intensity,would_book_again,catch_outcome,body,trip_month,published_at,
 communication,professionalism,safety,equipment,knowledge,effort,value_rating,trip_context,relationship_disclosure,trip_responses
 FROM public.reviews WHERE status='published' AND published_at IS NOT NULL;
CREATE OR REPLACE VIEW public.admin_pending_reviews WITH (security_invoker=true) AS
 SELECT r.id,r.guide_id,g.full_name AS guide_name,r.body,r.quality,r.safety,r.communication,r.professionalism,r.created_at,r.trip_month,r.firsthand_attested,r.relationship_disclosure,r.trip_responses,r.intensity,r.would_book_again
 FROM public.reviews r JOIN public.guides g ON g.id=r.guide_id
 WHERE r.status='pending' AND public.is_site_admin();
GRANT SELECT (firsthand_attested) ON public.reviews TO authenticated;

CREATE FUNCTION rmg_private.require_actor() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
 IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=actor AND u.email_confirmed_at IS NOT NULL AND COALESCE(u.is_anonymous,false)=false AND u.deleted_at IS NULL)
 THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF NOT COALESCE((SELECT enabled FROM rmg_private.launch_control WHERE singleton),false) THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='P5030'; END IF;
 RETURN actor;
END $$;
CREATE FUNCTION rmg_private.resolve_guide(p_jurisdiction text,p_source_id text) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE gid uuid;
BEGIN
 IF NOT COALESCE((SELECT enabled FROM rmg_private.launch_control WHERE singleton),false) THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='P5030'; END IF;
 IF p_jurisdiction NOT IN ('OR','WA') OR p_source_id IS NULL OR length(p_source_id) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid guide identity' USING ERRCODE='22023'; END IF;
 SELECT m.guide_id INTO gid FROM rmg_private.guide_identity_map m JOIN public.guides g ON g.id=m.guide_id WHERE m.jurisdiction=p_jurisdiction AND m.source_id=p_source_id AND g.listing_status='published';
 IF gid IS NULL THEN RAISE EXCEPTION 'Guide mapping unavailable' USING ERRCODE='P0002'; END IF;
 RETURN gid;
END $$;
-- Optional, versioned, allowlisted answers. Absent keys mean unanswered;
-- {state:not_applicable} is distinct from {state:answered,value:false or 1}.
CREATE FUNCTION rmg_private.valid_trip_responses(doc jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE item record; answer jsonb; val jsonb; value_text text;
BEGIN
 IF doc IS NULL THEN RETURN true; END IF;
 IF jsonb_typeof(doc) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 IF doc->'version' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(doc->'answers') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_object_keys(doc) k WHERE k NOT IN ('version','answers')) THEN RETURN false; END IF;
 FOR item IN SELECT key,value FROM jsonb_each(doc->'answers') LOOP
  answer:=item.value;
  IF item.key NOT IN ('target_species','setting','teaching_requested','teaching_experience','children_present','guide_patience','effort','attentiveness','organization','cleanliness','agreed_duration_minutes','actual_duration_minutes','duration_change_reason','response_slow_catch','dog_present','dog_previously_disclosed','conversation_preference','respect_for_boundaries') OR jsonb_typeof(answer) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(answer) k WHERE k NOT IN ('state','value')) THEN RETURN false; END IF;
  IF answer->>'state'='not_applicable' THEN IF answer ? 'value' THEN RETURN false; END IF; CONTINUE; END IF;
  IF answer->>'state' IS DISTINCT FROM 'answered' OR NOT (answer ? 'value') THEN RETURN false; END IF;
  val:=answer->'value'; value_text:=val #>> '{}';
  IF item.key IN ('teaching_requested','children_present','dog_present','dog_previously_disclosed') THEN
   IF jsonb_typeof(val)<>'boolean' THEN RETURN false; END IF;
  ELSIF item.key IN ('teaching_experience','guide_patience','effort','attentiveness','organization','cleanliness','response_slow_catch','respect_for_boundaries') THEN
   IF jsonb_typeof(val)<>'number' OR value_text !~ '^[1-5]$' THEN RETURN false; END IF;
  ELSIF item.key IN ('agreed_duration_minutes','actual_duration_minutes') THEN
   IF jsonb_typeof(val)<>'number' OR value_text !~ '^(0|[1-9][0-9]{0,3})$' THEN RETURN false; END IF;
   IF value_text::integer>1440 THEN RETURN false; END IF;
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
ALTER TABLE public.reviews ADD CONSTRAINT reviews_trip_responses_v1_check CHECK (rmg_private.valid_trip_responses(trip_responses));
CREATE FUNCTION rmg_private.submit_review(p_jurisdiction text,p_source_id text,p_quality smallint,p_intensity smallint,p_rebook boolean,p_body text,p_firsthand boolean,p_relationship text,p_trip_responses jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := rmg_private.require_actor(); gid uuid; rid uuid;
BEGIN
 IF p_quality IS NULL OR p_quality NOT BETWEEN 1 AND 5 OR (p_intensity IS NOT NULL AND p_intensity NOT BETWEEN 1 AND 5) OR p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 1 AND 3000 OR p_firsthand IS DISTINCT FROM true OR p_relationship IS NULL OR p_relationship NOT IN ('none','personal','financial','other') OR NOT rmg_private.valid_trip_responses(p_trip_responses) THEN RAISE EXCEPTION 'Invalid review' USING ERRCODE='22023'; END IF;
 gid:=rmg_private.resolve_guide(p_jurisdiction,p_source_id);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text, 84011));
 -- Serialize with claim approvals on the same guide before checking ownership.
 PERFORM 1 FROM public.guides WHERE id=gid FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.guide_claims c WHERE c.guide_id=gid AND c.claimant_id=actor AND c.status='approved') THEN RAISE EXCEPTION 'Owner cannot review own guide' USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM public.reviews r WHERE r.author_id=actor AND r.created_at>now()-interval '24 hours')>=3 THEN RAISE EXCEPTION 'Review limit reached' USING ERRCODE='P4290'; END IF;
 INSERT INTO public.reviews(guide_id,author_id,quality,intensity,would_book_again,body,firsthand_attested,relationship_disclosure,trip_responses,status,published_at) VALUES(gid,actor,p_quality,p_intensity,p_rebook,btrim(p_body),true,p_relationship,p_trip_responses,'pending',NULL) RETURNING id INTO rid;
 RETURN jsonb_build_object('id',rid,'status','pending');
END $$;
CREATE FUNCTION rmg_private.submit_claim(p_jurisdiction text,p_source_id text,p_name text,p_business text,p_evidence text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := rmg_private.require_actor(); gid uuid; cid uuid;
BEGIN
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 2 AND 120 OR length(coalesce(p_business,''))>160 OR p_evidence IS NULL OR length(btrim(p_evidence)) NOT BETWEEN 20 AND 1200 THEN RAISE EXCEPTION 'Invalid claim' USING ERRCODE='22023'; END IF;
 gid:=rmg_private.resolve_guide(p_jurisdiction,p_source_id);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text, 84012));
 SELECT c.id INTO cid FROM public.guide_claims c WHERE c.claimant_id=actor AND c.guide_id=gid AND c.status='pending' ORDER BY c.created_at DESC LIMIT 1;
 IF cid IS NOT NULL THEN RETURN jsonb_build_object('id',cid,'status','pending','existing',true); END IF;
 IF (SELECT count(*) FROM public.guide_claims c WHERE c.claimant_id=actor AND c.created_at>now()-interval '24 hours')>=3 THEN RAISE EXCEPTION 'Claim limit reached' USING ERRCODE='P4290'; END IF;
 INSERT INTO public.guide_claims(guide_id,claimant_id,status) VALUES(gid,actor,'pending') RETURNING id INTO cid;
 INSERT INTO public.claim_evidence(claim_id,claimant_name,business_name,public_evidence) VALUES(cid,btrim(p_name),btrim(coalesce(p_business,'')),btrim(p_evidence));
 RETURN jsonb_build_object('id',cid,'status','pending','existing',false);
END $$;
CREATE FUNCTION rmg_private.own_status(p_kind text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := rmg_private.require_actor(); result jsonb;
BEGIN
 IF p_kind='review' THEN SELECT jsonb_build_object('id',r.id,'status',r.status) INTO result FROM public.reviews r WHERE r.id=p_id AND r.author_id=actor;
 ELSIF p_kind='claim' THEN SELECT jsonb_build_object('id',c.id,'status',c.status) INTO result FROM public.guide_claims c WHERE c.id=p_id AND c.claimant_id=actor;
 ELSE RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023'; END IF;
 IF result IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE='P0002'; END IF;
 RETURN result;
END $$;
CREATE FUNCTION rmg_private.edit_details(p_jurisdiction text,p_source_id text,p_boat text,p_gear text,p_years smallint,p_expertise text,p_species text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor();gid uuid;
BEGIN
 IF p_boat IS NULL OR length(p_boat)>250 OR p_gear IS NULL OR length(p_gear)>500 OR (p_years IS NOT NULL AND p_years NOT BETWEEN 0 AND 80) OR p_expertise IS NULL OR length(p_expertise)>500 OR p_species IS NULL OR length(p_species)>350 THEN RAISE EXCEPTION 'Invalid profile details' USING ERRCODE='22023'; END IF;
 gid:=rmg_private.resolve_guide(p_jurisdiction,p_source_id);
 PERFORM 1 FROM public.guides WHERE id=gid FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.guide_claims WHERE guide_id=gid AND claimant_id=actor AND status='approved') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 INSERT INTO public.guide_details(guide_id,boat,gear,years_experience,expertise,targeted_species,updated_at) VALUES(gid,btrim(p_boat),btrim(p_gear),p_years,btrim(p_expertise),btrim(p_species),now()) ON CONFLICT(guide_id) DO UPDATE SET boat=excluded.boat,gear=excluded.gear,years_experience=excluded.years_experience,expertise=excluded.expertise,targeted_species=excluded.targeted_species,updated_at=excluded.updated_at;
 INSERT INTO rmg_private.profile_declarations(guide_id,declared_by,updated_at) VALUES(gid,actor,now()) ON CONFLICT(guide_id) DO UPDATE SET declared_by=excluded.declared_by,updated_at=excluded.updated_at;
 RETURN jsonb_build_object('status','saved');
END $$;
CREATE FUNCTION rmg_private.profile_details(p_jurisdiction text,p_source_id text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE gid uuid:=rmg_private.resolve_guide(p_jurisdiction,p_source_id); result jsonb;
BEGIN
 SELECT jsonb_build_object('boat',d.boat,'gear',d.gear,'years_experience',d.years_experience,'expertise',d.expertise,'targeted_species',d.targeted_species,'updated_at',d.updated_at) INTO result
 FROM public.guide_details d JOIN rmg_private.profile_declarations p ON p.guide_id=d.guide_id
 WHERE d.guide_id=gid AND EXISTS(SELECT 1 FROM public.guide_claims c WHERE c.guide_id=gid AND c.claimant_id=p.declared_by AND c.status='approved');
 RETURN result;
END $$;
-- Public wrappers are invokers; narrow private functions independently check authorization.
CREATE FUNCTION public.rmg_resolve_guide(p_jurisdiction text,p_source_id text) RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT rmg_private.resolve_guide($1,$2)$$;
CREATE FUNCTION public.rmg_profile_details(p_jurisdiction text,p_source_id text) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT rmg_private.profile_details($1,$2)$$;
CREATE FUNCTION public.rmg_review_summary(p_jurisdiction text,p_source_id text) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('count',count(*),'averageQuality',round(avg(quality)::numeric,2),'wouldBookAgainPercent',round(100.0*avg(would_book_again::int),2),'wouldBookAgainResponses',count(would_book_again))
 FROM public.public_angler_reviews WHERE guide_id=rmg_private.resolve_guide($1,$2)
$$;
CREATE FUNCTION public.rmg_submit_review(p_jurisdiction text,p_source_id text,p_quality smallint,p_intensity smallint,p_rebook boolean,p_body text,p_firsthand boolean,p_relationship text,p_trip_responses jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT rmg_private.submit_review($1,$2,$3,$4,$5,$6,$7,$8,$9)$$;
CREATE FUNCTION public.rmg_submit_claim(p_jurisdiction text,p_source_id text,p_name text,p_business text,p_evidence text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT rmg_private.submit_claim($1,$2,$3,$4,$5)$$;
CREATE FUNCTION public.rmg_own_status(p_kind text,p_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT rmg_private.own_status($1,$2)$$;
CREATE FUNCTION public.rmg_edit_details(p_jurisdiction text,p_source_id text,p_boat text,p_gear text,p_years smallint,p_expertise text,p_species text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT rmg_private.edit_details($1,$2,$3,$4,$5,$6,$7)$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA rmg_private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION rmg_private.resolve_guide(text,text),rmg_private.profile_details(text,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION rmg_private.submit_review(text,text,smallint,smallint,boolean,text,boolean,text,jsonb),rmg_private.submit_claim(text,text,text,text,text),rmg_private.own_status(text,uuid),rmg_private.edit_details(text,text,text,text,smallint,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.rmg_resolve_guide(text,text),public.rmg_profile_details(text,text),public.rmg_review_summary(text,text),public.rmg_submit_review(text,text,smallint,smallint,boolean,text,boolean,text,jsonb),public.rmg_submit_claim(text,text,text,text,text),public.rmg_own_status(text,uuid),public.rmg_edit_details(text,text,text,text,smallint,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rmg_resolve_guide(text,text),public.rmg_profile_details(text,text),public.rmg_review_summary(text,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rmg_submit_review(text,text,smallint,smallint,boolean,text,boolean,text,jsonb),public.rmg_submit_claim(text,text,text,text,text),public.rmg_own_status(text,uuid),public.rmg_edit_details(text,text,text,text,smallint,text,text) TO authenticated;
-- The hardened legacy decision functions remain unavailable as direct RPCs.
-- The checked, invoker-facing receipt wrapper is added by 04-review-revisions.
COMMIT;
