\set ON_ERROR_STOP on
-- Synthetic media schema and column-only/PUBLIC drift; not a hosted schema claim.
CREATE TABLE public.guide_media(id uuid PRIMARY KEY,guide_id uuid,caption text);
ALTER TABLE public.guide_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY qa_media ON public.guide_media TO authenticated USING (true) WITH CHECK (true);
GRANT UPDATE(caption) ON public.guide_media TO authenticated;
GRANT INSERT(public_evidence) ON public.claim_evidence TO PUBLIC;
GRANT SELECT(author_id) ON public.reviews TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decide_review(uuid,boolean,text) TO PUBLIC;
INSERT INTO public.guide_media VALUES ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','before');
