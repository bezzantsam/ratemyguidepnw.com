BEGIN;
DO $$
BEGIN
  PERFORM 1 FROM rmg_private.claim_control_v1 WHERE singleton AND NOT enabled FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Close claims before installing the Oregon claim workflow'; END IF;
END $$;

-- A published Oregon source, independent of the review launch resolver and gate.
CREATE FUNCTION rmg_private.oregon_claim_guide_v1(p_jurisdiction text, p_source_id text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT m.guide_id FROM rmg_private.guide_identity_map m
  JOIN public.guides g ON g.id=m.guide_id
  WHERE p_jurisdiction='OR' AND m.jurisdiction='OR' AND m.source_id=p_source_id
    AND g.listing_status='published';
$$;

CREATE FUNCTION rmg_private.require_claim_actor_v1()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id=actor AND u.email_confirmed_at IS NOT NULL
      AND NOT coalesce(u.is_anonymous,false) AND u.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  RETURN actor;
END $$;

-- Establish an exact claim using the same guide lock order as moderation and review submission.
CREATE FUNCTION rmg_private.approved_owner_claim_for_source_v1(p_jurisdiction text,p_source_id text,p_write boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := rmg_private.require_claim_actor_v1(); gid uuid; claim uuid;
BEGIN
  PERFORM rmg_private.lock_claims_for_write_v1();
  gid := rmg_private.oregon_claim_guide_v1(p_jurisdiction,p_source_id);
  IF p_write THEN
    PERFORM 1 FROM public.guides WHERE id=gid AND listing_status='published' FOR UPDATE;
  ELSE
    PERFORM 1 FROM public.guides WHERE id=gid AND listing_status='published' FOR SHARE;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Approved owner required' USING ERRCODE='42501'; END IF;
  SELECT id INTO claim FROM public.guide_claims WHERE guide_id=gid AND claimant_id=actor AND status='approved' FOR SHARE;
  IF claim IS NULL THEN RAISE EXCEPTION 'Approved owner required' USING ERRCODE='42501'; END IF;
  RETURN claim;
END $$;

CREATE FUNCTION public.rmg_claim_availability_v1(p_jurisdiction text, p_source_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('available',
    COALESCE((SELECT enabled FROM rmg_private.claim_control_v1 WHERE singleton),false)
    AND rmg_private.oregon_claim_guide_v1(p_jurisdiction,p_source_id) IS NOT NULL);
$$;

CREATE FUNCTION public.rmg_claim_status_v1(p_jurisdiction text, p_source_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := rmg_private.require_claim_actor_v1(); gid uuid; own_status text;
BEGIN
  PERFORM rmg_private.lock_claims_for_write_v1();
  gid := rmg_private.oregon_claim_guide_v1(p_jurisdiction,p_source_id);
  IF gid IS NULL THEN RAISE EXCEPTION 'Claim listing unavailable' USING ERRCODE='P0002'; END IF;
  SELECT status INTO own_status FROM public.guide_claims WHERE guide_id=gid AND claimant_id=actor;
  IF own_status IS NULL THEN
    own_status := CASE WHEN EXISTS (SELECT 1 FROM public.guide_claims WHERE guide_id=gid AND status='approved')
      THEN 'unavailable' ELSE 'none' END;
  END IF;
  RETURN jsonb_build_object('status',own_status);
END $$;

CREATE FUNCTION public.rmg_submit_claim_v1(p_jurisdiction text,p_source_id text,p_name text,p_business text,p_evidence text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := rmg_private.require_claim_actor_v1(); gid uuid; prior public.guide_claims%ROWTYPE; cid uuid;
BEGIN
  PERFORM rmg_private.lock_claims_for_write_v1();
  IF length(btrim(coalesce(p_name,''))) NOT BETWEEN 2 AND 120 OR length(coalesce(p_business,''))>160
    OR length(btrim(coalesce(p_evidence,''))) NOT BETWEEN 20 AND 1200 THEN
    RAISE EXCEPTION 'Invalid claim' USING ERRCODE='22023';
  END IF;
  gid := rmg_private.oregon_claim_guide_v1(p_jurisdiction,p_source_id);
  PERFORM 1 FROM public.guides WHERE id=gid AND listing_status='published' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Claim listing unavailable' USING ERRCODE='P0002'; END IF;
  SELECT * INTO prior FROM public.guide_claims WHERE guide_id=gid AND claimant_id=actor;
  IF prior.status='pending' THEN RETURN jsonb_build_object('id',prior.id,'status','pending','existing',true); END IF;
  IF prior.id IS NOT NULL OR EXISTS (SELECT 1 FROM public.guide_claims WHERE guide_id=gid AND status='approved') THEN
    RAISE EXCEPTION 'Claim unavailable for this account';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,84012));
  IF (SELECT count(*) FROM public.guide_claims WHERE claimant_id=actor AND created_at>now()-interval '24 hours')>=3 THEN
    RAISE EXCEPTION 'Claim limit reached' USING ERRCODE='P4290';
  END IF;
  INSERT INTO public.guide_claims(guide_id,claimant_id,status) VALUES (gid,actor,'pending') RETURNING id INTO cid;
  INSERT INTO public.claim_evidence(claim_id,claimant_name,business_name,public_evidence)
    VALUES (cid,btrim(p_name),btrim(coalesce(p_business,'')),btrim(p_evidence));
  RETURN jsonb_build_object('id',cid,'status','pending','existing',false);
END $$;

CREATE FUNCTION public.rmg_claim_queue_v1(p_offset integer,p_limit integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM rmg_private.require_claim_actor_v1();
  IF public.is_site_admin() IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  PERFORM rmg_private.lock_claims_for_write_v1();
  IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid page' USING ERRCODE='22023';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.created_at,q.id) FROM (
    SELECT c.id,g.full_name AS guide_name,m.source_id,c.created_at,e.claimant_name,e.business_name,e.public_evidence
    FROM public.guide_claims c JOIN public.guides g ON g.id=c.guide_id AND g.listing_status='published'
    JOIN rmg_private.guide_identity_map m ON m.guide_id=g.id AND m.jurisdiction='OR'
    LEFT JOIN public.claim_evidence e ON e.claim_id=c.id
    WHERE c.status='pending' ORDER BY c.created_at,c.id OFFSET p_offset LIMIT p_limit
  ) q),'[]'::jsonb);
END $$;

CREATE FUNCTION public.rmg_decide_claim_v1(p_id uuid,p_approve boolean,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := rmg_private.require_claim_actor_v1(); gid uuid; target public.guide_claims%ROWTYPE; result text;
BEGIN
  IF public.is_site_admin() IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  PERFORM rmg_private.lock_claims_for_write_v1();
  IF p_approve IS NULL OR length(coalesce(p_reason,''))>500 OR (p_approve AND length(btrim(coalesce(p_reason,'')))<20) THEN
    RAISE EXCEPTION 'Invalid decision or verification note' USING ERRCODE='22023';
  END IF;
  SELECT guide_id INTO gid FROM public.guide_claims WHERE id=p_id;
  PERFORM 1 FROM public.guides g WHERE g.id=gid AND g.listing_status='published' AND EXISTS (
    SELECT 1 FROM rmg_private.guide_identity_map m WHERE m.guide_id=g.id AND m.jurisdiction='OR'
  ) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Claim listing unavailable' USING ERRCODE='P0002'; END IF;
  SELECT * INTO target FROM public.guide_claims WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR target.guide_id IS DISTINCT FROM gid OR target.status<>'pending' THEN RAISE EXCEPTION 'Claim is no longer pending'; END IF;
  IF target.claimant_id=actor THEN RAISE EXCEPTION 'Cannot decide your own claim' USING ERRCODE='42501'; END IF;
  IF p_approve THEN
    IF NOT EXISTS (SELECT 1 FROM public.claim_evidence e WHERE e.claim_id=p_id AND length(btrim(e.public_evidence))>=20) THEN
      RAISE EXCEPTION 'Claim evidence required' USING ERRCODE='22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.guide_claims WHERE guide_id=gid AND status='approved') THEN RAISE EXCEPTION 'Already approved'; END IF;
    IF EXISTS (SELECT 1 FROM public.reviews WHERE guide_id=gid AND author_id=target.claimant_id AND status IN ('pending','published')) THEN
      RAISE EXCEPTION 'Resolve claimant review conflict before approval';
    END IF;
  END IF;
  result := CASE WHEN p_approve THEN 'approved' ELSE 'denied' END;
  UPDATE public.guide_claims SET status=result WHERE id=p_id;
  INSERT INTO public.moderation_audit(actor_id,target_type,target_id,old_status,new_status,reason)
    VALUES (actor,'claim',p_id,target.status,result,btrim(p_reason));
  RETURN jsonb_build_object('id',p_id,'status',result);
END $$;

REVOKE ALL ON FUNCTION rmg_private.oregon_claim_guide_v1(text,text),rmg_private.require_claim_actor_v1(),
  rmg_private.approved_owner_claim_for_source_v1(text,text,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.rmg_claim_availability_v1(text,text),public.rmg_claim_status_v1(text,text),
  public.rmg_submit_claim_v1(text,text,text,text,text),public.rmg_claim_queue_v1(integer,integer),public.rmg_decide_claim_v1(uuid,boolean,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.rmg_claim_availability_v1(text,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rmg_claim_status_v1(text,text),public.rmg_submit_claim_v1(text,text,text,text,text),
  public.rmg_claim_queue_v1(integer,integer),public.rmg_decide_claim_v1(uuid,boolean,text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rmg_submit_claim(text,text,text,text,text),rmg_private.submit_claim(text,text,text,text,text),
  public.rmg_edit_details(text,text,text,text,smallint,text,text),rmg_private.edit_details(text,text,text,text,smallint,text,text),
  public.admin_decide_claim(uuid,boolean,text) FROM PUBLIC,anon,authenticated;
REVOKE SELECT ON public.admin_pending_claims FROM PUBLIC,anon,authenticated;
COMMIT;
