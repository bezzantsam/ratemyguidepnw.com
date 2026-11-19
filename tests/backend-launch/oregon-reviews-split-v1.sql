\set ON_ERROR_STOP on
BEGIN;

SELECT public.fixture_assert((SELECT NOT enabled FROM rmg_private.launch_control WHERE singleton)
 AND (SELECT NOT enabled FROM rmg_private.claim_control_v1 WHERE singleton), 'both gates default closed');
SELECT public.fixture_assert(NOT has_table_privilege('authenticated','rmg_private.claim_control_v1','UPDATE')
 AND NOT has_table_privilege('authenticated','rmg_private.claim_control_v1','SELECT')
 AND NOT has_table_privilege('authenticated','rmg_private.guide_identity_map','SELECT')
 AND NOT has_function_privilege('authenticated','rmg_private.has_oregon_review_guide_v1(uuid)','EXECUTE'),
 'clients cannot open the claim gate or read private mappings');

CREATE FUNCTION public.fixture_split_denial(statement text, expected text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  EXECUTE statement;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE = expected THEN RETURN; END IF;
  RAISE;
 END;
 RAISE EXCEPTION 'Expected SQLSTATE % for fixture call', expected;
END $$;

UPDATE rmg_private.launch_control SET enabled=true WHERE singleton;
INSERT INTO public.guides(id,slug,full_name,listing_status) VALUES
 ('10000000-0000-0000-0000-000000000004','fixture-wa','Fixture WA','published'),
 ('10000000-0000-0000-0000-000000000005','fixture-unmapped','Fixture unmapped','published');
INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference) VALUES
 ('OR','one','10000000-0000-0000-0000-000000000001',now(),'fixture'),
 ('WA','one-wa','10000000-0000-0000-0000-000000000001',now(),'fixture'),
 ('OR','two','10000000-0000-0000-0000-000000000002',now(),'fixture'),
 ('WA','wa-only','10000000-0000-0000-0000-000000000004',now(),'fixture');
INSERT INTO public.reviews(id,guide_id,author_id,quality,body,status,created_at,published_at) VALUES
 ('31000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000002',4,repeat('WA content ',10),'pending','2020-01-01',NULL),
 ('31000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000003',4,repeat('WA content ',10),'published','2020-01-01',now()),
 ('31000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000002',4,repeat('unmapped content ',10),'pending','2020-01-01',NULL);

SET ROLE anon;
SELECT public.fixture_assert((public.rmg_review_write_availability('OR','one')->>'available')::boolean
 AND public.rmg_review_write_availability('WA','wa-only')='{"available":false}'::jsonb
 AND rmg_private.review_write_availability('WA','one-wa')='{"available":false}'::jsonb
 AND public.rmg_review_write_availability(NULL,'one')='{"available":false}'::jsonb,
 'readiness advertises Oregon only, including WA alias and null');
SELECT public.fixture_assert(public.rmg_resolve_guide('WA','wa-only')='10000000-0000-0000-0000-000000000004',
 'shared historical read resolver still resolves WA');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
SELECT public.fixture_split_denial($q$SELECT public.rmg_submit_review('WA','one-wa',4::smallint,NULL,NULL,'review',true,'none',NULL)$q$,'P5030');
SELECT public.fixture_split_denial($q$SELECT rmg_private.submit_review(NULL,'one',4::smallint,NULL,NULL,'review',true,'none',NULL)$q$,'P5030');
SELECT public.fixture_split_denial($q$SELECT public.rmg_submit_review_v2('WA','wa-only',4::smallint,NULL,NULL,'review',true,'none',NULL,'2026-05')$q$,'P5030');
SELECT public.fixture_split_denial($q$SELECT rmg_private.submit_review_v2(NULL,'one',4::smallint,NULL,NULL,'review',true,'none',NULL,'2026-05')$q$,'P5030');
SELECT public.fixture_split_denial($q$SELECT public.rmg_report_review('WA','wa-only','31000000-0000-0000-0000-000000000002','other')$q$,'P5030');
SELECT public.fixture_split_denial($q$SELECT rmg_private.report_review(NULL,'one','30000000-0000-0000-0000-000000000001','other')$q$,'P5030');
SELECT public.fixture_split_denial($q$SELECT public.rmg_submit_revision('31000000-0000-0000-0000-000000000002',4::smallint,NULL,NULL,'revision',true,'none',NULL)$q$,'P5030');
SELECT public.fixture_split_denial($q$SELECT rmg_private.submit_revision_v2('31000000-0000-0000-0000-000000000002',4::smallint,NULL,NULL,'revision',true,'none',NULL,true,'2026-05')$q$,'P5030');
SELECT public.fixture_split_denial($q$SELECT public.rmg_submit_claim('OR','one','Test owner',NULL,'Synthetic ownership evidence')$q$,'P5030');
SELECT public.fixture_split_denial($q$SELECT rmg_private.submit_claim('OR','one','Test owner',NULL,'Synthetic ownership evidence')$q$,'P5030');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.admin_pending_reviews)
 AND NOT rmg_private.review_queue_eligible_v1('10000000-0000-0000-0000-000000000001'),
 'ordinary user cannot read queue or ask queue predicate for mapping');
SELECT public.fixture_split_denial($q$SELECT public.rmg_report_queue(0,1)$q$,'42501');
SELECT public.fixture_split_denial($q$SELECT public.rmg_revision_queue(0,1)$q$,'42501');
SELECT public.fixture_assert(public.rmg_submit_review_v2('OR','one',4::smallint,NULL,NULL,'test review',true,'none',NULL,'2026-05')->>'status'='pending',
 'Oregon review v2 works while claims remain closed');
SELECT public.fixture_assert(public.rmg_report_review('OR','one','30000000-0000-0000-0000-000000000001','other')->>'status'='submitted',
 'Oregon report works while claims remain closed');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
SELECT public.fixture_split_denial($q$SELECT public.rmg_edit_details('OR','one','Boat','Gear',5::smallint,'Expertise','Species')$q$,'P5030');
SELECT public.fixture_split_denial($q$SELECT rmg_private.edit_details('OR','one','Boat','Gear',5::smallint,'Expertise','Species')$q$,'P5030');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
SELECT public.fixture_assert(public.rmg_submit_revision_v2('30000000-0000-0000-0000-000000000001',4::smallint,NULL,NULL,'Oregon revision',true,'none',NULL,true,'2026-05')->>'status'='pending',
 'Oregon UUID revision works for a guide with a reviewed OR and WA identity');
RESET ROLE;

INSERT INTO rmg_private.review_revisions(id,review_id,submitter_id,quality,body,relationship_disclosure,created_at)
 VALUES('32000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003',4,'WA revision','none','2020-01-01');
INSERT INTO public.review_flags(id,review_id,reporter_id,reason,created_at)
 VALUES('33000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','other','2020-01-01');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
SELECT public.fixture_assert((SELECT id FROM public.admin_pending_reviews ORDER BY created_at,id LIMIT 1)='30000000-0000-0000-0000-000000000002'
 AND (SELECT count(*)=1 FROM (SELECT id FROM public.admin_pending_reviews ORDER BY created_at,id OFFSET 1 LIMIT 1) next_page)
 AND (SELECT count(*)=2 FROM public.admin_pending_reviews),
 'review queue filters WA and unmapped rows before stable paging');
SELECT public.fixture_assert(public.rmg_revision_queue(0,1)->0->>'jurisdiction'='OR' AND public.rmg_revision_queue(1,1)='[]'::jsonb,
 'revision queue filters WA before pagination');
SELECT public.fixture_assert(public.rmg_report_queue(0,1)->0->>'jurisdiction'='OR' AND public.rmg_report_queue(1,1)='[]'::jsonb,
 'report queue filters WA before pagination');
SELECT public.fixture_split_denial($q$SELECT public.rmg_decide_submission('claim','20000000-0000-0000-0000-000000000002',true,'Verified synthetic approval reason')$q$,'P5030');
SELECT public.fixture_split_denial($q$SELECT rmg_private.decide_submission('claim','20000000-0000-0000-0000-000000000002',false,'Synthetic rejection')$q$,'P5030');
SELECT public.fixture_split_denial($q$SELECT public.admin_decide_claim('20000000-0000-0000-0000-000000000002',true,'Verified synthetic approval reason')$q$,'42501');
SELECT public.fixture_split_denial($q$SELECT public.rmg_decide_submission('review','31000000-0000-0000-0000-000000000001',true,'Verified synthetic approval reason')$q$,'P5030');
SELECT public.fixture_split_denial($q$SELECT rmg_private.decide_submission('review','31000000-0000-0000-0000-000000000003',false,'Synthetic rejection')$q$,'P5030');
SELECT public.fixture_split_denial($q$SELECT public.rmg_decide_revision('32000000-0000-0000-0000-000000000001',false,'Synthetic rejection')$q$,'P5030');
SELECT public.fixture_split_denial($q$SELECT rmg_private.resolve_report('33000000-0000-0000-0000-000000000001')$q$,'P5030');
SELECT public.fixture_assert(public.rmg_decide_submission('review','30000000-0000-0000-0000-000000000002',true,'Verified synthetic approval reason')->>'status'='published'
 AND public.rmg_decide_revision((public.rmg_revision_queue(0,1)->0->>'id')::uuid,true,'Verified synthetic revision approval')->>'status'='approved'
 AND public.rmg_resolve_report((public.rmg_report_queue(0,1)->0->>'id')::uuid)->>'status'='resolved',
 'Oregon review, revision and report moderation remain available');
RESET ROLE;

SELECT public.fixture_assert((SELECT count(*)=2 FROM public.guide_claims)
 AND (SELECT status='pending' FROM public.guide_claims WHERE id='20000000-0000-0000-0000-000000000002')
 AND (SELECT count(*)=0 FROM rmg_private.profile_declarations)
 AND (SELECT count(*)=0 FROM public.moderation_audit WHERE target_type='claim'),
 'closed claim surface leaves claims, profiles and claim audit unchanged');
SELECT public.fixture_assert((SELECT status='pending' FROM public.reviews WHERE id='31000000-0000-0000-0000-000000000001')
 AND (SELECT status='pending' FROM rmg_private.review_revisions WHERE id='32000000-0000-0000-0000-000000000001')
 AND (SELECT status='pending' FROM public.review_flags WHERE id='33000000-0000-0000-0000-000000000001'),
 'WA records are preserved unchanged');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
SELECT public.fixture_assert(public.rmg_submit_review('OR','two',4::smallint,NULL,NULL,'legacy review',true,'none',NULL)->>'status'='pending',
 'Oregon review v1 remains available');
RESET ROLE;
ROLLBACK;
