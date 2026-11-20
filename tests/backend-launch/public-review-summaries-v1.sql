\set ON_ERROR_STOP on

-- The accepted replay left one published Oregon review (5) and a pending one
-- (4) on the mapped unsuffixed guide, plus an exact mapped Oregon suffix.
INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference)
 VALUES ('OR','OG.0000003','10000000-0000-0000-0000-000000000003',now(),'synthetic hidden listing');
INSERT INTO public.reviews(guide_id,author_id,quality,body,status,published_at)
 VALUES ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000006',5,
 'Synthetic public review attached to a held listing','published',now());
SELECT $batch$[
 {"jurisdiction":"WA","sourceId":"wa-900001"},
 {"jurisdiction":"OR","sourceId":"OG.0001225.F&F"},
 {"jurisdiction":"OR","sourceId":"OG.0001225"},
 {"jurisdiction":"OR","sourceId":"OG.0000001"},
 {"jurisdiction":"OR","sourceId":"OG.0000003"},
 {"jurisdiction":"OR","sourceId":"OG.0001225.F&F"}
]$batch$::jsonb AS batch \gset

SET ROLE anon;
SELECT public.fixture_assert(public.rmg_public_review_summaries_v1(:'batch')='{"items":[
 {"jurisdiction":"OR","sourceId":"OG.0001225.F&F","count":0,"averageQuality":null},
 {"jurisdiction":"OR","sourceId":"OG.0000001","count":1,"averageQuality":5}
]}'::jsonb,'exact suffix, zero, deduplication and order; pending, held WA alias, hidden OR and stripped ID omitted');
SELECT public.fixture_assert(public.rmg_public_review_summaries_v1('[]')='{"items":[]}'::jsonb,
 'an empty batch returns an empty payload');
SELECT public.fixture_offerings_denial($q$SELECT public.rmg_public_review_summaries_v1('[null]')$q$,'22023');
SELECT public.fixture_offerings_denial($q$SELECT public.rmg_public_review_summaries_v1(
 (SELECT jsonb_agg('{"jurisdiction":"OR","sourceId":"OG.0000001"}'::jsonb) FROM generate_series(1,31)))$q$,'22023');
SELECT public.fixture_assert(jsonb_array_length(public.rmg_public_review_summaries_v1(
 (SELECT jsonb_agg('{"jurisdiction":"OR","sourceId":"OG.0000001"}'::jsonb) FROM generate_series(1,30))
 )->'items')=1,'the 30-entry bound admits a full directory page');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
SELECT public.rmg_submit_review_v2('OR','OG.0000001',3::smallint,NULL,true,
 'Synthetic second Oregon review',true,'none',NULL,NULL)->>'id' AS second_rating \gset
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.rmg_decide_submission('review',:'second_rating',true,'Synthetic human moderation of second review');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT public.rmg_submit_revision_v2('30000000-0000-0000-0000-000000000001',1::smallint,NULL,true,
 'Synthetic unpublished rating edit',true,'none',NULL,false,NULL)->>'id' AS rating_revision \gset
RESET ROLE;

SET ROLE anon;
SELECT public.fixture_assert(public.rmg_public_review_summaries_v1(:'batch')->'items'->1
 = '{"jurisdiction":"OR","sourceId":"OG.0000001","count":2,"averageQuality":4}'::jsonb,
 'pending revision stays private; both published reviews contribute to the average');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.fixture_assert(public.rmg_public_review_summaries_v1(:'batch')->'items'->1->>'averageQuality'='4.00',
 'moderator cannot receive pending rating in the public batch');
SELECT public.rmg_decide_revision(:'rating_revision',true,'Synthetic moderator approved the revised score');
RESET ROLE;

SET ROLE anon;
SELECT public.fixture_assert(
 public.rmg_public_review_summaries_v1(:'batch')->'items'->1
 = '{"jurisdiction":"OR","sourceId":"OG.0000001","count":2,"averageQuality":2}'::jsonb
 AND (public.rmg_public_review_summaries_v1(:'batch')->'items'->1)-'jurisdiction'-'sourceId'
 = public.rmg_review_summary('OR','OG.0000001')-'wouldBookAgainResponses'-'wouldBookAgainPercent',
 'published revision updates the average and exact profile parity without changing count');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
SELECT public.rmg_submit_review_v2('OR','OG.0001225.F&F',4::smallint,NULL,true,
 'Synthetic review for exact suffix',true,'none',NULL,NULL)->>'id' AS suffix_rating \gset
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.rmg_decide_submission('review',:'suffix_rating',true,'Synthetic moderation of exact suffix review');
RESET ROLE;
SET ROLE anon;
SELECT public.fixture_assert(public.rmg_public_review_summaries_v1(:'batch')->'items'->0
 = '{"jurisdiction":"OR","sourceId":"OG.0001225.F&F","count":1,"averageQuality":4}'::jsonb,
 'the exact ampersand source gets its own published rating without falling back to the stripped source');
RESET ROLE;

BEGIN;
UPDATE rmg_private.launch_control SET enabled=false;
SET LOCAL ROLE anon;
SELECT public.fixture_offerings_denial($q$SELECT public.rmg_public_review_summaries_v1('[]')$q$,'P5030');
ROLLBACK;
