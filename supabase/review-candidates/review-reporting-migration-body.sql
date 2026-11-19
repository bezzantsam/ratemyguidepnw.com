-- REVIEW CANDIDATE ONLY. Apply after the v2.4 launch migration in one transaction.
-- Reuses review_flags; reporting never modifies a review or its rating.
ALTER TABLE public.review_flags
 ADD COLUMN status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved')),
 ADD COLUMN resolved_at timestamptz,
 ADD COLUMN resolved_by uuid REFERENCES auth.users(id);
ALTER TABLE public.review_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.review_flags FROM PUBLIC,anon,authenticated;
CREATE INDEX rmg_review_flags_reporter_time ON public.review_flags(reporter_id,created_at DESC);
CREATE INDEX rmg_review_flags_pending_queue ON public.review_flags(created_at,id) WHERE status='pending';

CREATE FUNCTION rmg_private.report_review(p_jurisdiction text,p_source_id text,p_review_id uuid,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor(); gid uuid; fid uuid;
BEGIN
 IF p_review_id IS NULL OR p_reason IS NULL OR p_reason NOT IN ('not_firsthand','harassment_or_private_info','other') THEN RAISE EXCEPTION 'Invalid report' USING ERRCODE='22023'; END IF;
 gid:=rmg_private.resolve_guide(p_jurisdiction,p_source_id);
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

CREATE FUNCTION rmg_private.report_queue(p_offset integer,p_limit integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor(); result jsonb;
BEGIN
 IF NOT public.is_site_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.created_at,q.id),'[]'::jsonb) INTO result FROM (
  SELECT f.id,f.review_id,f.reason,f.created_at,r.status AS review_status,
   CASE WHEN r.status='published' AND r.published_at IS NOT NULL THEN r.body ELSE NULL END AS public_review_body,
   g.full_name AS guide_name,m.jurisdiction,m.source_id
  FROM public.review_flags f JOIN public.reviews r ON r.id=f.review_id JOIN public.guides g ON g.id=r.guide_id
  LEFT JOIN LATERAL (SELECT jurisdiction,source_id FROM rmg_private.guide_identity_map WHERE guide_id=g.id ORDER BY jurisdiction,source_id LIMIT 1) m ON true
  WHERE f.status='pending' ORDER BY f.created_at,f.id OFFSET p_offset LIMIT p_limit
 ) q;
 RETURN result;
END $$;

CREATE FUNCTION rmg_private.resolve_report(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor(); rid uuid; gid uuid; report public.review_flags%ROWTYPE; review public.reviews%ROWTYPE;
BEGIN
 IF NOT public.is_site_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT f.review_id,r.guide_id INTO rid,gid FROM public.review_flags f JOIN public.reviews r ON r.id=f.review_id WHERE f.id=p_id;
 IF rid IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE='P0002'; END IF;
 PERFORM 1 FROM public.guides WHERE id=gid FOR UPDATE;
 SELECT * INTO review FROM public.reviews WHERE id=rid FOR UPDATE;
 SELECT * INTO report FROM public.review_flags WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR review.guide_id IS DISTINCT FROM gid OR report.review_id IS DISTINCT FROM rid OR report.status<>'pending' THEN RAISE EXCEPTION 'Report unavailable' USING ERRCODE='P0001'; END IF;
 IF actor=report.reporter_id OR actor=review.author_id OR EXISTS(SELECT 1 FROM public.guide_claims WHERE guide_id=gid AND claimant_id=actor AND status='approved') THEN RAISE EXCEPTION 'Conflicting moderator' USING ERRCODE='42501'; END IF;
 UPDATE public.review_flags SET status='resolved',resolved_at=now(),resolved_by=actor WHERE id=p_id;
 INSERT INTO public.moderation_audit(actor_id,target_type,target_id,old_status,new_status,reason) VALUES(actor,'review',rid,review.status,review.status,'resolved report '||p_id::text);
 RETURN jsonb_build_object('id',p_id,'status','resolved');
END $$;

CREATE FUNCTION public.rmg_report_review(p_jurisdiction text,p_source_id text,p_review_id uuid,p_reason text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT rmg_private.report_review($1,$2,$3,$4)$$;
CREATE FUNCTION public.rmg_report_queue(p_offset integer,p_limit integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT rmg_private.report_queue($1,$2)$$;
CREATE FUNCTION public.rmg_resolve_report(p_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT rmg_private.resolve_report($1)$$;
REVOKE ALL ON FUNCTION rmg_private.report_review(text,text,uuid,text),rmg_private.report_queue(integer,integer),rmg_private.resolve_report(uuid),public.rmg_report_review(text,text,uuid,text),public.rmg_report_queue(integer,integer),public.rmg_resolve_report(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION rmg_private.report_review(text,text,uuid,text),rmg_private.report_queue(integer,integer),rmg_private.resolve_report(uuid),public.rmg_report_review(text,text,uuid,text),public.rmg_report_queue(integer,integer),public.rmg_resolve_report(uuid) TO authenticated;

-- Preserve v2.4 behavior and distinguish only a confirmed actor/guide duplicate.
CREATE OR REPLACE FUNCTION rmg_private.submit_review(p_jurisdiction text,p_source_id text,p_quality smallint,p_intensity smallint,p_rebook boolean,p_body text,p_firsthand boolean,p_relationship text,p_trip_responses jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := rmg_private.require_actor(); gid uuid; rid uuid;
BEGIN
 IF p_quality IS NULL OR p_quality NOT BETWEEN 1 AND 5 OR (p_intensity IS NOT NULL AND p_intensity NOT BETWEEN 1 AND 5) OR p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 1 AND 3000 OR p_firsthand IS DISTINCT FROM true OR p_relationship IS NULL OR p_relationship NOT IN ('none','personal','financial','other') OR NOT rmg_private.valid_trip_responses(p_trip_responses) THEN RAISE EXCEPTION 'Invalid review' USING ERRCODE='22023'; END IF;
 gid:=rmg_private.resolve_guide(p_jurisdiction,p_source_id);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,84011));
 PERFORM 1 FROM public.guides WHERE id=gid FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.guide_claims c WHERE c.guide_id=gid AND c.claimant_id=actor AND c.status='approved') THEN RAISE EXCEPTION 'Owner cannot review own guide' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.reviews r WHERE r.guide_id=gid AND r.author_id=actor) THEN RAISE EXCEPTION 'Review already exists' USING ERRCODE='P4091'; END IF;
 IF (SELECT count(*) FROM public.reviews r WHERE r.author_id=actor AND r.created_at>now()-interval '24 hours')>=3 THEN RAISE EXCEPTION 'Review limit reached' USING ERRCODE='P4290'; END IF;
 INSERT INTO public.reviews(guide_id,author_id,quality,intensity,would_book_again,body,firsthand_attested,relationship_disclosure,trip_responses,status,published_at) VALUES(gid,actor,p_quality,p_intensity,p_rebook,btrim(p_body),true,p_relationship,p_trip_responses,'pending',NULL) RETURNING id INTO rid;
 RETURN jsonb_build_object('id',rid,'status','pending');
END $$;
