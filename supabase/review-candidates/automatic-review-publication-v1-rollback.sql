-- Captured from Rate Your Guide before automatic publication v1 activation.
-- Restore future review/edit writes to their previous pending-review policy.
-- Already published reviews stay published. Report keep/remove helpers stay available.

CREATE OR REPLACE FUNCTION public.rmg_submit_revision_v2(p_review_id uuid, p_quality smallint, p_intensity smallint, p_rebook boolean, p_body text, p_firsthand boolean, p_relationship text, p_trip_responses jsonb, p_trip_month_specified boolean, p_trip_month text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$SELECT rmg_private.submit_revision_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)$function$;

CREATE OR REPLACE FUNCTION rmg_private.submit_review(p_jurisdiction text, p_source_id text, p_quality smallint, p_intensity smallint, p_rebook boolean, p_body text, p_firsthand boolean, p_relationship text, p_trip_responses jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.rmg_submit_revision(p_review_id uuid, p_quality smallint, p_intensity smallint, p_rebook boolean, p_body text, p_firsthand boolean, p_relationship text, p_trip_responses jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$SELECT rmg_private.submit_revision($1,$2,$3,$4,$5,$6,$7,$8)$function$;

CREATE OR REPLACE FUNCTION public.rmg_submit_revision_v3(p_review_id uuid, p_quality smallint, p_intensity smallint, p_rebook boolean, p_body text, p_firsthand boolean, p_relationship text, p_trip_responses jsonb, p_trip_month_specified boolean, p_trip_month text, p_ratings jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT rmg_private.submit_revision_v3($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
$function$;

-- Prevent direct use of the automatic finalizer after restoring pending edits.
REVOKE ALL ON FUNCTION rmg_private.publish_own_revision_v1(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
