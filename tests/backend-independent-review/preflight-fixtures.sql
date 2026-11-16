\set ON_ERROR_STOP on
-- Synthetic privilege graph used only for catalog inspection, never hosted.
CREATE ROLE qa_middle NOLOGIN;
CREATE ROLE qa_top NOLOGIN;
CREATE ROLE qa_peer NOLOGIN;
CREATE ROLE qa_noinherit NOLOGIN;
GRANT qa_middle TO authenticated;
GRANT qa_top TO qa_middle;
GRANT qa_legacy_grants TO qa_peer;
GRANT UPDATE (body) ON public.reviews TO qa_top;
GRANT INSERT ON public.claim_evidence TO authenticated;
GRANT INSERT (caption) ON public.guide_media TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_site_admin() TO PUBLIC;
-- Same name, different signature, intentionally left callable as a catalog
-- fixture: inventory reports it without executing its body.
CREATE FUNCTION public.admin_decide_review(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT false$$;
DO $$BEGIN
 IF current_setting('server_version_num')::int >= 160000 THEN
  EXECUTE 'GRANT qa_noinherit TO authenticated WITH INHERIT FALSE';
  EXECUTE 'GRANT DELETE ON public.guide_claims TO qa_noinherit';
 END IF;
END$$;
