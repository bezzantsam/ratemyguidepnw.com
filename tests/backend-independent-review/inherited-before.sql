\set ON_ERROR_STOP on
-- Deliberate synthetic drift; no assertion that this membership exists hosted.
CREATE ROLE qa_legacy_grants NOLOGIN;
GRANT qa_legacy_grants TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decide_review(uuid,boolean,text) TO qa_legacy_grants;
GRANT INSERT ON public.reviews TO qa_legacy_grants;
-- An unrelated privilege must survive the narrowly targeted delta.
GRANT SELECT ON public.species TO qa_legacy_grants;
