\set ON_ERROR_STOP on
BEGIN;

INSERT INTO public.guides(id,slug,full_name,listing_status)
 VALUES ('10000000-0000-0000-0000-000000000090','synthetic-oregon-richer-review','Synthetic Oregon guide','published');
INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference)
 VALUES ('OR','OG.0000090.F&F','10000000-0000-0000-0000-000000000090',now(),'synthetic richer reviews');
INSERT INTO auth.users(id,email_confirmed_at) VALUES
 ('00000000-0000-0000-0000-000000000031',now()),('00000000-0000-0000-0000-000000000032',now());
SELECT rmg_private.seed_wa_review_catalog_v1(jsonb_build_array(jsonb_build_object(
 'sourceId','wa-090','sourceKeySha256',repeat('d0',32),'listingSha256',repeat('e0',32),'holdReason',NULL)));
SELECT 'wa-090@catalog:'||repeat('e0',32) AS wa_source \gset
UPDATE rmg_private.wa_catalog_review_control_v1 SET enabled=true WHERE singleton;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000031',true);
SELECT public.fixture_offerings_denial($q$SELECT public.rmg_submit_review_v3('OR','OG.0000090.F&F',5::smallint,NULL,NULL,'Synthetic strict rating',true,'none',NULL,NULL,'{}')$q$,'22023');
SELECT public.fixture_offerings_denial($q$SELECT public.rmg_submit_review_v3('OR','OG.0000090.F&F',NULL,NULL,true,'Synthetic strict rating',true,'none',NULL,NULL,'{}')$q$,'22023');
SELECT public.fixture_offerings_denial($q$SELECT public.rmg_submit_review_v3('OR','OG.0000090.F&F',5::smallint,NULL,true,'Synthetic strict rating',true,'none',NULL,NULL,'{"communication":2.5}')$q$,'22023');
SELECT public.fixture_offerings_denial($q$SELECT public.rmg_submit_review_v3('OR','OG.0000090.F&F',5::smallint,NULL,true,'Synthetic strict rating',true,'none',NULL,NULL,'{"communication":null}')$q$,'22023');
SELECT public.rmg_submit_review_v3('OR','OG.0000090.F&F',4::smallint,NULL,false,'Synthetic Oregon review',true,'none',NULL,'2026-01',
 '{"communication":5,"professionalism":4,"safety":3,"equipment":2,"knowledge":1,"effort":4,"value":3}')->>'id' AS or_review \gset
SELECT public.rmg_submit_review_v3('WA',:'wa_source',3::smallint,NULL,true,'Synthetic Washington review',true,'none',NULL,NULL,
 '{"equipment":5,"effort":2}')->>'id' AS wa_review \gset
SELECT public.fixture_offerings_denial($q$SELECT public.rmg_revision_queue(0,100)$q$,'42501');

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000032',true);
SELECT public.rmg_submit_review_v2('OR','OG.0000090.F&F',2::smallint,NULL,NULL,'Synthetic legacy review',true,'none',NULL,NULL)->>'id' AS legacy_review \gset

SET LOCAL ROLE anon;
SELECT public.fixture_assert(NOT EXISTS(SELECT 1 FROM public.public_angler_reviews WHERE id IN (:'or_review',:'wa_review',:'legacy_review'))
 AND public.rmg_review_summary('OR','OG.0000090.F&F')->>'count'='0'
 AND public.rmg_review_summary('WA',:'wa_source')->>'count'='0',
 'richer pending reviews are absent from published detail and both aggregates');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
SELECT public.fixture_assert(EXISTS(SELECT 1 FROM public.admin_pending_reviews WHERE id=:'or_review'
 AND communication=5 AND professionalism=4 AND safety=3 AND equipment=2 AND knowledge=1 AND effort=4 AND value_rating=3)
 AND EXISTS(SELECT 1 FROM public.admin_pending_reviews WHERE id=:'wa_review' AND equipment=5 AND communication IS NULL
 AND catalog_source_id='wa-090' AND catalog_listing_sha256=repeat('e0',32)),
 'moderation shows original richer ratings and exact WA queue identity');
SELECT public.rmg_decide_submission('review',:'or_review',true,'Synthetic Oregon review approval');
SELECT public.rmg_decide_submission('review',:'wa_review',true,'Synthetic Washington review approval');
SELECT public.rmg_decide_submission('review',:'legacy_review',true,'Synthetic legacy review approval');

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000031',true);
SELECT public.rmg_submit_revision_v3(:'or_review',5::smallint,NULL,NULL,'Synthetic Oregon revision',true,'none',NULL,false,NULL,
 '{"communication":null,"equipment":4}')->>'id' AS or_edit \gset
SELECT public.rmg_submit_revision_v3(:'wa_review',2::smallint,NULL,false,'Synthetic Washington revision',true,'none',NULL,false,NULL,
 '{"knowledge":3,"effort":null}')->>'id' AS wa_edit \gset
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000032',true);
SELECT public.rmg_submit_revision_v3(:'legacy_review',2::smallint,NULL,NULL,'Synthetic legacy text revision',true,'none',NULL,false,NULL,
 '{}')->>'id' AS legacy_edit \gset

SET LOCAL ROLE anon;
SELECT public.fixture_assert(EXISTS(SELECT 1 FROM public.public_angler_reviews WHERE id=:'or_review'
 AND quality=4 AND communication=5 AND equipment=2 AND would_book_again=false AND trip_month='2026-01-01')
 AND EXISTS(SELECT 1 FROM public.public_angler_reviews WHERE id=:'wa_review'
 AND quality=3 AND equipment=5 AND knowledge IS NULL AND effort=2 AND would_book_again=true)
 AND public.rmg_review_summary('OR','OG.0000090.F&F') @> '{"count":2,"averageQuality":3,"wouldBookAgainPercent":0,"wouldBookAgainResponses":1}'
 AND public.rmg_review_summary('WA',:'wa_source') @> '{"count":1,"averageQuality":3,"wouldBookAgainPercent":100,"wouldBookAgainResponses":1}',
 'pending revisions keep published detail and aggregates stable, historical non-response excluded');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
SELECT public.fixture_assert(public.rmg_revision_queue(0,100) @> jsonb_build_array(
 jsonb_build_object('id',:'or_edit','communication',NULL,'equipment',4,'professionalism',4,'would_book_again',false),
 jsonb_build_object('id',:'wa_edit','catalog_source_id','wa-090','knowledge',3,'effort',NULL,'equipment',5,'would_book_again',false),
 jsonb_build_object('id',:'legacy_edit','communication',NULL,'would_book_again',NULL)),
 'revision queue displays effective proposed ratings, including a clear and a historical unknown');
SELECT public.rmg_decide_revision(:'or_edit',true,'Synthetic Oregon revision approval');
SELECT public.rmg_decide_revision(:'wa_edit',true,'Synthetic Washington revision approval');
SELECT public.rmg_decide_revision(:'legacy_edit',true,'Synthetic legacy revision approval');

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000031',true);
SELECT public.rmg_submit_revision_v3(:'wa_review',1::smallint,NULL,true,'Synthetic rejected Washington revision',true,'none',NULL,false,NULL,
 '{"equipment":1}')->>'id' AS rejected_edit \gset
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
SELECT public.rmg_decide_revision(:'rejected_edit',false,'Synthetic Washington revision rejection');

SET LOCAL ROLE anon;
SELECT public.fixture_assert(EXISTS(SELECT 1 FROM public.public_angler_reviews WHERE id=:'or_review'
 AND quality=5 AND communication IS NULL AND equipment=4 AND professionalism=4 AND safety=3
 AND knowledge=1 AND effort=4 AND value_rating=3 AND would_book_again=false AND trip_month='2026-01-01')
 AND EXISTS(SELECT 1 FROM public.public_angler_reviews WHERE id=:'wa_review'
 AND quality=2 AND equipment=5 AND knowledge=3 AND effort IS NULL AND would_book_again=false)
 AND EXISTS(SELECT 1 FROM public.public_angler_reviews WHERE id=:'legacy_review' AND communication IS NULL
 AND professionalism IS NULL AND safety IS NULL AND equipment IS NULL AND knowledge IS NULL AND effort IS NULL
 AND value_rating IS NULL AND would_book_again IS NULL)
 AND public.rmg_review_summary('OR','OG.0000090.F&F') @> '{"count":2,"averageQuality":3.5,"wouldBookAgainPercent":0,"wouldBookAgainResponses":1}'
 AND public.rmg_review_summary('WA',:'wa_source') @> '{"count":1,"averageQuality":2,"wouldBookAgainPercent":0,"wouldBookAgainResponses":1}'
 AND public.rmg_public_review_summaries_v1(jsonb_build_array(
 jsonb_build_object('jurisdiction','OR','sourceId','OG.0000090.F&F'),
 jsonb_build_object('jurisdiction','WA','sourceId',:'wa_source'))) @> '{"items":[
 {"jurisdiction":"OR","sourceId":"OG.0000090.F&F","count":2,"averageQuality":3.5},
 {"jurisdiction":"WA","sourceId":"wa-090","count":1,"averageQuality":2}]}',
 'approved edits replace only specified metrics, rejection changes nothing, prior nulls and overall aggregates remain correct');

RESET ROLE;
UPDATE rmg_private.wa_catalog_review_control_v1 SET enabled=false WHERE singleton;
SET LOCAL ROLE anon;
SELECT public.fixture_assert(NOT EXISTS(SELECT 1 FROM public.public_angler_reviews WHERE id=:'wa_review')
 AND EXISTS(SELECT 1 FROM public.public_angler_reviews WHERE id=:'or_review'),
 'WA-only pause hides richer Washington reviews and leaves Oregon published');
ROLLBACK;
