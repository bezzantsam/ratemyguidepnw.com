-- Owner-authorized policy: valid authenticated reviews and their edits publish
-- immediately; admins act on reports afterward. Apply as one transaction after
-- richer-review-survey-v1.sql and review-moderator-own-submission-v1.sql.
-- No existing review, revision, claim, ownership, RLS policy or launch flag is changed.
DO $$
BEGIN
 IF to_regprocedure('rmg_private.review_target_for_write_v1(text,text)') IS NULL
  OR to_regprocedure('rmg_private.lock_review_guide_v1(uuid)') IS NULL
  OR to_regprocedure('rmg_private.submit_review_v3(text,text,smallint,smallint,boolean,text,boolean,text,jsonb,text,jsonb)') IS NULL
  OR to_regprocedure('rmg_private.submit_revision_v3(uuid,smallint,smallint,boolean,text,boolean,text,jsonb,boolean,text,jsonb)') IS NULL
  OR to_regprocedure('rmg_private.is_own_pending_review_v1(uuid)') IS NULL
  OR to_regprocedure('rmg_private.valid_trip_responses(jsonb)') IS NULL THEN
  RAISE EXCEPTION 'Automatic publication requires the current review identity, ratings, survey and moderator migrations';
 END IF;
 IF NOT rmg_private.valid_trip_responses('{"version":1,"answers":{"kindness":{"state":"answered","value":5},"fishiness":{"state":"answered","value":4},"fish_landed":{"state":"answered","value":0}}}'::jsonb)
  OR position('retained_answers' IN pg_get_functiondef('rmg_private.submit_revision(uuid,smallint,smallint,boolean,text,boolean,text,jsonb)'::regprocedure))=0 THEN
  RAISE EXCEPTION 'Automatic publication requires richer survey validation and revision answer retention';
 END IF;
END $$;

-- Preserve identity eligibility, authentication, author/guide locks, owner
-- conflicts, duplicate protection and rate limits from the existing write path.
-- The surrounding v2/v3 call adds month/ratings in this same transaction.
CREATE OR REPLACE FUNCTION rmg_private.submit_review(
 p_jurisdiction text,p_source_id text,p_quality smallint,p_intensity smallint,p_rebook boolean,
 p_body text,p_firsthand boolean,p_relationship text,p_trip_responses jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor(); gid uuid; rid uuid;
BEGIN
 PERFORM rmg_private.lock_launch_for_write_v1();
 IF p_quality IS NULL OR p_quality NOT BETWEEN 1 AND 5
  OR (p_intensity IS NOT NULL AND p_intensity NOT BETWEEN 1 AND 5)
  OR p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 1 AND 3000
  OR p_firsthand IS DISTINCT FROM true OR p_relationship IS NULL
  OR p_relationship NOT IN ('none','personal','financial','other')
  OR NOT rmg_private.valid_trip_responses(p_trip_responses) THEN
  RAISE EXCEPTION 'Invalid review' USING ERRCODE='22023';
 END IF;
 gid:=rmg_private.review_target_for_write_v1(p_jurisdiction,p_source_id);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,84011));
 PERFORM 1 FROM public.guides WHERE id=gid FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.guide_claims c
  WHERE c.guide_id=gid AND c.claimant_id=actor AND c.status='approved') THEN
  RAISE EXCEPTION 'Owner cannot review own guide' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM public.reviews r WHERE r.guide_id=gid AND r.author_id=actor) THEN
  RAISE EXCEPTION 'Review already exists' USING ERRCODE='P4091';
 END IF;
 IF (SELECT count(*) FROM public.reviews r
  WHERE r.author_id=actor AND r.created_at>now()-interval '24 hours')>=3 THEN
  RAISE EXCEPTION 'Review limit reached' USING ERRCODE='P4290';
 END IF;
 INSERT INTO public.reviews(guide_id,author_id,quality,intensity,would_book_again,body,
  firsthand_attested,relationship_disclosure,trip_responses,status,published_at)
 VALUES(gid,actor,p_quality,p_intensity,p_rebook,btrim(p_body),true,p_relationship,
  p_trip_responses,'published',now()) RETURNING id INTO rid;
 INSERT INTO public.moderation_audit(actor_id,target_type,target_id,old_status,new_status,reason)
 VALUES(NULL,'review',rid,NULL,'published','Automatic publication after authenticated submission validation; policy v1.');
 RETURN jsonb_build_object('id',rid,'status','published');
END $$;

-- Finalize only AFTER the complete versioned private submit has populated its
-- proposal. Calling this inside submit_revision or submit_revision_v2 would lose
-- the month or richer rating patch attached by their callers.
CREATE OR REPLACE FUNCTION rmg_private.publish_own_revision_v1(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor(); vid uuid; gid uuid;
 original public.reviews%ROWTYPE; proposal rmg_private.review_revisions%ROWTYPE;
BEGIN
 PERFORM rmg_private.lock_launch_for_write_v1();
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,84013));
 SELECT v.review_id,r.guide_id INTO vid,gid
 FROM rmg_private.review_revisions v JOIN public.reviews r ON r.id=v.review_id
 WHERE v.id=p_id AND v.submitter_id=actor AND r.author_id=actor;
 IF vid IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE='P0002'; END IF;
 PERFORM rmg_private.lock_review_guide_v1(gid);
 PERFORM 1 FROM public.guides WHERE id=gid FOR UPDATE;
 SELECT * INTO original FROM public.reviews WHERE id=vid FOR UPDATE;
 SELECT * INTO proposal FROM rmg_private.review_revisions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR original.guide_id IS DISTINCT FROM gid
  OR original.author_id IS DISTINCT FROM actor OR proposal.submitter_id IS DISTINCT FROM actor
  OR proposal.review_id IS DISTINCT FROM vid OR original.status<>'published'
  OR proposal.status<>'pending' THEN
  RAISE EXCEPTION 'Revision unavailable' USING ERRCODE='P0001';
 END IF;
 IF EXISTS(SELECT 1 FROM public.guide_claims
  WHERE guide_id=gid AND claimant_id=actor AND status='approved') THEN
  RAISE EXCEPTION 'Owner cannot revise own guide review' USING ERRCODE='42501';
 END IF;
 UPDATE public.reviews SET quality=proposal.quality,intensity=proposal.intensity,
  would_book_again=proposal.would_book_again,body=proposal.body,
  relationship_disclosure=proposal.relationship_disclosure,trip_responses=proposal.trip_responses,
  trip_month=CASE WHEN proposal.trip_month_specified THEN proposal.trip_month ELSE original.trip_month END,
  communication=CASE WHEN proposal.ratings ? 'communication' THEN (proposal.ratings->>'communication')::numeric::smallint ELSE original.communication END,
  professionalism=CASE WHEN proposal.ratings ? 'professionalism' THEN (proposal.ratings->>'professionalism')::numeric::smallint ELSE original.professionalism END,
  safety=CASE WHEN proposal.ratings ? 'safety' THEN (proposal.ratings->>'safety')::numeric::smallint ELSE original.safety END,
  equipment=CASE WHEN proposal.ratings ? 'equipment' THEN (proposal.ratings->>'equipment')::numeric::smallint ELSE original.equipment END,
  knowledge=CASE WHEN proposal.ratings ? 'knowledge' THEN (proposal.ratings->>'knowledge')::numeric::smallint ELSE original.knowledge END,
  effort=CASE WHEN proposal.ratings ? 'effort' THEN (proposal.ratings->>'effort')::numeric::smallint ELSE original.effort END,
  value_rating=CASE WHEN proposal.ratings ? 'value' THEN (proposal.ratings->>'value')::numeric::smallint ELSE original.value_rating END
 WHERE id=vid;
 UPDATE rmg_private.review_revisions
 SET status='approved',decided_at=now(),decided_by=NULL WHERE id=p_id;
 INSERT INTO public.moderation_audit(actor_id,target_type,target_id,old_status,new_status,reason)
 VALUES(NULL,'review',vid,'published','published','Automatic publication of author revision '||p_id::text||'; policy v1.');
 RETURN jsonb_build_object('id',p_id,'status','approved');
END $$;

-- Keep every supported public version automatic, including older clients. The
-- private version chain still builds a complete pending proposal atomically.
CREATE OR REPLACE FUNCTION public.rmg_submit_revision(
 p_review_id uuid,p_quality smallint,p_intensity smallint,p_rebook boolean,
 p_body text,p_firsthand boolean,p_relationship text,p_trip_responses jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT rmg_private.publish_own_revision_v1((rmg_private.submit_revision($1,$2,$3,$4,$5,$6,$7,$8)->>'id')::uuid)
$$;

CREATE OR REPLACE FUNCTION public.rmg_submit_revision_v2(
 p_review_id uuid,p_quality smallint,p_intensity smallint,p_rebook boolean,
 p_body text,p_firsthand boolean,p_relationship text,p_trip_responses jsonb,
 p_trip_month_specified boolean,p_trip_month text
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT rmg_private.publish_own_revision_v1((rmg_private.submit_revision_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)->>'id')::uuid)
$$;

CREATE OR REPLACE FUNCTION public.rmg_submit_revision_v3(
 p_review_id uuid,p_quality smallint,p_intensity smallint,p_rebook boolean,
 p_body text,p_firsthand boolean,p_relationship text,p_trip_responses jsonb,
 p_trip_month_specified boolean,p_trip_month text,p_ratings jsonb
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT rmg_private.publish_own_revision_v1((rmg_private.submit_revision_v3($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)->>'id')::uuid)
$$;

-- A report queues review; it never removes a post by itself. Only a confirmed,
-- nonconflicted site admin can make this explicit, audited decision. The old
-- resolve_report(p_id) remains available with its original keep-only behavior.
CREATE OR REPLACE FUNCTION rmg_private.resolve_report_v2(p_id uuid,p_action text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor(); rid uuid; gid uuid; decision_reason text;
 report public.review_flags%ROWTYPE; review public.reviews%ROWTYPE; resulting_status text;
BEGIN
 PERFORM rmg_private.lock_launch_for_write_v1();
 IF NOT public.is_site_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 decision_reason:=btrim(coalesce(p_reason,''));
 IF p_action IS NULL OR p_action NOT IN ('keep','remove') OR char_length(coalesce(p_reason,''))>500
  OR (p_action='remove' AND decision_reason='') THEN
  RAISE EXCEPTION 'Invalid report decision' USING ERRCODE='22023';
 END IF;
 IF decision_reason='' THEN decision_reason:='Kept review after reviewing report.'; END IF;
 SELECT f.review_id,r.guide_id INTO rid,gid
 FROM public.review_flags f JOIN public.reviews r ON r.id=f.review_id WHERE f.id=p_id;
 IF rid IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE='P0002'; END IF;
 PERFORM rmg_private.lock_review_guide_v1(gid);
 PERFORM 1 FROM public.guides WHERE id=gid FOR UPDATE;
 SELECT * INTO review FROM public.reviews WHERE id=rid FOR UPDATE;
 SELECT * INTO report FROM public.review_flags WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR review.guide_id IS DISTINCT FROM gid
  OR report.review_id IS DISTINCT FROM rid OR report.status<>'pending' THEN
  RAISE EXCEPTION 'Report unavailable' USING ERRCODE='P0001';
 END IF;
 IF actor=report.reporter_id OR actor=review.author_id OR EXISTS(SELECT 1 FROM public.guide_claims
  WHERE guide_id=gid AND claimant_id=actor AND status='approved') THEN
  RAISE EXCEPTION 'Conflicting moderator' USING ERRCODE='42501';
 END IF;
 IF p_action='remove' AND review.status NOT IN ('published','removed') THEN
  RAISE EXCEPTION 'Review unavailable for removal' USING ERRCODE='P0001';
 END IF;
 resulting_status:=review.status;
 IF p_action='remove' AND review.status='published' THEN
  UPDATE public.reviews SET status='removed',published_at=NULL WHERE id=rid;
  resulting_status:='removed';
 END IF;
 UPDATE public.review_flags SET status='resolved',resolved_at=now(),resolved_by=actor WHERE id=p_id;
 INSERT INTO public.moderation_audit(actor_id,target_type,target_id,old_status,new_status,reason)
 VALUES(actor,'review',rid,review.status,resulting_status,
  'Report '||p_id::text||'; action '||p_action||'; '||decision_reason);
 RETURN jsonb_build_object('id',p_id,'status','resolved','review_id',rid,'review_status',resulting_status);
END $$;

CREATE OR REPLACE FUNCTION public.rmg_resolve_report_v2(p_id uuid,p_action text,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT rmg_private.resolve_report_v2($1,$2,$3)
$$;

-- CREATE OR REPLACE retains the existing functions' ACLs, including legacy
-- wrapper grants. Set explicit privileges only on newly introduced functions.
REVOKE ALL ON FUNCTION
 rmg_private.publish_own_revision_v1(uuid),
 rmg_private.resolve_report_v2(uuid,text,text),
 public.rmg_resolve_report_v2(uuid,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 rmg_private.publish_own_revision_v1(uuid),
 rmg_private.resolve_report_v2(uuid,text,text),
 public.rmg_resolve_report_v2(uuid,text,text)
 TO authenticated;

NOTIFY pgrst,'reload schema';
