\set ON_ERROR_STOP on
-- Prove effective denial under actual application roles, not only catalog booleans.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT public.qa_expect($q$INSERT INTO public.reviews(id,guide_id,author_id,quality,intensity,would_book_again,body) VALUES ('30000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001',4,4,true,repeat('synthetic ',10))$q$,'42501',NULL);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.qa_expect($q$SELECT public.admin_decide_review('30000000-0000-0000-0000-000000000002',true,'inherited privilege')$q$,'42501',NULL);
RESET ROLE;
SELECT public.qa_assert((SELECT status='pending' AND published_at IS NULL FROM public.reviews WHERE id='30000000-0000-0000-0000-000000000002') AND (SELECT count(*)=0 FROM public.reviews WHERE id='30000000-0000-0000-0000-000000000009') AND (SELECT review_count=0 FROM public.guides WHERE id='10000000-0000-0000-0000-000000000002') AND (SELECT count(*)=0 FROM public.moderation_audit) AND has_table_privilege('qa_legacy_grants','public.species','SELECT'),'both formerly allowed actions denied, protected state unchanged and unrelated grant preserved');
