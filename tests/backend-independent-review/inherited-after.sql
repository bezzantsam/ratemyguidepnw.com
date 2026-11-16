\set ON_ERROR_STOP on
SELECT public.qa_assert(has_function_privilege('authenticated','public.admin_decide_review(uuid,boolean,text)','EXECUTE') AND has_table_privilege('authenticated','public.reviews','INSERT'),'conditional finding: inherited grants survive direct revocation');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
INSERT INTO public.reviews(id,guide_id,author_id,quality,intensity,would_book_again,body) VALUES ('30000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001',4,4,true,repeat('synthetic ',10));
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.admin_decide_review('30000000-0000-0000-0000-000000000002',true,'inherited privilege');
RESET ROLE;
SELECT public.qa_assert((SELECT status='pending' FROM public.reviews WHERE id='30000000-0000-0000-0000-000000000009') AND (SELECT status='published' FROM public.reviews WHERE id='30000000-0000-0000-0000-000000000002') AND (SELECT count(*)=1 FROM public.moderation_audit),'conditional finding: inherited customer write and admin RPC both execute');
