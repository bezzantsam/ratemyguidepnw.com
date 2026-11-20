\set ON_ERROR_STOP on
SELECT 'wa-001@'||repeat('b',64) AS listed_source, 'wa-002@'||repeat('f',64) AS held_source,
 'wa-001@'||repeat('9',64) AS stale_source \gset
SELECT review_identity AS anchor FROM rmg_private.wa_listed_review_identity_v1 WHERE source_id='wa-001' \gset
SELECT public.fixture_assert(rmg_private.prepare_wa_listed_review_carrier_v1('wa-001',repeat('b',64),repeat('d',64))=:'anchor'::uuid,
 'owner materializes reviewed UUID as an opaque draft without a directory or legacy mapping');
SELECT public.fixture_wa_denial($q$SELECT rmg_private.prepare_wa_listed_review_carrier_v1('wa-002',repeat('f',64),repeat('d',64))$q$,'P5030');
SELECT public.fixture_wa_denial($q$UPDATE public.guides SET listing_status='published' WHERE slug LIKE 'wa-review-anchor-%'$q$,'42501');
SELECT public.fixture_wa_denial($q$UPDATE public.guides SET slug='different' WHERE slug LIKE 'wa-review-anchor-%'$q$,'42501');

SET ROLE anon;
SELECT public.fixture_assert(NOT EXISTS (SELECT 1 FROM public.guides WHERE id=:'anchor')
 AND public.rmg_review_write_availability('WA',:'listed_source')='{"available":false}'
 AND public.rmg_review_write_availability('OR','one')='{"available":true}',
 'carrier is invisible in guide discovery, listing defaults closed and Oregon remains ready');
RESET ROLE;
UPDATE rmg_private.wa_listed_review_identity_v1 SET enabled=true WHERE source_id='wa-001';

SET ROLE anon;
SELECT public.fixture_assert(public.rmg_review_write_availability('WA',:'listed_source')='{"available":true}'
 AND public.rmg_review_write_availability('WA',:'held_source')='{"available":false}'
 AND public.rmg_review_write_availability('WA',:'stale_source')='{"available":false}'
 AND public.rmg_review_write_availability('WA','wa-001')='{"available":false}'
 AND public.rmg_resolve_review_target_v1('WA',:'listed_source')=:'anchor'::uuid,
 'only the exact listed version resolves and held neighbor, stale version and bare ID stay closed');
SELECT public.fixture_wa_denial($q$SELECT public.rmg_resolve_guide('WA','wa-001')$q$,'P0002');
SELECT public.fixture_assert((public.rmg_review_summary('OR','one') ? 'wouldBookAgainResponses'),
 'existing Oregon summary fields are preserved');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
SELECT public.fixture_wa_denial(format($q$SELECT public.rmg_submit_review_v2('WA',%L,4::smallint,NULL,NULL,'Wrong version',true,'none',NULL,NULL)$q$, :'stale_source'),'P5030');
SELECT public.fixture_wa_denial(format($q$SELECT public.rmg_submit_review_v2('WA',%L,4::smallint,NULL,NULL,'Held neighbor',true,'none',NULL,NULL)$q$, :'held_source'),'P5030');
SELECT (r->>'id') AS listed_review, (r->>'status') AS listed_status FROM
 (SELECT public.rmg_submit_review_v2('WA',:'listed_source',3::smallint,NULL,true,
 'Synthetic firsthand review for existing Washington profile',true,'none',NULL,'2026-05') r) payload \gset
SELECT public.fixture_assert(:'listed_status'='pending'
 AND public.rmg_own_review_for_guide('WA',:'listed_source')->>'id'=:'listed_review'
 AND public.rmg_my_submissions(0,10) @> jsonb_build_array(jsonb_build_object('id',:'listed_review','jurisdiction','WA','source_id','wa-001'))
 AND NOT EXISTS (SELECT 1 FROM public.admin_pending_reviews WHERE id=:'listed_review'),
 'confirmed ordinary author receives pending receipt at existing profile, without queue access');
RESET ROLE;
SET ROLE anon;
SELECT public.fixture_assert(NOT EXISTS (SELECT 1 FROM public.public_angler_reviews WHERE id=:'listed_review')
 AND (public.rmg_review_summary('WA',:'listed_source')->>'count')::integer=0,
 'pending review and rating are private');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.fixture_assert(EXISTS (SELECT 1 FROM public.admin_pending_reviews WHERE id=:'listed_review'),
 'independent moderator sees pending listed review');
SELECT public.fixture_assert(public.rmg_decide_submission('review',:'listed_review',true,'Synthetic independently verified trip')->>'status'='published',
 'moderator publishes listed review through existing decision RPC');
RESET ROLE;
SET ROLE anon;
SELECT public.fixture_assert(NOT EXISTS(SELECT 1 FROM public.guides WHERE id=:'anchor')
 AND EXISTS(SELECT 1 FROM public.public_angler_reviews WHERE id=:'listed_review' AND quality=3)
 AND (public.rmg_review_summary('WA',:'listed_source')->>'averageQuality')::numeric=3
 AND (public.rmg_review_summary('WA',:'listed_source')->>'wouldBookAgainPercent')::numeric=100,
 'published review and rating visible through exact listed target while neutral guide stays hidden');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
SELECT (public.rmg_submit_revision_v2(:'listed_review',5::smallint,NULL,false,
 'Synthetic author correction for listed guide',true,'none',NULL,false,NULL)->>'id') AS listed_revision \gset
SELECT public.fixture_assert((public.rmg_review_summary('WA',:'listed_source')->>'averageQuality')::numeric=3,
 'pending author revision leaves original public score unchanged');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.fixture_assert(public.rmg_revision_queue(0,40) @> jsonb_build_array(jsonb_build_object('id',:'listed_revision','source_id','wa-001','jurisdiction','WA'))
 AND public.rmg_decide_revision(:'listed_revision',true,'Synthetic independently verified correction')->>'status'='approved',
 'revision queue carries the stable ID and existing moderator RPC approves the revision');
RESET ROLE;

SET ROLE anon;
SELECT public.fixture_assert((public.rmg_review_summary('WA',:'listed_source')->>'averageQuality')::numeric=5
 AND EXISTS (SELECT 1 FROM public.public_angler_reviews WHERE id=:'listed_review' AND trip_month='2026-05-01'),
 'updated score is public and omitted trip month is preserved');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
SELECT (public.rmg_report_review('WA',:'listed_source',:'listed_review','other')->>'id') AS listed_report \gset
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.fixture_assert(public.rmg_report_queue(0,40) @> jsonb_build_array(jsonb_build_object('id',:'listed_report','source_id','wa-001','jurisdiction','WA'))
 AND public.rmg_resolve_report(:'listed_report')->>'status'='resolved',
 'existing report and moderation contracts resolve the exact listed target');
RESET ROLE;

BEGIN;
UPDATE rmg_private.claim_control_v1 SET enabled=true WHERE singleton;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',true);
SELECT public.fixture_wa_denial(format($q$SELECT public.rmg_submit_claim('WA',%L,'Synthetic Actor',NULL,'Synthetic separate ownership claim')$q$, :'listed_source'),'P5030');
ROLLBACK;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
SELECT (public.rmg_submit_review_v2('WA',:'listed_source',4::smallint,NULL,NULL,
 'Synthetic pending listed review retained across pause',true,'none',NULL,NULL)->>'id') AS listed_pending \gset
RESET ROLE;

CREATE TEMP VIEW listed_adapter_snapshot AS SELECT jsonb_build_object(
 'reviews',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.reviews r),
 'revisions',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM rmg_private.review_revisions r),
 'binding',(SELECT jsonb_agg(to_jsonb(w)-'enabled' ORDER BY w.source_id)
  FROM rmg_private.wa_listed_review_identity_v1 w),
 'reports',(SELECT jsonb_agg(to_jsonb(f) ORDER BY id) FROM public.review_flags f),
 'audit',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.moderation_audit a),
 'claims',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.guide_claims c),
 'guides',(SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM public.guides g),
 'maps',(SELECT jsonb_agg(to_jsonb(m) ORDER BY jurisdiction,source_id) FROM rmg_private.guide_identity_map m)) AS data;
CREATE TEMP TABLE listed_adapter_before AS SELECT data FROM listed_adapter_snapshot;
SELECT jsonb_build_object('reviews',(SELECT count(*) FROM public.reviews),
 'revisions',(SELECT count(*) FROM rmg_private.review_revisions),
 'reports',(SELECT count(*) FROM public.review_flags),
 'audit',(SELECT count(*) FROM public.moderation_audit),
 'guides',(SELECT count(*) FROM public.guides),
 'maps',(SELECT count(*) FROM rmg_private.guide_identity_map),
 'claims',(SELECT count(*) FROM public.guide_claims)) AS before_listed_pause;
\i :listed_disable_sql
\i :listed_disable_sql
SELECT public.fixture_assert((SELECT a.data=b.data FROM listed_adapter_snapshot a CROSS JOIN listed_adapter_before b)
 AND (SELECT enabled FROM rmg_private.launch_control)
 AND (SELECT NOT enabled FROM rmg_private.claim_control_v1),
 'repeat WA-only pause preserves all reviews, revisions, audit, claims, guides and mapping rows');

SET ROLE anon;
SELECT public.fixture_assert(public.rmg_review_write_availability('WA',:'listed_source')='{"available":false}'
 AND public.rmg_review_write_availability('OR','one')='{"available":true}'
 AND NOT EXISTS(SELECT 1 FROM public.public_angler_reviews WHERE id=:'listed_review')
 AND NOT EXISTS(SELECT 1 FROM public.reviews WHERE id=:'listed_review'),
 'pause closes listed WA reads and readiness through view and direct table while Oregon stays available');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
SELECT public.fixture_wa_denial(format($q$SELECT public.rmg_submit_revision_v2(%L,4::smallint,NULL,NULL,'Synthetic after pause',true,'none',NULL,false,NULL)$q$, :'listed_review'),'P5030');
SELECT public.fixture_assert(public.rmg_my_submissions(0,10) @> jsonb_build_array(jsonb_build_object('id',:'listed_review','source_id','wa-001')),
 'author receipt survives pause without reopening public reviews');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.fixture_assert(NOT EXISTS (SELECT 1 FROM public.admin_pending_reviews WHERE id=:'listed_pending'),
 'wa-only pause excludes the retained pending review from moderation');
SELECT public.fixture_wa_denial(format($q$SELECT public.rmg_decide_submission('review',%L,true,'Synthetic disabled decision')$q$,
 :'listed_pending'),'P5030');
RESET ROLE;
