-- REVIEW CANDIDATE ONLY: apply exclusively to disposable local test databases.
-- No automatic migration, no production authorization, no customer write enablement.
BEGIN;
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
COMMIT;
