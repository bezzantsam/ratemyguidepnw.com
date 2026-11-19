-- REVIEW CANDIDATE ONLY. Apply after v2.4 and 06-review-reporting.
-- Retain existing RPCs; new named versions carry the optional trip month.
ALTER TABLE rmg_private.review_revisions ADD COLUMN trip_month date;
ALTER TABLE rmg_private.review_revisions ADD COLUMN trip_month_specified boolean NOT NULL DEFAULT false;

CREATE FUNCTION rmg_private.parse_trip_month(p_month text) RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF p_month IS NULL THEN RETURN NULL; END IF;
 IF p_month !~ '^(0[0-9]{3}|[1-9][0-9]{3})-(0[1-9]|1[0-2])$' OR substring(p_month,1,4)='0000' THEN RAISE EXCEPTION 'Invalid trip month' USING ERRCODE='22023'; END IF;
 RETURN pg_catalog.make_date(substring(p_month,1,4)::integer,substring(p_month,6,2)::integer,1);
END $$;

CREATE FUNCTION rmg_private.submit_review_v2(p_jurisdiction text,p_source_id text,p_quality smallint,p_intensity smallint,p_rebook boolean,p_body text,p_firsthand boolean,p_relationship text,p_trip_responses jsonb,p_trip_month text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE month_value date:=rmg_private.parse_trip_month(p_trip_month); receipt jsonb;
BEGIN
 receipt:=rmg_private.submit_review(p_jurisdiction,p_source_id,p_quality,p_intensity,p_rebook,p_body,p_firsthand,p_relationship,p_trip_responses);
 UPDATE public.reviews SET trip_month=month_value WHERE id=(receipt->>'id')::uuid;
 RETURN receipt;
END $$;
CREATE FUNCTION rmg_private.submit_revision_v2(p_review_id uuid,p_quality smallint,p_intensity smallint,p_rebook boolean,p_body text,p_firsthand boolean,p_relationship text,p_trip_responses jsonb,p_trip_month_specified boolean,p_trip_month text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE month_value date:=rmg_private.parse_trip_month(p_trip_month); receipt jsonb;
BEGIN
 IF p_trip_month_specified IS NULL OR (NOT p_trip_month_specified AND p_trip_month IS NOT NULL) THEN RAISE EXCEPTION 'Invalid trip month' USING ERRCODE='22023'; END IF;
 receipt:=rmg_private.submit_revision(p_review_id,p_quality,p_intensity,p_rebook,p_body,p_firsthand,p_relationship,p_trip_responses);
 UPDATE rmg_private.review_revisions SET trip_month=month_value,trip_month_specified=p_trip_month_specified WHERE id=(receipt->>'id')::uuid;
 RETURN receipt;
END $$;

CREATE OR REPLACE FUNCTION rmg_private.revision_queue(p_offset integer,p_limit integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor();result jsonb;
BEGIN
 IF NOT public.is_site_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.created_at,q.id),'[]'::jsonb) INTO result FROM
  (SELECT v.id,v.review_id,g.full_name AS guide_name,m.jurisdiction,m.source_id,v.quality,v.intensity,v.would_book_again,v.body,v.relationship_disclosure,v.trip_responses,v.trip_month,v.trip_month_specified,v.created_at FROM rmg_private.review_revisions v JOIN public.reviews r ON r.id=v.review_id JOIN public.guides g ON g.id=r.guide_id LEFT JOIN LATERAL (SELECT jurisdiction,source_id FROM rmg_private.guide_identity_map WHERE guide_id=g.id ORDER BY jurisdiction,source_id LIMIT 1) m ON true WHERE v.status='pending' ORDER BY v.created_at,v.id OFFSET p_offset LIMIT p_limit) q;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION rmg_private.decide_revision(p_id uuid,p_approve boolean,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
  UPDATE public.reviews SET quality=proposal.quality,intensity=proposal.intensity,would_book_again=proposal.would_book_again,body=proposal.body,relationship_disclosure=proposal.relationship_disclosure,trip_responses=proposal.trip_responses,trip_month=CASE WHEN proposal.trip_month_specified THEN proposal.trip_month ELSE original.trip_month END WHERE id=vid;
 END IF;
 UPDATE rmg_private.review_revisions SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,decided_at=now(),decided_by=actor WHERE id=p_id;
 INSERT INTO public.moderation_audit(actor_id,target_type,target_id,old_status,new_status,reason) VALUES(actor,'review',vid,'published','published',left((CASE WHEN p_approve THEN 'approved revision ' ELSE 'rejected revision ' END)||p_id::text||'; '||coalesce(p_reason,''),500));
 RETURN jsonb_build_object('id',p_id,'status',CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END);
END $$;

CREATE FUNCTION rmg_private.own_review_for_guide(p_jurisdiction text,p_source_id text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_actor(); gid uuid; result jsonb;
BEGIN
 gid:=rmg_private.resolve_guide(p_jurisdiction,p_source_id);
 SELECT jsonb_build_object('id',r.id,'status',r.status) INTO result FROM public.reviews r WHERE r.guide_id=gid AND r.author_id=actor;
 RETURN result;
END $$;

-- Advisory readiness only: it cannot guarantee Auth delivery, future writes, quota or uptime.
CREATE FUNCTION rmg_private.review_write_availability(p_jurisdiction text,p_source_id text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE gid uuid; available boolean;
BEGIN
 gid:=rmg_private.resolve_guide(p_jurisdiction,p_source_id);
 available:=NOT pg_catalog.pg_is_in_recovery() AND current_setting('transaction_read_only')='off'
  AND pg_catalog.has_table_privilege(current_user,'public.reviews','INSERT')
  AND pg_catalog.has_schema_privilege('authenticated','public','USAGE')
  AND pg_catalog.has_schema_privilege('authenticated','rmg_private','USAGE')
  AND pg_catalog.has_function_privilege('authenticated','public.rmg_submit_review_v2(text,text,smallint,smallint,boolean,text,boolean,text,jsonb,text)','EXECUTE')
  AND pg_catalog.has_function_privilege('authenticated','rmg_private.submit_review_v2(text,text,smallint,smallint,boolean,text,boolean,text,jsonb,text)','EXECUTE');
 RETURN jsonb_build_object('available',available);
END $$;

CREATE FUNCTION public.rmg_submit_review_v2(p_jurisdiction text,p_source_id text,p_quality smallint,p_intensity smallint,p_rebook boolean,p_body text,p_firsthand boolean,p_relationship text,p_trip_responses jsonb,p_trip_month text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT rmg_private.submit_review_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)$$;
CREATE FUNCTION public.rmg_submit_revision_v2(p_review_id uuid,p_quality smallint,p_intensity smallint,p_rebook boolean,p_body text,p_firsthand boolean,p_relationship text,p_trip_responses jsonb,p_trip_month_specified boolean,p_trip_month text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT rmg_private.submit_revision_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)$$;
CREATE FUNCTION public.rmg_own_review_for_guide(p_jurisdiction text,p_source_id text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT rmg_private.own_review_for_guide($1,$2)$$;
CREATE FUNCTION public.rmg_review_write_availability(p_jurisdiction text,p_source_id text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT rmg_private.review_write_availability($1,$2)$$;
REVOKE ALL ON FUNCTION rmg_private.parse_trip_month(text),rmg_private.submit_review_v2(text,text,smallint,smallint,boolean,text,boolean,text,jsonb,text),rmg_private.submit_revision_v2(uuid,smallint,smallint,boolean,text,boolean,text,jsonb,boolean,text),rmg_private.own_review_for_guide(text,text),rmg_private.review_write_availability(text,text),public.rmg_submit_review_v2(text,text,smallint,smallint,boolean,text,boolean,text,jsonb,text),public.rmg_submit_revision_v2(uuid,smallint,smallint,boolean,text,boolean,text,jsonb,boolean,text),public.rmg_own_review_for_guide(text,text),public.rmg_review_write_availability(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION rmg_private.submit_review_v2(text,text,smallint,smallint,boolean,text,boolean,text,jsonb,text),rmg_private.submit_revision_v2(uuid,smallint,smallint,boolean,text,boolean,text,jsonb,boolean,text),rmg_private.own_review_for_guide(text,text),public.rmg_submit_review_v2(text,text,smallint,smallint,boolean,text,boolean,text,jsonb,text),public.rmg_submit_revision_v2(uuid,smallint,smallint,boolean,text,boolean,text,jsonb,boolean,text),public.rmg_own_review_for_guide(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION rmg_private.review_write_availability(text,text),public.rmg_review_write_availability(text,text) TO anon,authenticated;
