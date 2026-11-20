\set ON_ERROR_STOP on
-- Synthetic old backend row intentionally shares a public directory slug. The
-- unrelated row has a rating and no trusted crosswalk to this current listing.
INSERT INTO public.guides(id,slug,full_name,listing_status) VALUES
 ('10000000-0000-0000-0000-000000000021','wa-021','Synthetic former person','published'),
 ('10000000-0000-0000-0000-000000000024','fixture-legacy-map','Synthetic mapped legacy guide','published'),
 ('10000000-0000-0000-0000-000000000036','fixture-or-unclaimed','Synthetic unclaimed Oregon guide','published');
INSERT INTO auth.users(id,email_confirmed_at) VALUES ('00000000-0000-0000-0000-000000000007',now());
INSERT INTO public.reviews(guide_id,author_id,quality,body,status,published_at)
 VALUES ('10000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000001',
 2,'Synthetic legacy review for another person','published',now());
INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference)
 VALUES ('WA','wa-024','10000000-0000-0000-0000-000000000024',now(),'synthetic collision'),
 ('OR','OG.0000036','10000000-0000-0000-0000-000000000036',now(),'synthetic unclaimed listing');
CREATE TEMP VIEW baseline AS SELECT jsonb_build_object(
 'map',(SELECT jsonb_agg(to_jsonb(t) ORDER BY jurisdiction,source_id) FROM rmg_private.guide_identity_map t),
 'claims',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.guide_claims t),
 'legacy',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.reviews t
    WHERE guide_id='10000000-0000-0000-0000-000000000021'),
 'pilot',(SELECT jsonb_agg(to_jsonb(t) ORDER BY source_id) FROM rmg_private.wa_listed_review_identity_v1 t),
 'or_ratings',public.rmg_review_summary('OR','OG.0001225.F&F'),
 'or_trips',public.rmg_guide_offerings_public_v1('public_batch','{"afterSourceId":null,"limit":10}')
) AS snapshot;
CREATE TEMP TABLE before_catalog AS SELECT snapshot FROM baseline;

SELECT jsonb_agg(jsonb_build_object('sourceId',source,'sourceKeySha256',repeat(key,64),
 'listingSha256',repeat(version,64),'holdReason',reason)) AS manifest
FROM (VALUES ('wa-021','a','b',NULL),('wa-022','c','d',NULL),('wa-023','e','f','ambiguous-source'),
 ('wa-024','1','2',NULL),('wa-001','3','4',NULL)) fixture(source,key,version,reason) \gset
SELECT public.fixture_assert(rmg_private.seed_wa_review_catalog_v1(:'manifest')='{"checked":5,"held":3,"eligible":2}',
 'seed separately holds an explicit ambiguity, mapped legacy source, and an existing listed pilot');
SELECT review_identity AS first_anchor FROM rmg_private.wa_catalog_review_targets_v1 WHERE source_id='wa-021' \gset
SELECT review_identity AS next_anchor FROM rmg_private.wa_catalog_review_targets_v1 WHERE source_id='wa-022' \gset
SELECT public.fixture_assert(rmg_private.seed_wa_review_catalog_v1(:'manifest')='{"checked":5,"held":3,"eligible":2}'
 AND (SELECT review_identity=:'first_anchor' FROM rmg_private.wa_catalog_review_targets_v1 WHERE source_id='wa-021')
 AND :'first_anchor'::uuid<>:'next_anchor'::uuid
 AND :'first_anchor'::uuid<>'10000000-0000-0000-0000-000000000021'::uuid,
 'exact seed replay preserves fresh UUIDs, never reusing another listing or legacy slug');
SELECT public.fixture_offerings_denial(format($q$SELECT rmg_private.seed_wa_review_catalog_v1(%L)$q$,
 :'manifest'::jsonb||:'manifest'::jsonb),'22023');
SELECT public.fixture_offerings_denial(format($q$SELECT rmg_private.seed_wa_review_catalog_v1(%L)$q$,
 jsonb_set(:'manifest'::jsonb,'{0,listingSha256}',to_jsonb(repeat('9',64)))),'P0001');
SELECT public.fixture_offerings_denial(format($q$UPDATE public.guides SET listing_status='published' WHERE id=%L$q$,:'first_anchor'),'42501');
SELECT public.fixture_assert(NOT has_function_privilege('anon','rmg_private.seed_wa_review_catalog_v1(jsonb)','EXECUTE')
 AND NOT has_function_privilege('authenticated','rmg_private.seed_wa_review_catalog_v1(jsonb)','EXECUTE')
 AND NOT has_function_privilege('service_role','rmg_private.seed_wa_review_catalog_v1(jsonb)','EXECUTE')
 AND NOT has_table_privilege('anon','rmg_private.wa_catalog_review_targets_v1','SELECT')
 AND NOT has_table_privilege('authenticated','rmg_private.wa_catalog_review_control_v1','UPDATE'),
 'manifest, carrier map and gate remain private to the database owner');

SELECT 'wa-021@catalog:'||repeat('b',64) AS first,
 'wa-022@catalog:'||repeat('d',64) AS neighbor, 'wa-021@catalog:'||repeat('d',64) AS wrong,
 'wa-023@catalog:'||repeat('f',64) AS held, 'wa-024@catalog:'||repeat('2',64) AS mapped,
 'wa-001@catalog:'||repeat('4',64) AS prior_pilot, 'wa-021@'||repeat('b',64) AS wrong_lane \gset
SELECT jsonb_agg(jsonb_build_object('jurisdiction',CASE WHEN source LIKE 'OG.%' THEN 'OR' ELSE 'WA' END,
 'sourceId',source)) AS batch FROM unnest(ARRAY[
 :'first',:'neighbor',:'wrong',:'held',:'mapped',:'prior_pilot',:'wrong_lane','OG.0001225.F&F',:'first'
 ]) a(source) \gset
SET ROLE anon;
SELECT public.rmg_public_review_summaries_v1(:'batch') AS only_oregon \gset
SELECT public.fixture_assert(public.rmg_review_write_availability('WA',:'first')='{"available":false}'
 AND jsonb_array_length(:'only_oregon'::jsonb->'items')=1, 'bulk WA gate defaults closed while Oregon scores remain visible');
RESET ROLE;

UPDATE rmg_private.wa_catalog_review_control_v1 SET enabled=true WHERE singleton;
SELECT public.fixture_offerings_denial(format($q$SELECT rmg_private.seed_wa_review_catalog_v1(%L)$q$,:'manifest'),'P5030');
SET ROLE anon;
SELECT public.fixture_assert(public.rmg_review_write_availability('WA',:'first')='{"available":true}'
 AND public.rmg_review_write_availability('WA',:'neighbor')='{"available":true}'
 AND public.rmg_review_write_availability('WA',:'wrong')='{"available":false}'
 AND public.rmg_review_write_availability('WA',:'held')='{"available":false}'
 AND public.rmg_review_write_availability('WA',:'mapped')='{"available":false}'
 AND public.rmg_review_write_availability('WA',:'prior_pilot')='{"available":false}'
 AND public.rmg_review_write_availability('WA',:'wrong_lane')='{"available":false}'
 AND public.rmg_review_write_availability('WA','wa-021')='{"available":false}'
 AND public.rmg_claim_availability_v1('WA','wa-021')='{"available":false}'
 AND NOT EXISTS(SELECT 1 FROM public.guides WHERE id IN (:'first_anchor',:'next_anchor')),
 'only exact catalog versions resolve, with held, wrong-person, bare and legacy controls closed; claims stay off');
RESET ROLE;
BEGIN READ ONLY;
SET LOCAL ROLE anon;
SELECT public.fixture_assert(public.rmg_public_review_summaries_v1(:'batch')='{"items":[
 {"jurisdiction":"WA","sourceId":"wa-021","count":0,"averageQuality":null},
 {"jurisdiction":"WA","sourceId":"wa-022","count":0,"averageQuality":null},
 {"jurisdiction":"OR","sourceId":"OG.0001225.F&F","count":1,"averageQuality":4}]}',
 'ordinary Washington listings begin unrated and do not inherit the former person''s review; read-only batch keeps Oregon');
ROLLBACK;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
SELECT public.fixture_offerings_denial(format($q$SELECT public.rmg_submit_review_v2('WA',%L,4::smallint,NULL,NULL,'Block wrong person',true,'none',NULL,NULL)$q$,:'wrong'),'P5030');
SELECT public.fixture_offerings_denial(format($q$SELECT public.rmg_submit_review_v2('WA',%L,4::smallint,NULL,NULL,'Block held person',true,'none',NULL,NULL)$q$,:'held'),'P5030');
SELECT public.fixture_offerings_denial($q$SELECT public.rmg_submit_claim_v1('WA','wa-021','Fixture',NULL,'Synthetic claim evidence')$q$,'P0002');
SELECT public.rmg_submit_review_v2('WA',:'first',3::smallint,NULL,true,'Synthetic first catalog review',true,'none',NULL,NULL)->>'id' AS first_review \gset
SELECT public.rmg_submit_review_v2('WA',:'neighbor',4::smallint,NULL,false,'Synthetic second catalog review',true,'none',NULL,NULL)->>'id' AS next_review \gset
SELECT public.fixture_offerings_denial(format($q$SELECT public.rmg_submit_review_v2('WA',%L,4::smallint,NULL,NULL,'Duplicate',true,'none',NULL,NULL)$q$,:'first'),'P4091');
SELECT public.fixture_assert(public.rmg_own_review_for_guide('WA',:'first')->>'id'=:'first_review'
 AND public.rmg_own_review_for_guide('WA',:'neighbor')->>'id'=:'next_review'
 AND public.rmg_my_submissions(0,50) @> jsonb_build_array(jsonb_build_object('id',:'first_review','jurisdiction','WA','source_id','wa-021'))
 AND NOT EXISTS(SELECT 1 FROM public.public_angler_reviews WHERE id=:'first_review'),
 'same angler can review distinct unclaimed targets once each; pending receipts are exact and private');
SELECT public.fixture_offerings_denial(format($q$SELECT public.rmg_decide_submission('review',%L,true,'Synthetic moderation denial')$q$,:'first_review'),'42501');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.fixture_assert(EXISTS(SELECT 1 FROM public.admin_pending_reviews WHERE id=:'first_review'
 AND catalog_source_id='wa-021' AND catalog_listing_sha256=repeat('b',64)),
 'independent moderator can see admitted pending review');
SELECT public.rmg_decide_submission('review',:'first_review',true,'Synthetic verified current Washington trip');
SELECT public.rmg_decide_submission('review',:'next_review',true,'Synthetic verified distinct Washington trip');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
SELECT public.rmg_submit_revision_v2(:'first_review',5::smallint,NULL,true,
 'Synthetic current WA review edit',true,'none',NULL,false,NULL)->>'id' AS revision \gset
RESET ROLE;
BEGIN READ ONLY;
SET LOCAL ROLE anon;
SELECT public.fixture_assert(public.rmg_public_review_summaries_v1(:'batch')->'items'->0->>'averageQuality'='3.00',
 'pending revision leaves the original score published');
ROLLBACK;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.fixture_assert(public.rmg_revision_queue(0,100) @> jsonb_build_array(
 jsonb_build_object('id',:'revision','jurisdiction','WA','source_id','wa-021',
 'catalog_source_id','wa-021','catalog_listing_sha256',repeat('b',64))),
 'catalog revision queue keeps the exact bare source');
SELECT public.rmg_decide_revision(:'revision',true,'Synthetic verified current Washington edit');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
SELECT public.fixture_offerings_denial(format($q$SELECT public.rmg_report_review('WA',%L,%L,'other')$q$,:'neighbor',:'first_review'),'P0002');
SELECT public.rmg_report_review('WA',:'first',:'first_review','other')->>'id' AS report \gset
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.fixture_assert(public.rmg_report_queue(0,100) @> jsonb_build_array(
 jsonb_build_object('id',:'report','jurisdiction','WA','source_id','wa-021',
 'catalog_source_id','wa-021','catalog_listing_sha256',repeat('b',64))),
 'existing report queue retains exact catalog identity');
SELECT public.rmg_resolve_report(:'report');
RESET ROLE;
BEGIN READ ONLY;
SET LOCAL ROLE anon;
SELECT public.fixture_assert(public.rmg_public_review_summaries_v1(:'batch')='{"items":[
 {"jurisdiction":"WA","sourceId":"wa-021","count":1,"averageQuality":5},
 {"jurisdiction":"WA","sourceId":"wa-022","count":1,"averageQuality":4},
 {"jurisdiction":"OR","sourceId":"OG.0001225.F&F","count":1,"averageQuality":4}]}'
 AND ((public.rmg_public_review_summaries_v1(:'batch')->'items'->0)-'jurisdiction'-'sourceId')
   = public.rmg_review_summary('WA',:'first')-'wouldBookAgainPercent'-'wouldBookAgainResponses',
 'read-only batch matches approved profile ratings, keeps neighboring scores distinct, and report does not change either');
ROLLBACK;

BEGIN;
INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference)
 VALUES ('WA','wa-021','10000000-0000-0000-0000-000000000021',now(),'synthetic late historical collision');
SET LOCAL ROLE anon;
SELECT public.fixture_assert(public.rmg_review_write_availability('WA',:'first')='{"available":false}'
 AND public.rmg_review_write_availability('WA',:'neighbor')='{"available":true}',
 'a later collision fails closed for only the affected catalog identity');
ROLLBACK;

CREATE TEMP VIEW catalog_pause_rows AS SELECT jsonb_build_object(
 'base',(SELECT snapshot FROM baseline),
 'targets',(SELECT jsonb_agg(to_jsonb(t) ORDER BY source_id) FROM rmg_private.wa_catalog_review_targets_v1 t),
 'guides',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.guides t),
 'reviews',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.reviews t),
 'revisions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM rmg_private.review_revisions t),
 'reports',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.review_flags t),
 'audit',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.moderation_audit t)) AS snapshot;
CREATE TEMP TABLE before_pause AS SELECT snapshot FROM catalog_pause_rows;
\i :catalog_pause
\i :catalog_pause
SELECT public.fixture_assert((SELECT a.snapshot=b.snapshot FROM before_pause a CROSS JOIN catalog_pause_rows b)
 AND (SELECT a.snapshot=b.snapshot FROM before_catalog a CROSS JOIN baseline b)
 AND (SELECT enabled FROM rmg_private.claim_control_v1)
 AND (SELECT enabled FROM rmg_private.guide_offerings_control_v1)
 AND NOT (SELECT enabled FROM rmg_private.wa_catalog_review_control_v1),
 'repeat pause retains the exact data and keeps legacy map/pilot rows, Oregon claims, ratings and trips stable');
BEGIN READ ONLY;
SET LOCAL ROLE anon;
SELECT public.fixture_assert(public.rmg_public_review_summaries_v1(:'batch')=:'only_oregon'::jsonb
 AND NOT EXISTS(SELECT 1 FROM public.public_angler_reviews WHERE id IN (:'first_review',:'next_review'))
 AND NOT EXISTS(SELECT 1 FROM public.reviews WHERE id IN (:'first_review',:'next_review')),
 'first read-only request after pause omits both catalog cards and carrier reviews');
ROLLBACK;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
SELECT public.fixture_assert(public.rmg_my_submissions(0,50) @> jsonb_build_array(
 jsonb_build_object('id',:'first_review','jurisdiction','WA','source_id','wa-021'),
 jsonb_build_object('id',:'revision','jurisdiction','WA','source_id','wa-021','review_id',:'first_review')),
 'exact author review and revision receipts persist while bulk public access is paused');
SELECT public.fixture_offerings_denial(format($q$SELECT public.rmg_submit_revision_v2(%L,4::smallint,NULL,NULL,'Paused revision',true,'none',NULL,false,NULL)$q$,:'first_review'),'P5030');
RESET ROLE;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000007',true);
SELECT public.fixture_assert(public.rmg_claim_status_v1('OR','OG.0000036')->>'status'='none'
 AND public.rmg_submit_review_v2('OR','OG.0000036',4::smallint,NULL,NULL,
 'Synthetic unclaimed Oregon path stays writable',true,'none',NULL,NULL)->>'status'='pending',
 'ordinary Oregon review write still works after catalog pause');
ROLLBACK;
UPDATE rmg_private.wa_catalog_review_control_v1 SET enabled=true WHERE singleton;
BEGIN READ ONLY;
SET LOCAL ROLE anon;
SELECT public.fixture_assert(public.rmg_public_review_summaries_v1(:'batch')->'items'->0->>'averageQuality'='5.00',
 'reopening uses the same catalog carrier and approved review');
ROLLBACK;
\i :catalog_pause
