\set ON_ERROR_STOP on
SELECT rmg_private.prepare_wa_listed_review_identity_v1('wa-001',repeat('a',64),repeat('b',64),repeat('c',64),repeat('d',64));
SELECT rmg_private.prepare_wa_listed_review_identity_v1('wa-002',repeat('e',64),repeat('f',64),repeat('1',64),repeat('2',64));
SELECT rmg_private.prepare_wa_listed_review_carrier_v1('wa-001',repeat('b',64),repeat('d',64)) AS anchor \gset
SELECT rmg_private.prepare_wa_listed_review_carrier_v1('wa-002',repeat('f',64),repeat('2',64));
SELECT 'wa-001@'||repeat('b',64) AS listed,
 jsonb_build_array(jsonb_build_object('jurisdiction','WA','sourceId','wa-001@'||repeat('b',64)),
  '{"jurisdiction":"OR","sourceId":"OG.0001225.F&F"}'::jsonb,
  jsonb_build_object('jurisdiction','WA','sourceId','wa-001@'||repeat('9',64)),
  jsonb_build_object('jurisdiction','WA','sourceId','wa-002@'||repeat('f',64)),
  jsonb_build_object('jurisdiction','WA','sourceId','wa-900001@'||repeat('b',64)),
  '{"jurisdiction":"WA","sourceId":"wa-001"}'::jsonb,
  jsonb_build_object('jurisdiction','WA','sourceId','wa-003@'||repeat('3',64)),
  '{"jurisdiction":"OR","sourceId":"OG.0001225"}'::jsonb,
  jsonb_build_object('jurisdiction','WA','sourceId','wa-001@'||repeat('b',64))) AS batch \gset
SET ROLE anon;
SELECT public.rmg_public_review_summaries_v1(:'batch') AS oregon_only \gset
SELECT public.fixture_assert(:'oregon_only'::jsonb='{"items":[
 {"jurisdiction":"OR","sourceId":"OG.0001225.F&F","count":1,"averageQuality":4}]}',
 'default closure retains Oregon exact suffix and excludes versioned, held and unmapped WA');
RESET ROLE;

UPDATE rmg_private.wa_listed_review_identity_v1 SET enabled=true WHERE source_id='wa-001';
SET ROLE anon;
SELECT public.fixture_assert(public.rmg_public_review_summaries_v1(:'batch')='{"items":[
 {"jurisdiction":"WA","sourceId":"wa-001","count":0,"averageQuality":null},
 {"jurisdiction":"OR","sourceId":"OG.0001225.F&F","count":1,"averageQuality":4}]}',
 'admitted zero projects the bare source once in input order; stale, legacy, unversioned and held neighbors are omitted');
SELECT public.fixture_offerings_denial($q$SELECT public.rmg_public_review_summaries_v1(
 (SELECT jsonb_agg('{"jurisdiction":"WA","sourceId":"wa-001"}'::jsonb) FROM generate_series(1,31)))$q$,'22023');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
SELECT public.rmg_submit_review_v2('WA',:'listed',3::smallint,NULL,NULL,
 'Synthetic Washington rating',true,'none',NULL,NULL)->>'id' AS wa_review \gset
SELECT public.fixture_assert(public.rmg_public_review_summaries_v1(:'batch')->'items'->0->>'count'='0',
 'the author cannot see their pending rating through the public batch');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.fixture_assert(public.rmg_public_review_summaries_v1(:'batch')->'items'->0->>'count'='0',
 'the moderator cannot see a pending rating through the public batch');
SELECT public.rmg_decide_submission('review',:'wa_review',true,'Synthetic verified first Washington review');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
SELECT public.rmg_submit_revision_v2(:'wa_review',5::smallint,NULL,NULL,
 'Synthetic unpublished score edit',true,'none',NULL,false,NULL)->>'id' AS wa_revision \gset
RESET ROLE;

SET ROLE anon;
SELECT public.fixture_assert(public.rmg_public_review_summaries_v1(:'batch')->'items'->0
 ='{"jurisdiction":"WA","sourceId":"wa-001","count":1,"averageQuality":3}',
 'published review appears while its unapproved edit stays private');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.rmg_decide_revision(:'wa_revision',true,'Synthetic verified Washington review revision');
RESET ROLE;
SET ROLE anon;
SELECT public.fixture_assert(public.rmg_public_review_summaries_v1(:'batch')->'items'->0
 ='{"jurisdiction":"WA","sourceId":"wa-001","count":1,"averageQuality":5}'
 AND (public.rmg_public_review_summaries_v1(:'batch')->'items'->0)-'jurisdiction'-'sourceId'
 = public.rmg_review_summary('WA',:'listed')-'wouldBookAgainResponses'-'wouldBookAgainPercent',
 'approved revision has exact profile parity and leaks no private fields');
RESET ROLE;

-- PostgREST calls a STABLE RPC in a read-only transaction even on POST.
BEGIN READ ONLY;
SET LOCAL ROLE anon;
SELECT public.fixture_assert(
 public.rmg_review_summary('WA',:'listed')->>'count'='1'
 AND public.rmg_review_write_availability('WA',:'listed')='{"available":false}'
 AND public.rmg_public_review_summaries_v1(:'batch')=:'oregon_only'::jsonb,
 'reproduced pre-repair batch omission in read-only mode while the published WA profile summary is present');
ROLLBACK;

\i :readonly_fix
BEGIN READ ONLY;
SET LOCAL ROLE anon;
SELECT public.fixture_assert(public.rmg_public_review_summaries_v1(:'batch')='{"items":[
 {"jurisdiction":"WA","sourceId":"wa-001","count":1,"averageQuality":5},
 {"jurisdiction":"OR","sourceId":"OG.0001225.F&F","count":1,"averageQuality":4}]}',
 'repaired read-only public batch restores exact approved WA and Oregon scores and omits held/stale/unmapped sources');
ROLLBACK;

BEGIN;
UPDATE rmg_private.wa_review_pilot_v1 SET enabled=true,source_id='wa-900001',
 guide_id='10000000-0000-0000-0000-000000000001',packet_sha256=repeat('3',64) WHERE singleton;
SET LOCAL ROLE anon;
SELECT public.fixture_assert(public.rmg_public_review_summaries_v1(:'batch')=:'oregon_only'::jsonb,
 'prospective and listed conflict closes WA summaries without changing Oregon');
ROLLBACK;
\i :listed_pause
\i :listed_pause
BEGIN READ ONLY;
SET LOCAL ROLE anon;
SELECT public.fixture_assert(public.rmg_public_review_summaries_v1(:'batch')=:'oregon_only'::jsonb,
 'after committed WA pause the next read-only batch omits WA and preserves Oregon without caching');
ROLLBACK;
SELECT public.fixture_assert(EXISTS (SELECT 1 FROM public.reviews WHERE id=:'wa_review' AND guide_id=:'anchor'
  AND status='published' AND quality=5),'WA pause retained the exact accepted review');

BEGIN;
UPDATE rmg_private.launch_control SET enabled=false;
SET LOCAL ROLE anon;
SELECT public.fixture_offerings_denial($q$SELECT public.rmg_public_review_summaries_v1('[]')$q$,'P5030');
ROLLBACK;
