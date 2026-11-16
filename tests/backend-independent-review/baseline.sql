\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT public.qa_assert(current_user='authenticated' AND NOT (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user),'baseline uses non-superuser non-bypass application role');
INSERT INTO public.reviews(id,guide_id,author_id,quality,intensity,would_book_again,body) VALUES ('30000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001',4,4,true,repeat('synthetic ',10));
SELECT public.qa_expect('SELECT count(*) FROM public.public_angler_reviews','42501',NULL);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
UPDATE public.guide_details SET expertise='baseline owner edit' WHERE guide_id='10000000-0000-0000-0000-000000000001';
SELECT public.qa_assert((SELECT expertise='baseline owner edit' FROM public.guide_details WHERE guide_id='10000000-0000-0000-0000-000000000001'),'baseline approved owner can write directly');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.qa_expect('SELECT count(*) FROM public.admin_pending_reviews','42501',NULL);
SELECT public.admin_decide_review('30000000-0000-0000-0000-000000000004',true,'baseline');
SELECT public.admin_decide_claim('20000000-0000-0000-0000-000000000003',true,'baseline');
RESET ROLE;
SELECT public.qa_assert((SELECT status='published' FROM public.reviews WHERE id='30000000-0000-0000-0000-000000000004') AND (SELECT status='approved' FROM public.guide_claims WHERE id='20000000-0000-0000-0000-000000000003') AND (SELECT count(*)=2 FROM public.moderation_audit),'baseline permits direct pending insert and both admin self-approvals');
