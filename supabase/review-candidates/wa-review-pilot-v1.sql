-- Additive pilot after the reviewed Oregon split. No identity or evidence is seeded.
DO $$
BEGIN
 IF to_regclass('rmg_private.claim_control_v1') IS NULL
    OR to_regprocedure('rmg_private.has_oregon_review_guide_v1(uuid)') IS NULL THEN
  RAISE EXCEPTION 'Reviewed Oregon split required' USING ERRCODE='P5030';
 END IF;
END $$;

CREATE TABLE rmg_private.wa_review_pilot_v1 (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 enabled boolean NOT NULL DEFAULT false,
 -- 163 is the last position in the pinned historical raw input, including unallocated slots.
 source_id text CHECK (source_id IS NULL OR CASE
  WHEN source_id ~ '^wa-([0-9]{3}|[1-9][0-9]{3,8})$' THEN substring(source_id FROM 4)::integer > 163
  ELSE false END),
 guide_id uuid REFERENCES public.guides(id),
 packet_sha256 text CHECK (packet_sha256 ~ '^[0-9a-f]{64}$'),
 CHECK ((source_id IS NULL AND guide_id IS NULL AND packet_sha256 IS NULL AND NOT enabled)
     OR (source_id IS NOT NULL AND guide_id IS NOT NULL AND packet_sha256 IS NOT NULL))
);
ALTER TABLE rmg_private.wa_review_pilot_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rmg_private.wa_review_pilot_v1 FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO rmg_private.wa_review_pilot_v1 DEFAULT VALUES;

-- Both stored identifiers must match the reviewed mapping. The pilot is WA-only.
CREATE FUNCTION rmg_private.wa_review_target_v1(p_source_id text, p_guide_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p.guide_id
 FROM rmg_private.wa_review_pilot_v1 p
 JOIN rmg_private.guide_identity_map m ON m.jurisdiction='WA' AND m.source_id=p.source_id AND m.guide_id=p.guide_id
  AND m.review_reference='wa-pilot-sha256:'||p.packet_sha256
 JOIN public.guides g ON g.id=p.guide_id AND g.slug=p.source_id
 WHERE p.singleton AND p.enabled AND g.listing_status='published'
   AND COALESCE((SELECT enabled FROM rmg_private.launch_control WHERE singleton),false)
   AND (p_source_id IS NOT NULL OR p_guide_id IS NOT NULL)
   AND (p_source_id IS NULL OR p.source_id=p_source_id)
   AND (p_guide_id IS NULL OR p.guide_id=p_guide_id)
   AND NOT EXISTS (SELECT 1 FROM rmg_private.guide_identity_map o WHERE o.jurisdiction='OR' AND o.guide_id=p.guide_id)
$$;

CREATE FUNCTION rmg_private.review_target_for_write_v1(p_jurisdiction text, p_source_id text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE gid uuid;
BEGIN
 IF p_jurisdiction='OR' THEN
  RETURN rmg_private.resolve_guide(p_jurisdiction,p_source_id);
 END IF;
 IF p_jurisdiction IS DISTINCT FROM 'WA' OR p_source_id IS NULL THEN
  RAISE EXCEPTION 'Review identity unavailable' USING ERRCODE='P5030';
 END IF;
 PERFORM 1 FROM rmg_private.wa_review_pilot_v1 WHERE singleton FOR SHARE;
 gid:=rmg_private.wa_review_target_v1(p_source_id,NULL);
 IF gid IS NULL THEN RAISE EXCEPTION 'Washington review pilot unavailable' USING ERRCODE='P5030'; END IF;
 RETURN gid;
END $$;

CREATE FUNCTION rmg_private.lock_review_guide_v1(p_guide_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF rmg_private.has_oregon_review_guide_v1(p_guide_id) THEN RETURN; END IF;
 PERFORM 1 FROM rmg_private.wa_review_pilot_v1 WHERE singleton FOR SHARE;
 IF rmg_private.wa_review_target_v1(NULL,p_guide_id) IS NULL THEN
  RAISE EXCEPTION 'Review identity unavailable' USING ERRCODE='P5030';
 END IF;
END $$;

REVOKE ALL ON FUNCTION rmg_private.wa_review_target_v1(text,uuid),
 rmg_private.review_target_for_write_v1(text,text), rmg_private.lock_review_guide_v1(uuid)
 FROM PUBLIC, anon, authenticated, service_role;

-- The functions below retain the Oregon split's lifecycle and ACLs.
CREATE OR REPLACE FUNCTION rmg_private.review_queue_eligible_v1(p_guide_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN public.is_site_admin() AND EXISTS (
  SELECT 1 FROM auth.users u WHERE u.id=auth.uid()
   AND u.email_confirmed_at IS NOT NULL AND NOT COALESCE(u.is_anonymous,false)
   AND u.deleted_at IS NULL
 ) AND COALESCE((SELECT enabled FROM rmg_private.launch_control WHERE singleton),false)
 THEN (rmg_private.has_oregon_review_guide_v1($1) OR rmg_private.wa_review_target_v1(NULL,$1) IS NOT NULL)
 ELSE false END
$$;

CREATE OR REPLACE FUNCTION public.admin_decide_review(p_id uuid,p_approve boolean,p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); gid uuid; target public.reviews%ROWTYPE;
BEGIN
 IF actor IS NULL OR NOT public.is_site_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=actor AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous,false) AND u.deleted_at IS NULL) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 PERFORM rmg_private.lock_launch_for_write_v1();
 IF p_approve IS NULL THEN RAISE EXCEPTION 'Decision required'; END IF;
 IF length(coalesce(p_reason,''))>500 THEN RAISE EXCEPTION 'Invalid reason'; END IF;
 IF p_approve AND length(btrim(coalesce(p_reason,''))) < 20 THEN RAISE EXCEPTION 'Record manual review evidence'; END IF;
 SELECT guide_id INTO gid FROM public.reviews WHERE id=p_id;
 IF gid IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
 PERFORM rmg_private.lock_review_guide_v1(gid);
 SELECT * INTO target FROM public.reviews WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR target.guide_id IS DISTINCT FROM gid THEN RAISE EXCEPTION 'Not found'; END IF;
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

CREATE OR REPLACE FUNCTION rmg_private.submit_claim(p_jurisdiction text,p_source_id text,p_name text,p_business text,p_evidence text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := rmg_private.require_actor(); gid uuid; cid uuid;
BEGIN
 PERFORM rmg_private.lock_launch_for_write_v1();
 PERFORM rmg_private.lock_claims_for_write_v1();
 IF p_jurisdiction IS DISTINCT FROM 'OR' THEN RAISE EXCEPTION 'Oregon claims only' USING ERRCODE='P5030'; END IF;
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

CREATE OR REPLACE FUNCTION rmg_private.edit_details(p_jurisdiction text,p_source_id text,p_boat text,p_gear text,p_years smallint,p_expertise text,p_species text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor();gid uuid;
BEGIN
 PERFORM rmg_private.lock_launch_for_write_v1();
 PERFORM rmg_private.lock_claims_for_write_v1();
 IF p_jurisdiction IS DISTINCT FROM 'OR' THEN RAISE EXCEPTION 'Oregon claims only' USING ERRCODE='P5030'; END IF;
 IF p_boat IS NULL OR length(p_boat)>250 OR p_gear IS NULL OR length(p_gear)>500 OR (p_years IS NOT NULL AND p_years NOT BETWEEN 0 AND 80) OR p_expertise IS NULL OR length(p_expertise)>500 OR p_species IS NULL OR length(p_species)>350 THEN RAISE EXCEPTION 'Invalid profile details' USING ERRCODE='22023'; END IF;
 gid:=rmg_private.resolve_guide(p_jurisdiction,p_source_id);
 PERFORM 1 FROM public.guides WHERE id=gid FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.guide_claims WHERE guide_id=gid AND claimant_id=actor AND status='approved') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 INSERT INTO public.guide_details(guide_id,boat,gear,years_experience,expertise,targeted_species,updated_at) VALUES(gid,btrim(p_boat),btrim(p_gear),p_years,btrim(p_expertise),btrim(p_species),now()) ON CONFLICT(guide_id) DO UPDATE SET boat=excluded.boat,gear=excluded.gear,years_experience=excluded.years_experience,expertise=excluded.expertise,targeted_species=excluded.targeted_species,updated_at=excluded.updated_at;
 INSERT INTO rmg_private.profile_declarations(guide_id,declared_by,updated_at) VALUES(gid,actor,now()) ON CONFLICT(guide_id) DO UPDATE SET declared_by=excluded.declared_by,updated_at=excluded.updated_at;
 RETURN jsonb_build_object('status','saved');
END $$;

CREATE OR REPLACE FUNCTION rmg_private.submit_review(p_jurisdiction text,p_source_id text,p_quality smallint,p_intensity smallint,p_rebook boolean,p_body text,p_firsthand boolean,p_relationship text,p_trip_responses jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := rmg_private.require_actor(); gid uuid; rid uuid;
BEGIN
 PERFORM rmg_private.lock_launch_for_write_v1();
 IF p_quality IS NULL OR p_quality NOT BETWEEN 1 AND 5 OR (p_intensity IS NOT NULL AND p_intensity NOT BETWEEN 1 AND 5) OR p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 1 AND 3000 OR p_firsthand IS DISTINCT FROM true OR p_relationship IS NULL OR p_relationship NOT IN ('none','personal','financial','other') OR NOT rmg_private.valid_trip_responses(p_trip_responses) THEN RAISE EXCEPTION 'Invalid review' USING ERRCODE='22023'; END IF;
 gid:=rmg_private.review_target_for_write_v1(p_jurisdiction,p_source_id);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,84011));
 PERFORM 1 FROM public.guides WHERE id=gid FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.guide_claims c WHERE c.guide_id=gid AND c.claimant_id=actor AND c.status='approved') THEN RAISE EXCEPTION 'Owner cannot review own guide' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.reviews r WHERE r.guide_id=gid AND r.author_id=actor) THEN RAISE EXCEPTION 'Review already exists' USING ERRCODE='P4091'; END IF;
 IF (SELECT count(*) FROM public.reviews r WHERE r.author_id=actor AND r.created_at>now()-interval '24 hours')>=3 THEN RAISE EXCEPTION 'Review limit reached' USING ERRCODE='P4290'; END IF;
 INSERT INTO public.reviews(guide_id,author_id,quality,intensity,would_book_again,body,firsthand_attested,relationship_disclosure,trip_responses,status,published_at) VALUES(gid,actor,p_quality,p_intensity,p_rebook,btrim(p_body),true,p_relationship,p_trip_responses,'pending',NULL) RETURNING id INTO rid;
 RETURN jsonb_build_object('id',rid,'status','pending');
END $$;

CREATE OR REPLACE FUNCTION rmg_private.report_review(p_jurisdiction text,p_source_id text,p_review_id uuid,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor(); gid uuid; fid uuid;
BEGIN
 PERFORM rmg_private.lock_launch_for_write_v1();
 IF p_review_id IS NULL OR p_reason IS NULL OR p_reason NOT IN ('not_firsthand','harassment_or_private_info','other') THEN RAISE EXCEPTION 'Invalid report' USING ERRCODE='22023'; END IF;
 gid:=rmg_private.review_target_for_write_v1(p_jurisdiction,p_source_id);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,84014));
 PERFORM 1 FROM public.guides WHERE id=gid FOR UPDATE;
 PERFORM 1 FROM public.reviews WHERE id=p_review_id AND guide_id=gid AND status='published' AND published_at IS NOT NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE='P0002'; END IF;
 SELECT id INTO fid FROM public.review_flags WHERE review_id=p_review_id AND reporter_id=actor;
 IF fid IS NOT NULL THEN RETURN jsonb_build_object('id',fid,'status','submitted','existing',true); END IF;
 IF (SELECT count(*) FROM public.review_flags WHERE reporter_id=actor AND created_at>now()-interval '24 hours')>=10 THEN RAISE EXCEPTION 'Report limit reached' USING ERRCODE='P4290'; END IF;
 INSERT INTO public.review_flags(review_id,reporter_id,reason) VALUES(p_review_id,actor,p_reason) RETURNING id INTO fid;
 RETURN jsonb_build_object('id',fid,'status','submitted','existing',false);
END $$;

CREATE OR REPLACE FUNCTION rmg_private.submit_revision(p_review_id uuid,p_quality smallint,p_intensity smallint,p_rebook boolean,p_body text,p_firsthand boolean,p_relationship text,p_trip_responses jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor(); gid uuid; original public.reviews%ROWTYPE; rid uuid;
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
 INSERT INTO rmg_private.review_revisions(review_id,submitter_id,quality,intensity,would_book_again,body,relationship_disclosure,trip_responses) VALUES(p_review_id,actor,p_quality,p_intensity,p_rebook,btrim(p_body),p_relationship,p_trip_responses) RETURNING id INTO rid;
 RETURN jsonb_build_object('id',rid,'status','pending');
END $$;

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
  UPDATE public.reviews SET quality=proposal.quality,intensity=proposal.intensity,would_book_again=proposal.would_book_again,body=proposal.body,relationship_disclosure=proposal.relationship_disclosure,trip_responses=proposal.trip_responses,trip_month=CASE WHEN proposal.trip_month_specified THEN proposal.trip_month ELSE original.trip_month END WHERE id=vid;
 END IF;
 UPDATE rmg_private.review_revisions SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,decided_at=now(),decided_by=actor WHERE id=p_id;
 INSERT INTO public.moderation_audit(actor_id,target_type,target_id,old_status,new_status,reason) VALUES(actor,'review',vid,'published','published',left((CASE WHEN p_approve THEN 'approved revision ' ELSE 'rejected revision ' END)||p_id::text||'; '||coalesce(p_reason,''),500));
 RETURN jsonb_build_object('id',p_id,'status',CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END);
END $$;

CREATE OR REPLACE FUNCTION rmg_private.resolve_report(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor(); rid uuid; gid uuid; report public.review_flags%ROWTYPE; review public.reviews%ROWTYPE;
BEGIN
 PERFORM rmg_private.lock_launch_for_write_v1();
 IF NOT public.is_site_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT f.review_id,r.guide_id INTO rid,gid FROM public.review_flags f JOIN public.reviews r ON r.id=f.review_id WHERE f.id=p_id;
 IF rid IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE='P0002'; END IF;
 PERFORM rmg_private.lock_review_guide_v1(gid);
 PERFORM 1 FROM public.guides WHERE id=gid FOR UPDATE;
 SELECT * INTO review FROM public.reviews WHERE id=rid FOR UPDATE;
 SELECT * INTO report FROM public.review_flags WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR review.guide_id IS DISTINCT FROM gid OR report.review_id IS DISTINCT FROM rid OR report.status<>'pending' THEN RAISE EXCEPTION 'Report unavailable' USING ERRCODE='P0001'; END IF;
 IF actor=report.reporter_id OR actor=review.author_id OR EXISTS(SELECT 1 FROM public.guide_claims WHERE guide_id=gid AND claimant_id=actor AND status='approved') THEN RAISE EXCEPTION 'Conflicting moderator' USING ERRCODE='42501'; END IF;
 UPDATE public.review_flags SET status='resolved',resolved_at=now(),resolved_by=actor WHERE id=p_id;
 INSERT INTO public.moderation_audit(actor_id,target_type,target_id,old_status,new_status,reason) VALUES(actor,'review',rid,review.status,review.status,'resolved report '||p_id::text);
 RETURN jsonb_build_object('id',p_id,'status','resolved');
END $$;

CREATE OR REPLACE FUNCTION rmg_private.review_write_availability(p_jurisdiction text,p_source_id text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE gid uuid; available boolean;
BEGIN
 IF p_jurisdiction='OR' THEN
  gid:=rmg_private.resolve_guide(p_jurisdiction,p_source_id);
 ELSIF p_jurisdiction='WA' AND p_source_id IS NOT NULL THEN
  gid:=rmg_private.wa_review_target_v1(p_source_id,NULL);
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

CREATE OR REPLACE FUNCTION rmg_private.revision_queue(p_offset integer,p_limit integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor();result jsonb;
BEGIN
 IF NOT public.is_site_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.created_at,q.id),'[]'::jsonb) INTO result FROM
  (SELECT v.id,v.review_id,g.full_name AS guide_name,m.jurisdiction,m.source_id,v.quality,v.intensity,v.would_book_again,v.body,v.relationship_disclosure,v.trip_responses,v.trip_month,v.trip_month_specified,v.created_at FROM rmg_private.review_revisions v JOIN public.reviews r ON r.id=v.review_id JOIN public.guides g ON g.id=r.guide_id JOIN rmg_private.guide_identity_map m ON m.guide_id=g.id AND (m.jurisdiction='OR' OR
    (m.jurisdiction='WA' AND rmg_private.wa_review_target_v1(m.source_id,g.id) IS NOT NULL)) WHERE v.status='pending' AND g.listing_status='published' ORDER BY v.created_at,v.id OFFSET p_offset LIMIT p_limit) q;
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
  JOIN rmg_private.guide_identity_map m ON m.guide_id=g.id AND (m.jurisdiction='OR' OR
    (m.jurisdiction='WA' AND rmg_private.wa_review_target_v1(m.source_id,g.id) IS NOT NULL))
  WHERE f.status='pending' AND g.listing_status='published' ORDER BY f.created_at,f.id OFFSET p_offset LIMIT p_limit
 ) q;
 RETURN result;
END $$;
