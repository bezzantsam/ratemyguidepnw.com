\set ON_ERROR_STOP on
BEGIN;
SELECT rmg_private.seed_wa_review_catalog_v1(jsonb_build_array(jsonb_build_object(
 'sourceId','wa-091','sourceKeySha256',repeat('91',32),'listingSha256',repeat('19',32),'holdReason',NULL)));
SELECT 'wa-091@catalog:'||repeat('19',32) AS wa_source \gset
UPDATE rmg_private.wa_catalog_review_control_v1 SET enabled=true WHERE singleton;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
SELECT public.rmg_submit_review_v3('WA',:'wa_source',4::smallint,NULL,true,'Synthetic moderator angler review',true,'none',NULL,NULL,
 '{"safety":5}')->>'id' AS review_id \gset
SELECT public.fixture_assert(EXISTS(SELECT 1 FROM public.admin_pending_reviews q WHERE q.id=:'review_id'
 AND is_own_submission=true AND catalog_source_id='wa-091' AND safety=5
 AND NOT(to_jsonb(q) ?| ARRAY['author_id','submitter_id','email'])),
 'submitting moderator sees own review marker and exact WA binding without author identity');
SELECT public.fixture_offerings_denial(format($q$SELECT public.rmg_decide_submission('review',%L,true,'Synthetic self approval challenge')$q$,:'review_id'),'P0001');

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
SELECT public.fixture_assert(NOT EXISTS(SELECT 1 FROM public.admin_pending_reviews WHERE id=:'review_id')
 AND NOT rmg_private.is_own_pending_review_v1(:'review_id'),
 'ordinary actor gets no private ownership signal');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
SELECT public.fixture_assert(EXISTS(SELECT 1 FROM public.admin_pending_reviews q WHERE q.id=:'review_id'
 AND is_own_submission=false AND NOT(to_jsonb(q) ?| ARRAY['author_id','submitter_id','email'])),
 'other moderator sees a false review marker and no author identity');
SELECT public.rmg_decide_submission('review',:'review_id',true,'Synthetic independent moderator approval');

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
SELECT public.rmg_submit_revision_v3(:'review_id',5::smallint,NULL,NULL,'Synthetic moderator angler edit',true,'none',NULL,false,NULL,
 '{"safety":4}')->>'id' AS edit_id \gset
SELECT public.fixture_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(public.rmg_revision_queue(0,100)) AS q(item)
 WHERE item @> jsonb_build_object('id',:'edit_id','is_own_submission',true,'catalog_source_id','wa-091','safety',4)
 AND NOT(item ?| ARRAY['author_id','submitter_id','email'])),
 'submitting moderator sees own edit marker, proposed rating and no author identity');
SELECT public.fixture_offerings_denial(format($q$SELECT public.rmg_decide_revision(%L,true,'Synthetic self approval challenge')$q$,:'edit_id'),'42501');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
SELECT public.fixture_offerings_denial($q$SELECT public.rmg_revision_queue(0,100)$q$,'42501');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
SELECT public.fixture_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(public.rmg_revision_queue(0,100)) AS q(item)
 WHERE item @> jsonb_build_object('id',:'edit_id','is_own_submission',false)
 AND NOT(item ?| ARRAY['author_id','submitter_id','email'])),
 'other moderator sees a false edit marker and no author identity');
SELECT public.rmg_decide_revision(:'edit_id',true,'Synthetic independent moderator edit approval');
ROLLBACK;
