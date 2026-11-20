-- Run in the transaction opened by rollback-before, after the captured rollback.
SELECT public.fixture_assert((SELECT count(*)=3 FROM public.reviews r JOIN auto_rollback_receipts x ON r.id=(x.receipt->>'id')::uuid
 WHERE x.name LIKE 'published_%' AND r.status='published')
 AND NOT has_function_privilege('authenticated','rmg_private.publish_own_revision_v1(uuid)','EXECUTE'),
 'rollback preserves published posts and disables the direct automatic finalizer');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000172',true);
INSERT INTO auto_rollback_receipts VALUES('new_v1',public.rmg_submit_review('OR','OG.0000171.F&F',3::smallint,NULL,false,'Synthetic pending v1 review',true,'none',NULL));
INSERT INTO auto_rollback_receipts VALUES('new_v2',public.rmg_submit_review_v2('OR','OG.0000172.F&F',3::smallint,NULL,false,'Synthetic pending v2 review',true,'none',NULL,'2026-01'));
INSERT INTO auto_rollback_receipts VALUES('new_v3',public.rmg_submit_review_v3('OR','OG.0000173.F&F',3::smallint,NULL,false,'Synthetic pending v3 review',true,'none',NULL,'2026-01','{"equipment":2}'));
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000171',true);
INSERT INTO auto_rollback_receipts SELECT 'edit_v1',public.rmg_submit_revision((receipt->>'id')::uuid,1::smallint,NULL,false,
 'Synthetic pending v1 edit',true,'none',NULL) FROM auto_rollback_receipts WHERE name='published_171';
INSERT INTO auto_rollback_receipts SELECT 'edit_v2',public.rmg_submit_revision_v2((receipt->>'id')::uuid,1::smallint,NULL,false,
 'Synthetic pending v2 edit',true,'none',NULL,true,'2026-02') FROM auto_rollback_receipts WHERE name='published_172';
INSERT INTO auto_rollback_receipts SELECT 'edit_v3',public.rmg_submit_revision_v3((receipt->>'id')::uuid,1::smallint,NULL,false,
 'Synthetic pending v3 edit',true,'none',NULL,true,'2026-02','{"equipment":1}') FROM auto_rollback_receipts WHERE name='published_173';
SELECT public.fixture_assert((SELECT bool_and(receipt->>'status'='pending') FROM auto_rollback_receipts WHERE name LIKE 'new_%' OR name LIKE 'edit_%')
 AND public.rmg_review_summary('OR','OG.0000171.F&F') @> '{"count":1,"averageQuality":5}'
 AND public.rmg_review_summary('OR','OG.0000172.F&F') @> '{"count":1,"averageQuality":5}'
 AND public.rmg_review_summary('OR','OG.0000173.F&F') @> '{"count":1,"averageQuality":5}',
 'all three review/edit RPC versions return pending after rollback without changing published content');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000174',true);
INSERT INTO auto_rollback_receipts SELECT 'removed',public.rmg_resolve_report_v2((receipt->>'id')::uuid,
 'remove','Reported content') FROM auto_rollback_receipts WHERE name='flag';
SELECT public.fixture_assert((SELECT receipt @> '{"status":"resolved","review_status":"removed"}' FROM auto_rollback_receipts WHERE name='removed')
 AND public.rmg_review_summary('OR','OG.0000171.F&F') @> '{"count":0}',
 'keep/remove report moderation remains available after publication rollback');
RESET ROLE;
ROLLBACK;
