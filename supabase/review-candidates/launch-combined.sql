-- REVIEW CANDIDATE ONLY: generated from 01, 02, 04 and 05.
-- 03 targets storage.objects and is intentionally excluded.
BEGIN;

-- Source: 01-authorization-lockdown.sql
-- REVIEW CANDIDATE ONLY: apply exclusively to disposable local test databases.
-- No automatic migration, no production authorization, no customer write enablement.
-- Table and column grants are separate in Postgres. Remove both, including any
-- explicit column grants, for the captured customer-write surfaces.
DO $$
DECLARE obj regclass; col record; role_name text; op text;
BEGIN
 FOREACH obj IN ARRAY ARRAY[to_regclass('public.reviews'),to_regclass('public.guide_claims'),to_regclass('public.claim_evidence'),to_regclass('public.guide_details'),to_regclass('public.guide_media'),to_regclass('public.guides'),to_regclass('public.site_admins'),to_regclass('public.moderation_audit')] LOOP
  IF obj IS NULL THEN CONTINUE; END IF;
  FOREACH role_name IN ARRAY ARRAY['PUBLIC','anon','authenticated'] LOOP
   EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE %s FROM %s',obj,CASE WHEN role_name='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(role_name) END);
   FOR col IN SELECT attname FROM pg_catalog.pg_attribute WHERE attrelid=obj AND attnum>0 AND NOT attisdropped LOOP
    FOREACH op IN ARRAY ARRAY['INSERT','UPDATE','REFERENCES'] LOOP
     EXECUTE format('REVOKE %s (%I) ON TABLE %s FROM %s',op,col.attname,obj,CASE WHEN role_name='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(role_name) END);
    END LOOP;
   END LOOP;
  END LOOP;
 END LOOP;
END $$;
-- Default off also covers the two privileged moderation RPCs and internal
-- trigger/rating functions. The latter remain usable by their owner/triggers.
REVOKE ALL ON FUNCTION public.admin_decide_review(uuid,boolean,text), public.admin_decide_claim(uuid,boolean,text), public.refresh_guide_rating(uuid), public.reviews_rating_trigger(), public.throttle_review_submission() FROM PUBLIC, anon, authenticated;

-- Invoker views require only columns used by the view/predicate; do not grant
-- author_id or other private review columns. RLS still filters base rows.
REVOKE SELECT ON public.reviews FROM PUBLIC,anon,authenticated;
DO $$DECLARE col record; role_name text; BEGIN
 FOR col IN SELECT attname FROM pg_catalog.pg_attribute WHERE attrelid='public.reviews'::regclass AND attnum>0 AND NOT attisdropped LOOP
  FOREACH role_name IN ARRAY ARRAY['PUBLIC','anon','authenticated'] LOOP
   EXECUTE format('REVOKE SELECT (%I) ON public.reviews FROM %s',col.attname,CASE WHEN role_name='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(role_name) END);
  END LOOP;
 END LOOP;
END $$;
GRANT SELECT (id,guide_id,quality,intensity,would_book_again,catch_outcome,body,trip_month,published_at,communication,professionalism,safety,equipment,knowledge,effort,value_rating,trip_context,status) ON public.reviews TO anon,authenticated;
GRANT SELECT (created_at) ON public.reviews TO authenticated;
-- Administrator queues must not double as claimant-accessible views.
CREATE OR REPLACE VIEW public.admin_pending_reviews WITH (security_invoker=true) AS
 SELECT r.id,r.guide_id,g.full_name AS guide_name,r.body,r.quality,r.safety,r.communication,r.professionalism,r.created_at,r.trip_month
 FROM public.reviews r JOIN public.guides g ON g.id=r.guide_id
 WHERE r.status='pending' AND public.is_site_admin();
CREATE OR REPLACE VIEW public.admin_pending_claims WITH (security_invoker=true) AS
 SELECT c.id,c.guide_id,g.full_name AS guide_name,c.claimant_id,c.created_at,e.claimant_name,e.business_name,e.public_evidence
 FROM public.guide_claims c JOIN public.guides g ON g.id=c.guide_id LEFT JOIN public.claim_evidence e ON e.claim_id=c.id
 WHERE c.status='pending' AND public.is_site_admin();
REVOKE ALL ON public.admin_pending_reviews,public.admin_pending_claims FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.admin_pending_reviews,public.admin_pending_claims TO authenticated;
-- Existing public policy covers published guides; admins may also see draft
-- targets in their queue, through RLS, without exposing them to customers.
CREATE POLICY admin_read_guides_for_queue ON public.guides FOR SELECT TO authenticated USING ((SELECT public.is_site_admin()));

CREATE OR REPLACE FUNCTION public.admin_decide_review(p_id uuid,p_approve boolean,p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); target public.reviews%ROWTYPE;
BEGIN
 IF actor IS NULL OR NOT public.is_site_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=actor AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous,false) AND u.deleted_at IS NULL) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF NOT COALESCE((SELECT enabled FROM rmg_private.launch_control WHERE singleton),false) THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='P5030'; END IF;
 IF p_approve IS NULL THEN RAISE EXCEPTION 'Decision required'; END IF;
 IF length(coalesce(p_reason,''))>500 THEN RAISE EXCEPTION 'Invalid reason'; END IF;
 IF p_approve AND length(btrim(coalesce(p_reason,''))) < 20 THEN RAISE EXCEPTION 'Record manual review evidence'; END IF;
 SELECT * INTO target FROM public.reviews WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
 IF target.status <> 'pending' THEN RAISE EXCEPTION 'Only pending reviews can be decided'; END IF;
 IF p_approve AND target.author_id=actor THEN RAISE EXCEPTION 'Cannot approve your own submission'; END IF;
 PERFORM 1 FROM public.guides WHERE id=target.guide_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
 IF EXISTS(SELECT 1 FROM public.guide_claims c WHERE c.guide_id=target.guide_id AND c.claimant_id=actor AND c.status='approved') THEN
  RAISE EXCEPTION 'Guide owners cannot moderate their own guide';
 END IF;
 UPDATE public.reviews SET status=CASE WHEN p_approve THEN 'published' ELSE 'rejected' END,published_at=CASE WHEN p_approve THEN now() ELSE NULL END WHERE id=p_id;
 INSERT INTO public.moderation_audit(actor_id,target_type,target_id,old_status,new_status,reason) VALUES(actor,'review',p_id,target.status,CASE WHEN p_approve THEN 'published' ELSE 'rejected' END,left(p_reason,500));
END $$;
CREATE OR REPLACE FUNCTION public.admin_decide_claim(p_id uuid,p_approve boolean,p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); gid uuid; target public.guide_claims%ROWTYPE;
BEGIN
 IF actor IS NULL OR NOT public.is_site_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=actor AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous,false) AND u.deleted_at IS NULL) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF NOT COALESCE((SELECT enabled FROM rmg_private.launch_control WHERE singleton),false) THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='P5030'; END IF;
 IF p_approve IS NULL THEN RAISE EXCEPTION 'Decision required'; END IF;
 IF length(coalesce(p_reason,''))>500 THEN RAISE EXCEPTION 'Invalid reason'; END IF;
 IF p_approve AND length(btrim(coalesce(p_reason,''))) < 20 THEN RAISE EXCEPTION 'Record manual ownership verification'; END IF;
 SELECT guide_id INTO gid FROM public.guide_claims WHERE id=p_id;
 IF gid IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
 -- Serialize all ownership decisions on one guide, then lock and recheck claim.
 PERFORM 1 FROM public.guides WHERE id=gid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
 SELECT * INTO target FROM public.guide_claims WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR target.guide_id IS DISTINCT FROM gid THEN RAISE EXCEPTION 'Claim target changed'; END IF;
 IF target.status <> 'pending' THEN RAISE EXCEPTION 'Only pending claims can be decided'; END IF;
 IF p_approve AND target.claimant_id=actor THEN RAISE EXCEPTION 'Cannot approve your own submission'; END IF;
 IF p_approve AND EXISTS(SELECT 1 FROM public.guide_claims WHERE guide_id=gid AND status='approved') THEN RAISE EXCEPTION 'A captain is already approved for this listing'; END IF;
 IF p_approve AND EXISTS(SELECT 1 FROM public.reviews WHERE guide_id=gid AND author_id=target.claimant_id AND status IN ('pending','published')) THEN RAISE EXCEPTION 'Resolve claimant review conflict before approval'; END IF;
 UPDATE public.guide_claims SET status=CASE WHEN p_approve THEN 'approved' ELSE 'denied' END WHERE id=p_id;
 INSERT INTO public.moderation_audit(actor_id,target_type,target_id,old_status,new_status,reason) VALUES(actor,'claim',p_id,target.status,CASE WHEN p_approve THEN 'approved' ELSE 'denied' END,left(p_reason,500));
END $$;
-- CREATE OR REPLACE retains ACLs, but explicitly fail closed even on drift.
REVOKE ALL ON FUNCTION public.admin_decide_review(uuid,boolean,text),public.admin_decide_claim(uuid,boolean,text) FROM PUBLIC,anon,authenticated;

-- Source: 02-launch-api.sql
-- LOCAL REVIEW CANDIDATE ONLY. Depends on 01-authorization-lockdown.sql.
-- Not a Supabase migration until generated and reviewed against a fresh hosted catalog.
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
 SELECT r.id,r.guide_id,g.full_name AS guide_name,r.body,r.quality,r.safety,r.communication,r.professionalism,r.created_at,r.trip_month,r.firsthand_attested,r.relationship_disclosure,r.trip_responses
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

-- Source: 04-review-revisions.sql
-- REVIEW CANDIDATE ONLY. No public review changes until an independent moderator approves.
CREATE TABLE rmg_private.review_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 review_id uuid NOT NULL REFERENCES public.reviews(id),
 submitter_id uuid NOT NULL REFERENCES auth.users(id),
 quality smallint NOT NULL CHECK (quality BETWEEN 1 AND 5),
 intensity smallint CHECK (intensity BETWEEN 1 AND 5),
 would_book_again boolean,
 body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 3000),
 relationship_disclosure text NOT NULL CHECK (relationship_disclosure IN ('none','personal','financial','other')),
 trip_responses jsonb CHECK (rmg_private.valid_trip_responses(trip_responses)),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(),
 decided_at timestamptz,
 decided_by uuid REFERENCES auth.users(id)
);
CREATE UNIQUE INDEX one_pending_revision_per_review ON rmg_private.review_revisions(review_id) WHERE status='pending';
ALTER TABLE rmg_private.review_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rmg_private.review_revisions FROM PUBLIC,anon,authenticated;

CREATE FUNCTION rmg_private.submit_revision(p_review_id uuid,p_quality smallint,p_intensity smallint,p_rebook boolean,p_body text,p_firsthand boolean,p_relationship text,p_trip_responses jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor(); gid uuid; original public.reviews%ROWTYPE; rid uuid;
BEGIN
 IF p_quality IS NULL OR p_quality NOT BETWEEN 1 AND 5 OR (p_intensity IS NOT NULL AND p_intensity NOT BETWEEN 1 AND 5) OR p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 1 AND 3000 OR p_firsthand IS DISTINCT FROM true OR p_relationship IS NULL OR p_relationship NOT IN ('none','personal','financial','other') OR NOT rmg_private.valid_trip_responses(p_trip_responses) THEN RAISE EXCEPTION 'Invalid review revision' USING ERRCODE='22023'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,84013));
 SELECT guide_id INTO gid FROM public.reviews WHERE id=p_review_id AND author_id=actor;
 IF gid IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE='P0002'; END IF;
 PERFORM 1 FROM public.guides WHERE id=gid FOR UPDATE;
 SELECT * INTO original FROM public.reviews WHERE id=p_review_id FOR UPDATE;
 IF NOT FOUND OR original.author_id<>actor OR original.guide_id<>gid OR original.status<>'published' THEN RAISE EXCEPTION 'Not found' USING ERRCODE='P0002'; END IF;
 IF EXISTS(SELECT 1 FROM public.guide_claims c WHERE c.guide_id=gid AND c.claimant_id=actor AND c.status='approved') THEN RAISE EXCEPTION 'Owner cannot revise own guide review' USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM rmg_private.review_revisions WHERE submitter_id=actor AND created_at>now()-interval '24 hours')>=3 THEN RAISE EXCEPTION 'Revision limit reached' USING ERRCODE='P4290'; END IF;
 INSERT INTO rmg_private.review_revisions(review_id,submitter_id,quality,intensity,would_book_again,body,relationship_disclosure,trip_responses) VALUES(p_review_id,actor,p_quality,p_intensity,p_rebook,btrim(p_body),p_relationship,p_trip_responses) RETURNING id INTO rid;
 RETURN jsonb_build_object('id',rid,'status','pending');
END $$;
CREATE OR REPLACE FUNCTION rmg_private.own_status(p_kind text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor();result jsonb;
BEGIN
 IF p_kind='review' THEN SELECT jsonb_build_object('id',r.id,'status',r.status) INTO result FROM public.reviews r WHERE r.id=p_id AND r.author_id=actor;
 ELSIF p_kind='claim' THEN SELECT jsonb_build_object('id',c.id,'status',c.status) INTO result FROM public.guide_claims c WHERE c.id=p_id AND c.claimant_id=actor;
 ELSIF p_kind='revision' THEN SELECT jsonb_build_object('id',v.id,'status',v.status) INTO result FROM rmg_private.review_revisions v WHERE v.id=p_id AND v.submitter_id=actor;
 ELSE RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023'; END IF;
 IF result IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE='P0002'; END IF;
 RETURN result;
END $$;
CREATE FUNCTION rmg_private.my_submissions(p_offset integer,p_limit integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor(); result jsonb;
BEGIN
 IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id),'[]'::jsonb) INTO result FROM (
  SELECT z.kind,z.id,z.status,z.created_at,z.review_id,m.jurisdiction,m.source_id FROM (
   SELECT 'review'::text kind,r.id,r.status,r.created_at,NULL::uuid review_id,r.guide_id FROM public.reviews r WHERE r.author_id=actor
   UNION ALL SELECT 'claim',c.id,c.status,c.created_at,NULL::uuid,c.guide_id FROM public.guide_claims c WHERE c.claimant_id=actor
   UNION ALL SELECT 'revision',v.id,v.status,v.created_at,v.review_id,r.guide_id FROM rmg_private.review_revisions v JOIN public.reviews r ON r.id=v.review_id WHERE v.submitter_id=actor
  ) z LEFT JOIN LATERAL (SELECT jurisdiction,source_id FROM rmg_private.guide_identity_map WHERE guide_id=z.guide_id ORDER BY jurisdiction,source_id LIMIT 1) m ON true
  ORDER BY z.created_at DESC,z.id OFFSET p_offset LIMIT p_limit
 ) q;
 RETURN result;
END $$;
CREATE FUNCTION rmg_private.revision_queue(p_offset integer,p_limit integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor();result jsonb;
BEGIN
 IF NOT public.is_site_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.created_at,q.id),'[]'::jsonb) INTO result FROM
  (SELECT v.id,v.review_id,g.full_name AS guide_name,m.jurisdiction,m.source_id,v.quality,v.intensity,v.would_book_again,v.body,v.relationship_disclosure,v.trip_responses,v.created_at FROM rmg_private.review_revisions v JOIN public.reviews r ON r.id=v.review_id JOIN public.guides g ON g.id=r.guide_id LEFT JOIN LATERAL (SELECT jurisdiction,source_id FROM rmg_private.guide_identity_map WHERE guide_id=g.id ORDER BY jurisdiction,source_id LIMIT 1) m ON true WHERE v.status='pending' ORDER BY v.created_at,v.id OFFSET p_offset LIMIT p_limit) q;
 RETURN result;
END $$;
CREATE FUNCTION rmg_private.decide_submission(p_kind text,p_id uuid,p_approve boolean,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor(); decision text;
BEGIN
 IF NOT public.is_site_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_kind='review' THEN
  PERFORM public.admin_decide_review(p_id,p_approve,p_reason);
  SELECT status INTO decision FROM public.reviews WHERE id=p_id;
 ELSIF p_kind='claim' THEN
  PERFORM public.admin_decide_claim(p_id,p_approve,p_reason);
  SELECT status INTO decision FROM public.guide_claims WHERE id=p_id;
 ELSE RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('id',p_id,'status',decision);
END $$;
CREATE FUNCTION rmg_private.decide_revision(p_id uuid,p_approve boolean,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor(); vid uuid; gid uuid; original public.reviews%ROWTYPE; proposal rmg_private.review_revisions%ROWTYPE;
BEGIN
 IF NOT public.is_site_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_approve IS NULL OR length(coalesce(p_reason,''))>500 OR (p_approve AND length(btrim(coalesce(p_reason,'')))<20) THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE='22023'; END IF;
 SELECT v.review_id,r.guide_id INTO vid,gid FROM rmg_private.review_revisions v JOIN public.reviews r ON r.id=v.review_id WHERE v.id=p_id;
 IF vid IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE='P0002'; END IF;
 PERFORM 1 FROM public.guides WHERE id=gid FOR UPDATE;
 SELECT * INTO original FROM public.reviews WHERE id=vid FOR UPDATE;
 SELECT * INTO proposal FROM rmg_private.review_revisions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR original.guide_id IS DISTINCT FROM gid OR proposal.review_id IS DISTINCT FROM vid OR original.status<>'published' OR proposal.status<>'pending' THEN RAISE EXCEPTION 'Revision unavailable' USING ERRCODE='P0001'; END IF;
 IF actor=proposal.submitter_id OR EXISTS(SELECT 1 FROM public.guide_claims WHERE guide_id=gid AND claimant_id=actor AND status='approved') THEN RAISE EXCEPTION 'Conflicting moderator' USING ERRCODE='42501'; END IF;
 IF p_approve THEN
  UPDATE public.reviews SET quality=proposal.quality,intensity=proposal.intensity,would_book_again=proposal.would_book_again,body=proposal.body,relationship_disclosure=proposal.relationship_disclosure,trip_responses=proposal.trip_responses WHERE id=vid;
 END IF;
 UPDATE rmg_private.review_revisions SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,decided_at=now(),decided_by=actor WHERE id=p_id;
 INSERT INTO public.moderation_audit(actor_id,target_type,target_id,old_status,new_status,reason) VALUES(actor,'review',vid,'published','published',left((CASE WHEN p_approve THEN 'approved revision ' ELSE 'rejected revision ' END)||p_id::text||'; '||coalesce(p_reason,''),500));
 RETURN jsonb_build_object('id',p_id,'status',CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END);
END $$;
CREATE FUNCTION public.rmg_submit_revision(p_review_id uuid,p_quality smallint,p_intensity smallint,p_rebook boolean,p_body text,p_firsthand boolean,p_relationship text,p_trip_responses jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT rmg_private.submit_revision($1,$2,$3,$4,$5,$6,$7,$8)$$;
CREATE FUNCTION public.rmg_revision_queue(p_offset integer,p_limit integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT rmg_private.revision_queue($1,$2)$$;
CREATE FUNCTION public.rmg_decide_revision(p_id uuid,p_approve boolean,p_reason text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT rmg_private.decide_revision($1,$2,$3)$$;
CREATE FUNCTION public.rmg_my_submissions(p_offset integer,p_limit integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT rmg_private.my_submissions($1,$2)$$;
CREATE FUNCTION public.rmg_decide_submission(p_kind text,p_id uuid,p_approve boolean,p_reason text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT rmg_private.decide_submission($1,$2,$3,$4)$$;
REVOKE ALL ON FUNCTION rmg_private.submit_revision(uuid,smallint,smallint,boolean,text,boolean,text,jsonb),rmg_private.revision_queue(integer,integer),rmg_private.decide_revision(uuid,boolean,text),rmg_private.my_submissions(integer,integer),rmg_private.decide_submission(text,uuid,boolean,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.rmg_submit_revision(uuid,smallint,smallint,boolean,text,boolean,text,jsonb),public.rmg_revision_queue(integer,integer),public.rmg_decide_revision(uuid,boolean,text),public.rmg_my_submissions(integer,integer),public.rmg_decide_submission(text,uuid,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION rmg_private.submit_revision(uuid,smallint,smallint,boolean,text,boolean,text,jsonb),rmg_private.revision_queue(integer,integer),rmg_private.decide_revision(uuid,boolean,text),rmg_private.my_submissions(integer,integer),rmg_private.decide_submission(text,uuid,boolean,text),public.rmg_submit_revision(uuid,smallint,smallint,boolean,text,boolean,text,jsonb),public.rmg_revision_queue(integer,integer),public.rmg_decide_revision(uuid,boolean,text),public.rmg_my_submissions(integer,integer),public.rmg_decide_submission(text,uuid,boolean,text) TO authenticated;

-- Source: 05-storage-via-claim-visibility.sql
-- ALTERNATIVE REVIEW CANDIDATE ONLY; do not apply together with unreviewed SQL.
-- Hosted storage.objects is owned by a role unavailable to the postgres MCP
-- account. The existing guide-photos INSERT/DELETE policies join guide_claims
-- as the caller. Restrict direct approved-claim visibility so those existing
-- permissive policies cannot match. Owner status and profile changes use the
-- separately authorized SECURITY DEFINER RPCs, not direct claim-table reads.
-- This depends on the *current* storage policy definitions remaining unchanged.
CREATE POLICY rmg_launch_no_direct_approved_claims ON public.guide_claims AS RESTRICTIVE
 FOR SELECT TO authenticated USING (status <> 'approved');

COMMIT;
