-- REVIEW CANDIDATE ONLY. No public review changes until an independent moderator approves.
BEGIN;
CREATE TABLE rmg_private.review_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 review_id uuid NOT NULL REFERENCES public.reviews(id),
 submitter_id uuid NOT NULL REFERENCES auth.users(id),
 quality smallint NOT NULL CHECK (quality BETWEEN 1 AND 5),
 intensity smallint NOT NULL CHECK (intensity BETWEEN 1 AND 5),
 would_book_again boolean NOT NULL,
 body text NOT NULL CHECK (char_length(body) BETWEEN 80 AND 3000),
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
 IF p_quality IS NULL OR p_quality NOT BETWEEN 1 AND 5 OR p_intensity IS NULL OR p_intensity NOT BETWEEN 1 AND 5 OR p_rebook IS NULL OR p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 80 AND 3000 OR p_firsthand IS DISTINCT FROM true OR p_relationship IS NULL OR p_relationship NOT IN ('none','personal','financial','other') OR NOT rmg_private.valid_trip_responses(p_trip_responses) THEN RAISE EXCEPTION 'Invalid review revision' USING ERRCODE='22023'; END IF;
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
  (SELECT id,review_id,quality,intensity,would_book_again,body,relationship_disclosure,trip_responses,created_at FROM rmg_private.review_revisions WHERE status='pending' ORDER BY created_at,id OFFSET p_offset LIMIT p_limit) q;
 RETURN result;
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
REVOKE ALL ON FUNCTION rmg_private.submit_revision(uuid,smallint,smallint,boolean,text,boolean,text,jsonb),rmg_private.revision_queue(integer,integer),rmg_private.decide_revision(uuid,boolean,text),rmg_private.my_submissions(integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.rmg_submit_revision(uuid,smallint,smallint,boolean,text,boolean,text,jsonb),public.rmg_revision_queue(integer,integer),public.rmg_decide_revision(uuid,boolean,text),public.rmg_my_submissions(integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION rmg_private.submit_revision(uuid,smallint,smallint,boolean,text,boolean,text,jsonb),rmg_private.revision_queue(integer,integer),rmg_private.decide_revision(uuid,boolean,text),rmg_private.my_submissions(integer,integer),public.rmg_submit_revision(uuid,smallint,smallint,boolean,text,boolean,text,jsonb),public.rmg_revision_queue(integer,integer),public.rmg_decide_revision(uuid,boolean,text),public.rmg_my_submissions(integer,integer) TO authenticated;
COMMIT;
