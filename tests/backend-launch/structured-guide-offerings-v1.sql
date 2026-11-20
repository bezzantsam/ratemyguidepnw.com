\set ON_ERROR_STOP on
CREATE FUNCTION public.fixture_offerings_denial(statement text, expected text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE statement;
 EXCEPTION WHEN OTHERS THEN IF SQLSTATE=expected THEN RETURN; END IF; RAISE;
 END;
 RAISE EXCEPTION 'Expected % for fixture call',expected;
END $$;

INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference) VALUES
 ('OR','OG.0000001','10000000-0000-0000-0000-000000000001',now(),'synthetic'),
 ('OR','OG.0001225.F&F','10000000-0000-0000-0000-000000000002',now(),'synthetic'),
 ('WA','wa-900001','10000000-0000-0000-0000-000000000001',now(),'synthetic alias');
UPDATE rmg_private.claim_control_v1 SET enabled=true WHERE singleton;
UPDATE rmg_private.launch_control SET enabled=true WHERE singleton;

SELECT public.fixture_assert(NOT has_table_privilege('authenticated','rmg_private.guide_offerings_drafts_v1','SELECT')
 AND NOT has_table_privilege('anon','rmg_private.guide_offerings_proposals_v1','SELECT')
 AND NOT has_table_privilege('authenticated','rmg_private.guide_offerings_publications_v1','UPDATE')
 AND NOT has_function_privilege('anon','public.rmg_guide_offerings_authorized_v1(text,jsonb)','EXECUTE')
 AND NOT has_function_privilege('authenticated','rmg_private.edit_guide_offerings_v1(text,jsonb)','EXECUTE'),
 'private tables and internal actor/author helpers have no client access');

SET ROLE anon;
SELECT public.fixture_assert(public.rmg_guide_offerings_public_v1('public_batch','{"afterSourceId":null,"limit":10}')='{"items":[],"nextCursor":null}',
 'public batch defaults empty');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
SELECT public.fixture_offerings_denial($q$SELECT public.rmg_guide_offerings_authorized_v1('owner_get','{"jurisdiction":"OR","sourceId":"OG.0000001"}')$q$,'P5030');
RESET ROLE;

UPDATE rmg_private.guide_offerings_control_v1 SET enabled=true WHERE singleton;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT public.fixture_assert(public.rmg_claim_status_v1('OR','OG.0001225.F&F')->>'status'='pending'
 AND public.rmg_submit_claim_v1('OR','OG.0001225.F&F','Synthetic second owner',NULL,'Synthetic recorded ownership evidence')->>'existing'='true',
 'suffixed claimant resumes the same private pending claim');
SELECT public.fixture_offerings_denial($q$SELECT public.rmg_guide_offerings_authorized_v1('owner_get','{"jurisdiction":"OR","sourceId":"OG.0001225.F&F"}')$q$,'42501');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.fixture_assert(public.rmg_decide_claim_v1('20000000-0000-0000-0000-000000000002',true,
 'Synthetic exact independently verified claim')->>'status'='approved',
 '01 verified claim RPC approves the exact suffix identity');
RESET ROLE;
SELECT public.fixture_assert(NOT has_function_privilege('authenticated','public.rmg_edit_details(text,text,text,text,smallint,text,text)','EXECUTE'),
 'claim foundation keeps the legacy immediate-publication path revoked');

SELECT $draft$
{"vessels":[{"id":"v1","label":"Fixture boat","type":"Ocean charter boat","covered":true,"heated":false,"maxAnglers":6,"fishCare":["Icing"]}],
 "offerings":[
 {"id":"p1","title":"Estuary sturgeon","jurisdiction":"OR","waterway":"Columbia Estuary","launchArea":"Astoria","species":["Sturgeon"],"months":[6],"vesselId":"v1","bookingStyle":"private_boat","duration":"full_day","methodIds":["plunking"],"gearIds":["baitcasting-tackle"]},
 {"id":"p2","title":"Nearshore trips","jurisdiction":"WA","waterway":"Pacific nearshore","launchArea":"Ilwaco","species":[],"months":[7],"vesselId":null,"bookingStyle":"per_seat","duration":"half_day","methodIds":["bottom-fishing"],"gearIds":[]},
 {"id":"p3","title":"Summer crabbing","jurisdiction":"OR","waterway":"Columbia Estuary","launchArea":"Astoria","species":["Crabbing"],"months":[],"vesselId":null,"bookingStyle":"call_to_confirm","duration":"unspecified","methodIds":[],"gearIds":[]}]}
$draft$::jsonb AS full_draft \gset
SELECT '{"jurisdiction":"OR","sourceId":"OG.0000001"}'::jsonb AS one,
 '{"jurisdiction":"OR","sourceId":"OG.0001225.F&F"}'::jsonb AS two,
 '{"vessels":[],"offerings":[]}'::jsonb AS empty_draft \gset

SELECT public.fixture_assert(
 rmg_private.valid_guide_offerings_v1(:'full_draft'::jsonb,true)
 AND NOT rmg_private.valid_guide_offerings_v1(jsonb_set(:'full_draft'::jsonb,'{offerings,1,methodIds}','[]'),true),
 'mixed bottom fishing is valid without species only with its explicit method and generic Crabbing is separate');

BEGIN;
UPDATE rmg_private.launch_control SET enabled=false WHERE singleton;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
SELECT public.fixture_assert((public.rmg_guide_offerings_authorized_v1('owner_get',:'one')->'draft'->>'revision')::int=0,
 'exact approved owner can load an empty draft independently of the review gate');
ROLLBACK;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
SELECT public.fixture_offerings_denial($q$SELECT public.rmg_guide_offerings_authorized_v1('owner_get','{"jurisdiction":"OR","sourceId":"OG.0000001"}')$q$,'42501');
SELECT public.fixture_offerings_denial($q$SELECT public.rmg_guide_offerings_authorized_v1('moderator_list','{"offset":0,"limit":10}')$q$,'42501');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
SELECT public.fixture_offerings_denial($q$SELECT public.rmg_guide_offerings_authorized_v1('owner_get','{"jurisdiction":"OR","sourceId":"OG.0001225.F&F"}')$q$,'42501');
SELECT public.fixture_offerings_denial($q$SELECT public.rmg_guide_offerings_authorized_v1('owner_get','{"jurisdiction":"WA","sourceId":"wa-900001"}')$q$,'22023');
SELECT public.fixture_offerings_denial(format($q$SELECT public.rmg_guide_offerings_authorized_v1('owner_save',%L::jsonb)$q$,
 :'one'::jsonb||jsonb_build_object('expectedRevision',0,'draft',jsonb_set(:'full_draft'::jsonb,'{offerings,0,title}','"email test@example.com"'))),'22023');
SELECT public.fixture_offerings_denial(format($q$SELECT public.rmg_guide_offerings_authorized_v1('owner_save',%L::jsonb)$q$,
 :'one'::jsonb||jsonb_build_object('expectedRevision',0,'draft',jsonb_set(:'full_draft'::jsonb,'{offerings,0,vesselId}','"v9"'))),'22023');
SELECT public.fixture_offerings_denial(format($q$SELECT public.rmg_guide_offerings_authorized_v1('owner_save',%L::jsonb)$q$,
 :'one'::jsonb||jsonb_build_object('expectedRevision',0,'draft',jsonb_set(:'full_draft'::jsonb,'{offerings,1,species}','["Canary rockfish"]'))),'22023');
SELECT public.fixture_assert(public.rmg_guide_offerings_authorized_v1('owner_save',
 :'one'::jsonb||jsonb_build_object('expectedRevision',0,'draft',:'full_draft'::jsonb))->'draft'->>'revision'='1',
 'owner saves and reloads three separate offerings including nullable vessel and WA trip geography');
SELECT public.fixture_offerings_denial(format($q$SELECT public.rmg_guide_offerings_authorized_v1('owner_save',%L::jsonb)$q$,
 :'one'::jsonb||jsonb_build_object('expectedRevision',0,'draft',:'empty_draft'::jsonb)),'P0001');
SELECT public.fixture_assert(public.rmg_guide_offerings_authorized_v1('owner_get',:'one')->'draft' =
 :'full_draft'::jsonb||'{"revision":1}'::jsonb,'stale save leaves the persisted draft intact');
SELECT public.rmg_guide_offerings_authorized_v1('owner_submit',:'one'::jsonb||'{"expectedRevision":1}')->'proposal'->>'id' AS first \gset
SELECT public.fixture_assert(public.rmg_guide_offerings_authorized_v1('owner_submit',
 :'one'::jsonb||'{"expectedRevision":1}')->'proposal'->>'id'=:'first','submit retry reuses the original proposal');
SELECT public.fixture_offerings_denial(format($q$SELECT public.rmg_guide_offerings_authorized_v1('moderator_decide',%L::jsonb)$q$,
 jsonb_build_object('proposalId',:'first','approve',true,'reason','Synthetic independent manual decision')),'42501');
RESET ROLE;

SET ROLE anon;
SELECT public.fixture_assert(public.rmg_guide_offerings_public_v1('public_profile',:'one')='{"profile":null}'
 AND public.rmg_guide_offerings_public_v1('public_profile','{"jurisdiction":"WA","sourceId":"wa-900001"}')='{"profile":null}',
 'pending and WA alias have no public publication');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.fixture_assert(public.rmg_guide_offerings_authorized_v1('moderator_list','{"offset":0,"limit":1}')->'items'->0->>'id'=:'first',
 'independent moderator sees snapshot and stable source in pending queue');
SELECT public.fixture_assert(public.rmg_guide_offerings_authorized_v1('moderator_decide',
 jsonb_build_object('proposalId',:'first','approve',true,'reason','Synthetic independent manual decision'))->>'publishedVersion'='1',
 'approval publishes first version');
SELECT public.fixture_assert(public.rmg_guide_offerings_authorized_v1('moderator_decide',
 jsonb_build_object('proposalId',:'first','approve',true,'reason','Synthetic independent manual decision'))->>'publishedVersion'='1',
 'decision retry does not increment publication version');
RESET ROLE;

SET ROLE anon;
SELECT public.fixture_assert(public.rmg_guide_offerings_public_v1('public_profile',:'one')->'profile' =
 :'full_draft'::jsonb||'{"jurisdiction":"OR","sourceId":"OG.0000001","publishedVersion":1,"attribution":"captain_declared"}'::jsonb,
 'approved projection exposes exact distinct trips and attribution without owner/moderator metadata');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
SELECT public.rmg_guide_offerings_authorized_v1('owner_save',:'one'::jsonb||jsonb_build_object('expectedRevision',1,'draft',:'empty_draft'::jsonb));
SELECT public.rmg_guide_offerings_authorized_v1('owner_submit',:'one'::jsonb||'{"expectedRevision":2}')->'proposal'->>'id' AS erase \gset
RESET ROLE;
SET ROLE anon;
SELECT public.fixture_assert(public.rmg_guide_offerings_public_v1('public_profile',:'one')->'profile'->>'publishedVersion'='1'
 AND jsonb_array_length(public.rmg_guide_offerings_public_v1('public_profile',:'one')->'profile'->'offerings')=3,
 'pending empty revision preserves current live publication');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT public.rmg_guide_offerings_authorized_v1('owner_save',:'two'::jsonb||jsonb_build_object('expectedRevision',0,'draft',:'empty_draft'::jsonb));
SELECT public.rmg_guide_offerings_authorized_v1('owner_submit',:'two'::jsonb||'{"expectedRevision":1}')->'proposal'->>'id' AS second \gset
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.rmg_guide_offerings_authorized_v1('moderator_decide',jsonb_build_object(
 'proposalId',:'second','approve',true,'reason','Synthetic second profile verified'));
RESET ROLE;

SET ROLE anon;
SELECT public.fixture_assert(public.rmg_guide_offerings_public_v1('public_batch','{"afterSourceId":null,"limit":1}')->>'nextCursor'='OG.0000001'
 AND public.rmg_guide_offerings_public_v1('public_batch','{"afterSourceId":"OG.0000001","limit":1}')->'items'->0->>'sourceId'='OG.0001225.F&F'
 AND public.rmg_guide_offerings_public_v1('public_batch','{"afterSourceId":"OG.0001225.F&F","limit":1}')='{"items":[],"nextCursor":null}'
 AND public.rmg_guide_offerings_public_v1('public_profile',:'two')->'profile'->>'sourceId'='OG.0001225.F&F',
 'approved suffix identity uses exact profile and batch cursor with no neighbor inference');
RESET ROLE;

BEGIN;
UPDATE public.guide_claims SET status='denied' WHERE id='20000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
SELECT public.fixture_offerings_denial(format($q$SELECT public.rmg_guide_offerings_authorized_v1('owner_get',%L::jsonb)$q$, :'one'),'42501');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
SELECT public.fixture_offerings_denial(format($q$SELECT public.rmg_guide_offerings_authorized_v1('moderator_decide',%L::jsonb)$q$,
 jsonb_build_object('proposalId',:'erase','approve',true,'reason','Synthetic approval after owner removal')),'P0001');
SELECT public.fixture_assert(public.rmg_guide_offerings_authorized_v1('moderator_decide',
 jsonb_build_object('proposalId',:'erase','approve',false,'reason','Ownership expired'))->>'status'='rejected',
 'moderator can reject orphaned proposal and cannot publish it');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT public.fixture_assert(public.rmg_guide_offerings_public_v1('public_profile',:'one')->'profile'->>'publishedVersion'='1',
 'rejection retains the prior publication');
ROLLBACK;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.fixture_assert(public.rmg_guide_offerings_authorized_v1('moderator_decide',
 jsonb_build_object('proposalId',:'erase','approve',true,'reason','Verified owner requested removal'))->>'publishedVersion'='2',
 'approved empty revision increments publication and removes the old trips');
RESET ROLE;

SET ROLE anon;
SELECT public.fixture_assert(public.rmg_guide_offerings_public_v1('public_profile',:'one')->'profile' =
 '{"jurisdiction":"OR","sourceId":"OG.0000001","publishedVersion":2,"attribution":"captain_declared","vessels":[],"offerings":[]}',
 'public sees an explicit cleared version');
RESET ROLE;

CREATE TEMP VIEW offering_pause_snapshot AS SELECT jsonb_build_object(
 'drafts',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.claim_id) FROM rmg_private.guide_offerings_drafts_v1 d),
 'proposals',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM rmg_private.guide_offerings_proposals_v1 p),
 'published',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.guide_id) FROM rmg_private.guide_offerings_publications_v1 a),
 'guides',(SELECT jsonb_agg(to_jsonb(g) ORDER BY g.id) FROM public.guides g),
 'reviews',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.reviews r),
 'claims',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.guide_claims c),
 'audit',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.moderation_audit a)) AS data;
CREATE TEMP TABLE offering_before AS SELECT data FROM offering_pause_snapshot;
\i :disable_sql
\i :disable_sql
SELECT public.fixture_assert((SELECT a.data=b.data FROM offering_pause_snapshot a CROSS JOIN offering_before b)
 AND (SELECT enabled FROM rmg_private.launch_control)
 AND (SELECT enabled FROM rmg_private.claim_control_v1)
 AND NOT (SELECT enabled FROM rmg_private.guide_offerings_control_v1),
 'repeated disable retains versioned offerings and all review, rating, claim, audit and identity content');
SET ROLE anon;
SELECT public.fixture_assert(public.rmg_guide_offerings_public_v1('public_profile',:'one')='{"profile":null}'
 AND public.rmg_guide_offerings_public_v1('public_batch','{"afterSourceId":null,"limit":10}')='{"items":[],"nextCursor":null}'
 AND public.rmg_review_summary('OR','OG.0000001')->>'averageQuality'='5.00',
 'offerings disable hides projections and preserves public Oregon rating');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
SELECT public.fixture_offerings_denial(format($q$SELECT public.rmg_guide_offerings_authorized_v1('owner_get',%L::jsonb)$q$, :'one'),'P5030');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
SELECT public.fixture_assert(public.rmg_submit_review_v2('OR','OG.0000001',4::smallint,NULL,NULL,'Synthetic ordinary Oregon review after offerings pause',true,'none',NULL,NULL)->>'status'='pending',
 'Oregon ordinary review still submits after offerings pause');
RESET ROLE;
UPDATE rmg_private.guide_offerings_control_v1 SET enabled=true WHERE singleton;
SET ROLE anon;
SELECT public.fixture_assert(public.rmg_guide_offerings_public_v1('public_profile',:'one')->'profile'->>'publishedVersion'='2',
 'reopening offers the identical approved version with no republish');
RESET ROLE;
