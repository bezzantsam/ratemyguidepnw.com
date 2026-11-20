-- Disposable fixture only. Run after the current review migrations and the
-- automatic-publication candidate. Plain SQL also runs in embedded PostgreSQL.
BEGIN;
CREATE FUNCTION public.fixture_auto_denial(statement text,expected text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text;
BEGIN
 BEGIN EXECUTE statement;
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE;
 END;
 IF actual IS DISTINCT FROM expected THEN
  RAISE EXCEPTION 'Expected denial %, received % for %',expected,coalesce(actual,'success'),statement;
 END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.fixture_auto_denial(text,text) TO anon,authenticated;
CREATE TEMP TABLE auto_receipts(name text PRIMARY KEY,receipt jsonb NOT NULL);
GRANT SELECT,INSERT ON auto_receipts TO authenticated;
GRANT SELECT ON auto_receipts TO anon;

INSERT INTO auth.users(id,email_confirmed_at,is_anonymous,deleted_at)
 SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 CASE WHEN n=155 THEN NULL ELSE now() END,n=156,CASE WHEN n=158 THEN now() ELSE NULL END
 FROM generate_series(151,160) n;
INSERT INTO public.site_admins(user_id) VALUES
 ('00000000-0000-0000-0000-000000000152'), -- author conflict
 ('00000000-0000-0000-0000-000000000153'), -- reporter conflict
 ('00000000-0000-0000-0000-000000000154'), -- independent moderator
 ('00000000-0000-0000-0000-000000000157'); -- guide owner conflict
INSERT INTO public.guides(id,slug,full_name,listing_status)
 SELECT ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 'fixture-automatic-'||n,'Synthetic automatic publication '||n,'published'
 FROM generate_series(150,154) n;
INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference)
 SELECT 'OR','OG.'||lpad(n::text,7,'0')||'.F&F',
 ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,now(),'synthetic automatic publication test'
 FROM generate_series(150,154) n;
INSERT INTO public.guide_claims(guide_id,claimant_id,status)
 VALUES('10000000-0000-0000-0000-000000000150','00000000-0000-0000-0000-000000000157','approved');
UPDATE rmg_private.launch_control SET enabled=true WHERE singleton;
UPDATE rmg_private.claim_control_v1 SET enabled=true WHERE singleton;
UPDATE rmg_private.wa_catalog_review_control_v1 SET enabled=false WHERE singleton;
SELECT rmg_private.seed_wa_review_catalog_v1(jsonb_build_array(jsonb_build_object(
 'sourceId','wa-150','sourceKeySha256',repeat('a1',32),'listingSha256',repeat('b1',32),'holdReason',NULL)));
UPDATE rmg_private.wa_catalog_review_control_v1 SET enabled=true WHERE singleton;

SELECT public.fixture_assert(
 (SELECT status='pending' FROM public.reviews WHERE id='30000000-0000-0000-0000-000000000002')
 AND NOT has_table_privilege('authenticated','public.reviews','INSERT')
 AND NOT has_table_privilege('authenticated','public.reviews','UPDATE')
 AND NOT has_table_privilege('authenticated','rmg_private.review_revisions','INSERT')
 AND NOT has_function_privilege('anon','public.rmg_resolve_report_v2(uuid,text,text)','EXECUTE')
 AND NOT has_function_privilege('service_role','rmg_private.publish_own_revision_v1(uuid)','EXECUTE')
 AND NOT has_column_privilege('anon','public.reviews','author_id','SELECT'),
 'policy installation leaves existing pending data and direct-access restrictions intact');

SET LOCAL ROLE anon;
SELECT public.fixture_auto_denial($q$SELECT public.rmg_submit_review_v3('OR','OG.0000150.F&F',5::smallint,NULL,true,'Anonymous submission',true,'none',NULL,NULL,'{}')$q$,'42501');
SELECT public.fixture_auto_denial($q$SELECT public.rmg_resolve_report_v2('00000000-0000-0000-0000-000000000000','keep','')$q$,'42501');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000155',true);
SELECT public.fixture_auto_denial($q$SELECT public.rmg_submit_review_v3('OR','OG.0000150.F&F',5::smallint,NULL,true,'Unconfirmed submission',true,'none',NULL,NULL,'{}')$q$,'42501');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000156',true);
SELECT public.fixture_auto_denial($q$SELECT public.rmg_submit_review_v3('OR','OG.0000150.F&F',5::smallint,NULL,true,'Anonymous-account submission',true,'none',NULL,NULL,'{}')$q$,'42501');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000158',true);
SELECT public.fixture_auto_denial($q$SELECT public.rmg_submit_review_v3('OR','OG.0000150.F&F',5::smallint,NULL,true,'Deleted-account submission',true,'none',NULL,NULL,'{}')$q$,'42501');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000157',true);
SELECT public.fixture_auto_denial($q$SELECT public.rmg_submit_review_v3('OR','OG.0000150.F&F',5::smallint,NULL,true,'Owner submission',true,'none',NULL,NULL,'{}')$q$,'42501');

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000151',true);
SELECT public.fixture_auto_denial($q$SELECT public.rmg_submit_review_v3('OR','OG.0000150.F&F',5::smallint,NULL,true,'Unattested submission',false,'none',NULL,NULL,'{}')$q$,'22023');
SELECT public.fixture_auto_denial($q$SELECT public.rmg_submit_review_v3('OR','OG.0000150.F&F',5::smallint,NULL,NULL,'Missing rebooking response',true,'none',NULL,NULL,'{}')$q$,'22023');
SELECT public.fixture_auto_denial($q$SELECT public.rmg_submit_review_v3('OR','OG.0000150.F&F',5::smallint,NULL,true,'Invalid richer rating',true,'none',NULL,NULL,'{"safety":6}')$q$,'22023');
SELECT public.fixture_auto_denial($q$SELECT public.rmg_submit_review_v3('WA','wa-150@catalog:wrong-version',5::smallint,NULL,true,'Wrong catalog identity',true,'none',NULL,NULL,'{}')$q$,'P5030');
INSERT INTO auto_receipts VALUES('positive',public.rmg_submit_review_v3(
 'OR','OG.0000150.F&F',5::smallint,4::smallint,true,'Synthetic positive published review',true,'none',
 '{"version":1,"answers":{"organization":{"state":"answered","value":4},"kindness":{"state":"answered","value":5},"fish_landed":{"state":"answered","value":0}}}',
 '2026-01','{"communication":5,"equipment":2,"safety":4}'));
INSERT INTO auto_receipts VALUES('legacy_v2',public.rmg_submit_review_v2(
 'OR','OG.0000151.F&F',3::smallint,NULL,NULL,'Synthetic legacy v2 published review',true,'none',NULL,'2026-02'));
INSERT INTO auto_receipts VALUES('legacy_v1',public.rmg_submit_review(
 'OR','OG.0000152.F&F',2::smallint,NULL,false,'Synthetic legacy v1 published review',true,'none',NULL));
SELECT public.fixture_assert((SELECT bool_and(receipt->>'status'='published') FROM auto_receipts),
 'all three supported review submit versions return actual publication receipts');
SELECT public.fixture_auto_denial($q$SELECT public.rmg_submit_review_v3('OR','OG.0000150.F&F',5::smallint,NULL,true,'Duplicate review',true,'none',NULL,NULL,'{}')$q$,'P4091');
SELECT public.fixture_auto_denial($q$SELECT public.rmg_submit_review_v3('OR','OG.0000153.F&F',5::smallint,NULL,true,'Fourth review in one day',true,'none',NULL,NULL,'{}')$q$,'P4290');

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000152',true);
INSERT INTO auto_receipts VALUES('negative',public.rmg_submit_review_v3(
 'OR','OG.0000150.F&F',1::smallint,NULL,false,'Synthetic critical review publishes equally',true,'none',NULL,NULL,'{}'));
INSERT INTO auto_receipts VALUES('wa',public.rmg_submit_review_v3(
 'WA','wa-150@catalog:'||repeat('b1',32),3::smallint,NULL,true,'Synthetic Washington catalog published review',true,'none',NULL,'2026-03','{"knowledge":4}'));
SELECT public.fixture_auto_denial(format($q$SELECT public.rmg_submit_revision_v3(%L::uuid,5::smallint,NULL,true,'Not my review',true,'none',NULL,false,NULL,'{}')$q$,
 (SELECT receipt->>'id' FROM auto_receipts WHERE name='positive')),'P0002');

SET LOCAL ROLE anon;
SELECT public.fixture_assert(
 EXISTS(SELECT 1 FROM public.public_angler_reviews WHERE id=(SELECT (receipt->>'id')::uuid FROM auto_receipts WHERE name='positive')
  AND quality=5 AND communication=5 AND equipment=2 AND safety=4 AND trip_month='2026-01-01'
  AND trip_responses#>>'{answers,fish_landed,value}'='0')
 AND EXISTS(SELECT 1 FROM public.public_angler_reviews WHERE id=(SELECT (receipt->>'id')::uuid FROM auto_receipts WHERE name='negative') AND quality=1)
 AND EXISTS(SELECT 1 FROM public.public_angler_reviews WHERE id=(SELECT (receipt->>'id')::uuid FROM auto_receipts WHERE name='wa') AND knowledge=4 AND trip_month='2026-03-01')
 AND public.rmg_review_summary('OR','OG.0000150.F&F') @> '{"count":2,"averageQuality":3,"wouldBookAgainPercent":50}'
 AND public.rmg_review_summary('WA','wa-150@catalog:'||repeat('b1',32)) @> '{"count":1,"averageQuality":3}',
 'positive and negative reviews, full ratings/month, WA identity and aggregates are immediately public');

-- Every edit version finalizes only after its complete field patch is present.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000151',true);
INSERT INTO auto_receipts SELECT 'edit_v3',public.rmg_submit_revision_v3((receipt->>'id')::uuid,
 3::smallint,NULL,NULL,'Synthetic complete automatic v3 edit',true,'none',NULL,true,'2026-04','{"communication":null,"equipment":4}')
 FROM auto_receipts WHERE name='positive';
SELECT public.fixture_assert(EXISTS(SELECT 1 FROM public.public_angler_reviews
 WHERE id=(SELECT (receipt->>'id')::uuid FROM auto_receipts WHERE name='positive')
 AND quality=3 AND communication IS NULL AND equipment=4 AND safety=4 AND would_book_again=true
 AND trip_month='2026-04-01' AND trip_responses#>>'{answers,kindness,value}'='5'),
 'v3 edit atomically applies rating clears and month while preserving omitted answers');
INSERT INTO auto_receipts SELECT 'edit_v2',public.rmg_submit_revision_v2((receipt->>'id')::uuid,
 2::smallint,NULL,false,'Synthetic complete automatic v2 edit',true,'none',NULL,true,'2026-05')
 FROM auto_receipts WHERE name='positive';
SELECT public.fixture_assert(EXISTS(SELECT 1 FROM public.public_angler_reviews
 WHERE id=(SELECT (receipt->>'id')::uuid FROM auto_receipts WHERE name='positive')
 AND quality=2 AND equipment=4 AND safety=4 AND would_book_again=false AND trip_month='2026-05-01'),
 'v2 edit automatically applies its month and preserves richer ratings');
INSERT INTO auto_receipts SELECT 'edit_v1',public.rmg_submit_revision((receipt->>'id')::uuid,
 4::smallint,NULL,false,'Synthetic complete automatic v1 edit',true,'none',NULL)
 FROM auto_receipts WHERE name='positive';
SELECT public.fixture_assert((SELECT bool_and(receipt->>'status'='approved') FROM auto_receipts WHERE name LIKE 'edit_%')
 AND EXISTS(SELECT 1 FROM public.public_angler_reviews
 WHERE id=(SELECT (receipt->>'id')::uuid FROM auto_receipts WHERE name='positive')
 AND quality=4 AND equipment=4 AND communication IS NULL AND trip_month='2026-05-01'
 AND trip_responses#>>'{answers,fish_landed,value}'='0'),
 'all edit receipts are approved; legacy v1 retains month, ratings and recorded survey answers');
SELECT public.fixture_auto_denial(format($q$SELECT public.rmg_submit_revision_v3(%L::uuid,5::smallint,NULL,true,'Fourth revision in one day',true,'none',NULL,false,NULL,'{}')$q$,
 (SELECT receipt->>'id' FROM auto_receipts WHERE name='positive')),'P4290');
SELECT public.fixture_auto_denial(format($q$SELECT rmg_private.publish_own_revision_v1(%L::uuid)$q$,
 (SELECT receipt->>'id' FROM auto_receipts WHERE name='edit_v1')),'P0001');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000152',true);
SELECT public.fixture_auto_denial(format($q$SELECT rmg_private.publish_own_revision_v1(%L::uuid)$q$,
 (SELECT receipt->>'id' FROM auto_receipts WHERE name='edit_v1')),'P0002');

-- Reports queue content without hiding it. Repeated reporting does not create
-- duplicates. The author, reporter, owner and ordinary accounts cannot decide.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000153',true);
INSERT INTO auto_receipts SELECT 'flag_keep',public.rmg_report_review('OR','OG.0000150.F&F',(receipt->>'id')::uuid,'other')
 FROM auto_receipts WHERE name='negative';
SELECT public.fixture_assert(public.rmg_report_review('OR','OG.0000150.F&F',
 (SELECT (receipt->>'id')::uuid FROM auto_receipts WHERE name='negative'),'other') @>
 jsonb_build_object('id',(SELECT receipt->>'id' FROM auto_receipts WHERE name='flag_keep'),'existing',true),
 'report retry returns the same report without duplication');
SELECT public.fixture_auto_denial(format($q$SELECT public.rmg_resolve_report_v2(%L::uuid,'remove','Reported content')$q$,
 (SELECT receipt->>'id' FROM auto_receipts WHERE name='flag_keep')),'42501');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000152',true);
SELECT public.fixture_auto_denial(format($q$SELECT public.rmg_resolve_report_v2(%L::uuid,'keep','')$q$,
 (SELECT receipt->>'id' FROM auto_receipts WHERE name='flag_keep')),'42501');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000157',true);
SELECT public.fixture_auto_denial(format($q$SELECT public.rmg_resolve_report_v2(%L::uuid,'remove','Reported content')$q$,
 (SELECT receipt->>'id' FROM auto_receipts WHERE name='flag_keep')),'42501');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000151',true);
SELECT public.fixture_auto_denial(format($q$SELECT public.rmg_resolve_report_v2(%L::uuid,'keep','')$q$,
 (SELECT receipt->>'id' FROM auto_receipts WHERE name='flag_keep')),'42501');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000154',true);
SELECT public.fixture_assert(public.rmg_report_queue(0,100) @>
 jsonb_build_array(jsonb_build_object('id',(SELECT receipt->>'id' FROM auto_receipts WHERE name='flag_keep'),'review_status','published'))
 AND EXISTS(SELECT 1 FROM public.public_angler_reviews WHERE id=(SELECT (receipt->>'id')::uuid FROM auto_receipts WHERE name='negative')),
 'reported live post remains visible and appears in the authenticated admin queue');
SELECT public.fixture_auto_denial(format($q$SELECT public.rmg_resolve_report_v2(%L::uuid,'remove',' ')$q$,
 (SELECT receipt->>'id' FROM auto_receipts WHERE name='flag_keep')),'22023');
SELECT public.fixture_auto_denial(format($q$SELECT public.rmg_resolve_report_v2(%L::uuid,'keep',repeat('x',501))$q$,
 (SELECT receipt->>'id' FROM auto_receipts WHERE name='flag_keep')),'22023');
INSERT INTO auto_receipts SELECT 'kept',public.rmg_resolve_report_v2((receipt->>'id')::uuid,'keep',NULL)
 FROM auto_receipts WHERE name='flag_keep';
SELECT public.fixture_assert((SELECT receipt @> jsonb_build_object('status','resolved','review_status','published',
 'review_id',(SELECT receipt->>'id' FROM auto_receipts WHERE name='negative')) FROM auto_receipts WHERE name='kept'),
 'keep needs no typed reason and returns actual persisted review status');

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000159',true);
INSERT INTO auto_receipts SELECT 'flag_remove',public.rmg_report_review('OR','OG.0000150.F&F',(receipt->>'id')::uuid,'not_firsthand')
 FROM auto_receipts WHERE name='negative';
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000160',true);
INSERT INTO auto_receipts SELECT 'flag_after_remove',public.rmg_report_review('OR','OG.0000150.F&F',(receipt->>'id')::uuid,'other')
 FROM auto_receipts WHERE name='negative';
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000154',true);
INSERT INTO auto_receipts SELECT 'removed',public.rmg_resolve_report_v2((receipt->>'id')::uuid,'remove','Not firsthand')
 FROM auto_receipts WHERE name='flag_remove';
INSERT INTO auto_receipts SELECT 'kept_removed',public.rmg_resolve_report_v2((receipt->>'id')::uuid,'keep','')
 FROM auto_receipts WHERE name='flag_after_remove';
SELECT public.fixture_assert((SELECT receipt->>'review_status'='removed' FROM auto_receipts WHERE name='removed')
 AND (SELECT receipt->>'review_status'='removed' FROM auto_receipts WHERE name='kept_removed'),
 'removal reports removed and resolving another flag cannot republish it');
SET LOCAL ROLE anon;
SELECT public.fixture_assert(NOT EXISTS(SELECT 1 FROM public.public_angler_reviews
 WHERE id=(SELECT (receipt->>'id')::uuid FROM auto_receipts WHERE name='negative'))
 AND public.rmg_review_summary('OR','OG.0000150.F&F') @> '{"count":1,"averageQuality":4}'
 AND EXISTS(SELECT 1 FROM public.guides WHERE id='10000000-0000-0000-0000-000000000150'
  AND review_count=1 AND average_quality=4),
 'admin removal hides the public post and updates both summary and stored aggregates');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000152',true);
SELECT public.fixture_auto_denial(format($q$SELECT public.rmg_submit_revision_v3(%L::uuid,5::smallint,NULL,true,'Attempt to revive removed review',true,'none',NULL,false,NULL,'{}')$q$,
 (SELECT receipt->>'id' FROM auto_receipts WHERE name='negative')),'P0002');
SELECT public.fixture_auto_denial($q$SELECT public.rmg_submit_review_v3('OR','OG.0000150.F&F',5::smallint,NULL,true,'Attempt to duplicate removed review',true,'none',NULL,NULL,'{}')$q$,'P4091');

-- A historical report may refer to a post that another administrative path
-- already unpublished. Reject a removal that cannot return a removed receipt.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000159',true);
INSERT INTO auto_receipts SELECT 'flag_unpublished',public.rmg_report_review('OR','OG.0000152.F&F',(receipt->>'id')::uuid,'other')
 FROM auto_receipts WHERE name='legacy_v1';
RESET ROLE;
UPDATE public.reviews SET status='pending',published_at=NULL
 WHERE id=(SELECT (receipt->>'id')::uuid FROM auto_receipts WHERE name='legacy_v1');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000154',true);
SELECT public.fixture_auto_denial(format($q$SELECT public.rmg_resolve_report_v2(%L::uuid,'remove','Review no longer published')$q$,
 (SELECT receipt->>'id' FROM auto_receipts WHERE name='flag_unpublished')),'P0001');
RESET ROLE;
SELECT public.fixture_assert(EXISTS(SELECT 1 FROM public.review_flags
 WHERE id=(SELECT (receipt->>'id')::uuid FROM auto_receipts WHERE name='flag_unpublished') AND status='pending'),
 'an unavailable removal fails without silently resolving its report');
SET LOCAL ROLE authenticated;

-- Claims remain a separate, manual ownership decision.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000160',true);
INSERT INTO auto_receipts VALUES('claim',public.rmg_submit_claim_v1('OR','OG.0000154.F&F',
 'Synthetic claimant','Synthetic business','Synthetic evidence pending independent ownership verification.'));
SELECT public.fixture_assert((SELECT receipt->>'status'='pending' FROM auto_receipts WHERE name='claim')
 AND public.rmg_claim_status_v1('OR','OG.0000154.F&F')->>'status'='pending',
 'new review policy does not automatically grant captain claims');
RESET ROLE;
SELECT public.fixture_assert(
 NOT EXISTS(SELECT 1 FROM rmg_private.review_revisions WHERE submitter_id='00000000-0000-0000-0000-000000000151' AND status<>'approved')
 AND EXISTS(SELECT 1 FROM rmg_private.review_revisions WHERE submitter_id='00000000-0000-0000-0000-000000000151' AND decided_by IS NULL AND decided_at IS NOT NULL)
 AND EXISTS(SELECT 1 FROM public.moderation_audit WHERE target_id=(SELECT (receipt->>'id')::uuid FROM auto_receipts WHERE name='positive')
  AND actor_id IS NULL AND reason LIKE 'Automatic publication%')
 AND EXISTS(SELECT 1 FROM public.moderation_audit WHERE target_id=(SELECT (receipt->>'id')::uuid FROM auto_receipts WHERE name='negative')
  AND actor_id='00000000-0000-0000-0000-000000000154' AND old_status='published' AND new_status='removed'
  AND reason LIKE '%Not firsthand%')
 AND EXISTS(SELECT 1 FROM public.reviews WHERE id=(SELECT (receipt->>'id')::uuid FROM auto_receipts WHERE name='negative') AND published_at IS NULL),
 'automatic decisions are attributed to policy, manual removals to the admin, and removed publication timestamp is cleared');

-- The existing launch and catalog pauses still fail closed for automatic writes.
UPDATE rmg_private.launch_control SET enabled=false WHERE singleton;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000160',true);
SELECT public.fixture_auto_denial($q$SELECT public.rmg_submit_review_v3('OR','OG.0000153.F&F',5::smallint,NULL,true,'Paused launch submission',true,'none',NULL,NULL,'{}')$q$,'P5030');
RESET ROLE;
UPDATE rmg_private.launch_control SET enabled=true WHERE singleton;
UPDATE rmg_private.wa_catalog_review_control_v1 SET enabled=false WHERE singleton;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000160',true);
SELECT public.fixture_auto_denial($q$SELECT public.rmg_submit_review_v3('WA','wa-150@catalog:'||repeat('b1',32),5::smallint,NULL,true,'Paused catalog submission',true,'none',NULL,NULL,'{}')$q$,'P5030');
RESET ROLE;
ROLLBACK;
