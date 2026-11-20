\set ON_ERROR_STOP on

CREATE FUNCTION public.fixture_wa_denial(statement text, expected text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  EXECUTE statement;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE=expected THEN RETURN; END IF;
  RAISE;
 END;
 RAISE EXCEPTION 'Expected SQLSTATE % for fixture call', expected;
END $$;

SELECT public.fixture_assert((SELECT NOT enabled AND source_id IS NULL FROM rmg_private.wa_review_pilot_v1)
 AND NOT has_table_privilege('authenticated','rmg_private.wa_review_pilot_v1','SELECT')
 AND NOT has_table_privilege('authenticated','rmg_private.wa_review_pilot_v1','UPDATE')
 AND NOT has_function_privilege('authenticated','rmg_private.wa_review_target_v1(text,uuid)','EXECUTE')
 AND NOT has_function_privilege('anon','public.rmg_submit_review_v2(text,text,smallint,smallint,boolean,text,boolean,text,jsonb,text)','EXECUTE'),
 'WA singleton defaults empty and closed, private ACLs and anonymous submit stay denied');

INSERT INTO public.guides(id,slug,full_name,listing_status) VALUES
 ('10000000-0000-0000-0000-000000000004','wa-900001','Fixture WA pilot','published'),
 ('10000000-0000-0000-0000-000000000005','fixture-wa-neighbor','Fixture WA neighbor','published');
INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference) VALUES
 ('OR','one','10000000-0000-0000-0000-000000000001',now(),'fixture'),
 ('OR','two','10000000-0000-0000-0000-000000000002',now(),'fixture'),
 ('WA','wa-900001','10000000-0000-0000-0000-000000000004',now(),'wa-pilot-sha256:'||repeat('a',64)),
 ('WA','wa-900002','10000000-0000-0000-0000-000000000005',now(),'fixture held'),
 ('WA','wa-900003','10000000-0000-0000-0000-000000000001',now(),'fixture OR alias');
UPDATE rmg_private.launch_control SET enabled=true WHERE singleton;

SET ROLE anon;
SELECT public.fixture_assert(public.rmg_review_write_availability('WA','wa-900001')='{"available":false}'
 AND public.rmg_review_write_availability('OR','one')='{"available":true}', 'WA defaults closed while Oregon stays ready');
RESET ROLE;

UPDATE rmg_private.wa_review_pilot_v1 SET source_id='wa-900001',
 guide_id='10000000-0000-0000-0000-000000000004',packet_sha256=repeat('b',64),enabled=true WHERE singleton;
SELECT public.fixture_assert(public.rmg_review_write_availability('WA','wa-900001')='{"available":false}',
 'a stale intake digest cannot activate an existing mapping');
UPDATE rmg_private.wa_review_pilot_v1 SET packet_sha256=repeat('a',64) WHERE singleton;
SELECT public.fixture_wa_denial($q$UPDATE rmg_private.wa_review_pilot_v1 SET source_id='wa-163' WHERE singleton$q$,'23514');
UPDATE rmg_private.wa_review_pilot_v1 SET guide_id='10000000-0000-0000-0000-000000000005' WHERE singleton;
SELECT public.fixture_assert(public.rmg_review_write_availability('WA','wa-900001')='{"available":false}',
 'a different guide UUID cannot borrow the mapped source ID');
UPDATE rmg_private.wa_review_pilot_v1 SET guide_id='10000000-0000-0000-0000-000000000004' WHERE singleton;
UPDATE public.guides SET slug='fixture-old-slug' WHERE id='10000000-0000-0000-0000-000000000004';
SELECT public.fixture_assert(public.rmg_review_write_availability('WA','wa-900001')='{"available":false}',
 'an existing differently sluggified guide row cannot activate through a new source ID');
UPDATE public.guides SET slug='wa-900001' WHERE id='10000000-0000-0000-0000-000000000004';

SET ROLE anon;
SELECT public.fixture_assert(public.rmg_review_write_availability('WA','wa-900001')='{"available":true}'
 AND public.rmg_review_write_availability('WA','wa-900002')='{"available":false}'
 AND public.rmg_review_write_availability('WA','wa-900003')='{"available":false}'
 AND public.rmg_review_write_availability('WA',NULL)='{"available":false}',
 'exact WA source admits only the verified tuple, with mapped neighbor and OR alias held');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
SELECT public.fixture_wa_denial($q$SELECT public.rmg_submit_review_v2('WA','wa-900002',4::smallint,NULL,NULL,'Neighbor',true,'none',NULL,NULL)$q$,'P5030');
SELECT public.fixture_wa_denial($q$SELECT public.rmg_submit_review_v2('WA','wa-900003',4::smallint,NULL,NULL,'Alias',true,'none',NULL,NULL)$q$,'P5030');
SELECT (result->>'id') AS pilot_review, (result->>'status')='pending' AS pilot_pending
 FROM (SELECT public.rmg_submit_review_v2('WA','wa-900001',4::smallint,NULL,NULL,
   'Synthetic firsthand Washington trip',true,'none',NULL,'2026-05') result) x \gset
SELECT public.fixture_assert(:'pilot_pending'::boolean,'ordinary verified actor submits one pending WA review');
SELECT public.fixture_wa_denial($q$SELECT public.rmg_submit_review_v2('WA','wa-900001',4::smallint,NULL,NULL,'Duplicate',true,'none',NULL,NULL)$q$,'P4091');
SELECT public.fixture_assert(NOT EXISTS (SELECT 1 FROM public.admin_pending_reviews WHERE id=:'pilot_review'),
 'ordinary reviewer lacks moderator queue access');
SELECT public.fixture_wa_denial(format($q$SELECT public.rmg_decide_submission('review',%L,true,'Synthetic manual verification')$q$, :'pilot_review'),'42501');
RESET ROLE;

SET ROLE anon;
SELECT public.fixture_assert(NOT EXISTS (SELECT 1 FROM public.public_angler_reviews WHERE id=:'pilot_review'),'pending WA review is absent publicly');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.fixture_assert(EXISTS (SELECT 1 FROM public.admin_pending_reviews WHERE id=:'pilot_review')
 AND public.rmg_decide_submission('review',:'pilot_review',true,'Synthetic manual verification')->>'status'='published',
 'independent moderator sees and publishes the WA review');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
SELECT (result->>'id') AS pilot_revision, (result->>'status')='pending' AS revision_pending
 FROM (SELECT public.rmg_submit_revision_v2(:'pilot_review',5::smallint,NULL,NULL,
   'Synthetic correction for Washington trip',true,'none',NULL,false,NULL) result) x \gset
SELECT public.fixture_assert(:'revision_pending'::boolean AND
 EXISTS (SELECT 1 FROM public.public_angler_reviews WHERE id=:'pilot_review' AND quality=4),
 'author revision is pending and public original is stable');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.fixture_assert(public.rmg_revision_queue(0,20) @> jsonb_build_array(jsonb_build_object('id',:'pilot_revision','jurisdiction','WA','source_id','wa-900001'))
 AND public.rmg_decide_revision(:'pilot_revision',true,'Verified the synthetic correction')->>'status'='approved',
 'moderator queue carries only the exact WA identity and approves the revision');
RESET ROLE;

SET ROLE anon;
SELECT public.fixture_assert(EXISTS (SELECT 1 FROM public.public_angler_reviews
 WHERE id=:'pilot_review' AND quality=5 AND trip_month='2026-05-01'),
 'approved revision changes score and retains unspecified trip month');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
SELECT (public.rmg_report_review('WA','wa-900001',:'pilot_review','other')->>'id') AS pilot_report \gset
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.fixture_assert(public.rmg_report_queue(0,20) @> jsonb_build_array(jsonb_build_object('id',:'pilot_report','jurisdiction','WA','source_id','wa-900001'))
 AND public.rmg_resolve_report(:'pilot_report')->>'status'='resolved', 'moderator resolves the report through the exact WA queue');
RESET ROLE;

BEGIN;
UPDATE rmg_private.claim_control_v1 SET enabled=true WHERE singleton;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
SELECT public.fixture_wa_denial($q$SELECT public.rmg_submit_claim('WA','wa-900001','Fixture claimant',NULL,'Synthetic ownership evidence')$q$,'P5030');
SELECT public.fixture_wa_denial($q$SELECT public.rmg_edit_details('WA','wa-900001','Boat','Gear',5::smallint,'Experience','Species')$q$,'P5030');
SELECT public.fixture_assert(public.rmg_submit_claim('OR','two','Fixture claimant',NULL,'Synthetic ownership evidence')->>'status'='pending',
 'WA claims and edits stay denied even while existing Oregon claims work');
ROLLBACK;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
SELECT (public.rmg_submit_review_v2('WA','wa-900001',4::smallint,NULL,NULL,
 'Synthetic pending WA review retained across disable',true,'none',NULL,NULL)->>'id') AS retained_pending \gset
RESET ROLE;

CREATE TEMP VIEW fixture_wa_snapshot AS
 SELECT jsonb_build_object(
  'reviews',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.reviews r),
  'revisions',(SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM rmg_private.review_revisions v),
  'reports',(SELECT jsonb_agg(to_jsonb(f) ORDER BY f.id) FROM public.review_flags f),
  'audit',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.moderation_audit a),
  'mappings',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.jurisdiction,m.source_id) FROM rmg_private.guide_identity_map m),
  'claims',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.guide_claims c)
 ) AS payload;
SELECT count(*) AS reviews_before FROM public.reviews \gset
SELECT count(*) AS audit_before FROM public.moderation_audit \gset
SELECT jsonb_build_object('reviews',(SELECT count(*) FROM public.reviews),
 'revisions',(SELECT count(*) FROM rmg_private.review_revisions),
 'reports',(SELECT count(*) FROM public.review_flags),
 'audit',(SELECT count(*) FROM public.moderation_audit),
 'mappings',(SELECT count(*) FROM rmg_private.guide_identity_map),
 'claims',(SELECT count(*) FROM public.guide_claims)) AS before_disable;
CREATE TEMP TABLE fixture_wa_before AS SELECT payload FROM fixture_wa_snapshot;
\i :disable_sql
\i :disable_sql
SELECT public.fixture_assert((SELECT a.payload=b.payload FROM fixture_wa_snapshot a CROSS JOIN fixture_wa_before b)
 AND (SELECT NOT enabled FROM rmg_private.wa_review_pilot_v1)
 AND (SELECT enabled FROM rmg_private.launch_control)
 AND (SELECT NOT enabled FROM rmg_private.claim_control_v1),
 'idempotent WA disable preserves complete review, revision, report, audit, mapping and claim rowsets');
SELECT public.fixture_assert((SELECT count(*)=:'reviews_before'::integer FROM public.reviews)
 AND (SELECT count(*)=:'audit_before'::integer FROM public.moderation_audit), 'exact fixture counts survive WA disable');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
SELECT public.fixture_wa_denial(format($q$SELECT public.rmg_submit_revision_v2(%L,4::smallint,NULL,NULL,'After pause',true,'none',NULL,false,NULL)$q$, :'pilot_review'),'P5030');
SELECT public.fixture_wa_denial($q$SELECT public.rmg_submit_review_v2('WA','wa-900001',4::smallint,NULL,NULL,'Paused',true,'none',NULL,NULL)$q$,'P5030');
SELECT public.fixture_assert(public.rmg_review_write_availability('WA','wa-900001')='{"available":false}'
 AND public.rmg_submit_review_v2('OR','two',4::smallint,NULL,NULL,'OR after WA pause',true,'none',NULL,NULL)->>'status'='pending',
 'WA readiness and mutations close while Oregon still accepts an ordinary review');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.fixture_assert(NOT EXISTS (SELECT 1 FROM public.admin_pending_reviews WHERE id=:'retained_pending'),
 'paused WA pending review is held out of the moderator queue');
SELECT public.fixture_wa_denial(format($q$SELECT public.rmg_decide_submission('review',%L,true,'Synthetic review after pause')$q$,
 :'retained_pending'),'P5030');
RESET ROLE;
