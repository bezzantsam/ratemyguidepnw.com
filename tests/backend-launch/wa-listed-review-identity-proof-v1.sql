\set ON_ERROR_STOP on

-- Existing source listing IDs collide with recorded backend slugs on purpose.
-- These are synthetic legacy rows, with no approved source-to-UUID link.
INSERT INTO public.guides(id,slug,full_name,listing_status) VALUES
 ('10000000-0000-0000-0000-000000000011','wa-001','Synthetic legacy WA row','published'),
 ('10000000-0000-0000-0000-000000000012','wa-002','Synthetic neighboring WA row','published');

SELECT public.fixture_assert(NOT has_table_privilege('anon','rmg_private.wa_listed_review_identity_v1','SELECT')
 AND NOT has_table_privilege('authenticated','rmg_private.wa_listed_review_identity_v1','UPDATE')
 AND NOT has_function_privilege('authenticated','rmg_private.prepare_wa_listed_review_identity_v1(text,text,text,text,text)','EXECUTE')
 AND NOT has_function_privilege('anon','rmg_private.wa_listed_review_identity_for_version_v1(text,text)','EXECUTE')
 AND NOT has_function_privilege('service_role','rmg_private.wa_listed_review_identity_for_version_v1(text,text)','EXECUTE'),
 'proof bindings and helpers have no public, authenticated or service-role access');

CREATE TEMP VIEW fixture_listed_legacy AS
 SELECT jsonb_build_object(
  'guides',(SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM public.guides g),
  'reviews',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.reviews r),
  'claims',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.guide_claims c),
  'mappings',(SELECT jsonb_agg(to_jsonb(m) ORDER BY jurisdiction,source_id) FROM rmg_private.guide_identity_map m),
  'audit',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.moderation_audit a)) AS rowsets;
CREATE TEMP TABLE fixture_listed_before AS SELECT * FROM fixture_listed_legacy;

SELECT rmg_private.prepare_wa_listed_review_identity_v1('wa-001',repeat('a',64),repeat('b',64),repeat('c',64),repeat('d',64)) AS anchor \gset
SELECT public.fixture_assert(NOT EXISTS(SELECT 1 FROM public.guides WHERE id=:'anchor')
 AND rmg_private.wa_listed_review_identity_for_version_v1('wa-001',repeat('b',64)) IS NULL,
 'preparing a listed identity produces a new private UUID and defaults closed');
SELECT public.fixture_wa_denial($q$SELECT rmg_private.prepare_wa_listed_review_identity_v1('wa-001',repeat('e',64),repeat('f',64),repeat('1',64),repeat('2',64))$q$,'23505');
SELECT public.fixture_wa_denial($q$SELECT rmg_private.prepare_wa_listed_review_identity_v1('wa-002',repeat('a',64),repeat('f',64),repeat('1',64),repeat('2',64))$q$,'23505');
SELECT public.fixture_wa_denial($q$SELECT rmg_private.prepare_wa_listed_review_identity_v1('wa-002',repeat('e',64),repeat('f',64),repeat('c',64),repeat('2',64))$q$,'23505');
SELECT public.fixture_wa_denial($q$SELECT rmg_private.prepare_wa_listed_review_identity_v1('wa-900001',repeat('e',64),repeat('f',64),repeat('1',64),repeat('2',64))$q$,'23505');
SELECT public.fixture_wa_denial($q$SELECT rmg_private.prepare_wa_listed_review_identity_v1('wa-002',repeat('e',64),repeat('b',64),repeat('1',64),repeat('2',64))$q$,'23505');
SELECT public.fixture_wa_denial($q$SELECT rmg_private.prepare_wa_listed_review_identity_v1('wa-900020',repeat('e',64),repeat('f',64),repeat('1',64),repeat('2',64))$q$,'23514');
SELECT public.fixture_assert((SELECT count(*)=1 FROM rmg_private.wa_listed_review_identity_v1),
 'duplicate profile, source key, verified person and an existing WA review mapping cannot be prepared');

SELECT rmg_private.prepare_wa_listed_review_identity_v1('wa-002',repeat('e',64),repeat('f',64),repeat('1',64),repeat('2',64)) AS neighbor \gset
UPDATE rmg_private.wa_listed_review_identity_v1 SET enabled=true WHERE source_id='wa-001';
SELECT public.fixture_wa_denial($q$UPDATE rmg_private.wa_listed_review_identity_v1 SET enabled=true WHERE source_id='wa-002'$q$,'23505');
SELECT public.fixture_assert(rmg_private.wa_listed_review_identity_for_version_v1('wa-001',repeat('b',64))=:'anchor'::uuid
 AND rmg_private.wa_listed_review_identity_for_version_v1('wa-001',repeat('9',64)) IS NULL
 AND rmg_private.wa_listed_review_identity_for_version_v1('wa-002',repeat('f',64)) IS NULL,
 'only one exact enabled listing version resolves, while stale and neighboring versions stay closed');

BEGIN;
UPDATE rmg_private.wa_review_pilot_v1 SET enabled=true WHERE singleton;
SELECT public.fixture_assert(rmg_private.wa_listed_review_identity_for_version_v1('wa-001',repeat('b',64)) IS NULL,
 'listed proof cannot run alongside an enabled prospective pilot');
ROLLBACK;

BEGIN;
INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference)
 VALUES ('WA','wa-001','10000000-0000-0000-0000-000000000011',now(),'synthetic conflict');
SELECT public.fixture_assert(rmg_private.wa_listed_review_identity_for_version_v1('wa-001',repeat('b',64)) IS NULL,
 'a later exact source mapping makes the proof fail closed instead of repointing it');
ROLLBACK;

SET ROLE anon;
SELECT public.fixture_assert(public.rmg_review_write_availability('WA','wa-001')='{"available":false}'
 AND public.rmg_review_write_availability('WA','wa-002')='{"available":false}'
 AND public.rmg_review_write_availability('OR','one')='{"available":true}',
 'private preparation adds no public review eligibility and Oregon stays ready');
RESET ROLE;

SELECT public.fixture_wa_denial(format($q$INSERT INTO public.reviews(guide_id,author_id,quality,body,status)
 VALUES (%L,'00000000-0000-0000-0000-000000000006',4,'Synthetic archived schema FK probe','pending')$q$, :'anchor'),'23503');
SELECT public.fixture_wa_denial($q$INSERT INTO public.guides(slug,full_name,listing_status)
 VALUES ('wa-001','Synthetic duplicate public listing','draft')$q$,'23505');

-- Feasibility check only. The neutral draft is neither a captain identity nor an approved bridge.
BEGIN;
INSERT INTO public.guides(id,slug,full_name,listing_status)
 VALUES (:'anchor','wa-review-anchor-'||:'anchor','Synthetic review target','draft');
INSERT INTO public.reviews(guide_id,author_id,quality,body,status)
 VALUES (:'anchor','00000000-0000-0000-0000-000000000006',4,'Synthetic FK check on a draft adapter','pending')
 RETURNING id AS probe_review \gset
SELECT public.fixture_assert(rmg_private.wa_listed_review_identity_for_version_v1('wa-001',repeat('b',64)) IS NULL,
 'current proof treats materialization of its UUID as a collision, pending an explicit adapter contract');
SET LOCAL ROLE anon;
SELECT public.fixture_assert(NOT EXISTS(SELECT 1 FROM public.guides WHERE id=:'anchor')
 AND NOT EXISTS(SELECT 1 FROM public.public_angler_reviews WHERE id=:'probe_review'),
 'a neutral draft can satisfy the FK and is invisible as a guide, while its pending review remains private');
RESET ROLE;
ROLLBACK;

SELECT public.fixture_assert((SELECT a.rowsets=b.rowsets FROM fixture_listed_legacy a CROSS JOIN fixture_listed_before b),
 'all existing guide, review, claim, mapping and audit rows survive the collision and adapter probes');
CREATE TEMP TABLE fixture_listed_bindings AS
 SELECT to_jsonb(w)-'enabled' AS data FROM rmg_private.wa_listed_review_identity_v1 w;
\i :listed_disable_sql
\i :listed_disable_sql
SELECT public.fixture_assert(rmg_private.wa_listed_review_identity_for_version_v1('wa-001',repeat('b',64)) IS NULL
 AND NOT EXISTS(SELECT 1 FROM rmg_private.wa_listed_review_identity_v1 WHERE enabled)
 AND (SELECT count(*)=2 FROM rmg_private.wa_listed_review_identity_v1 w
      JOIN fixture_listed_bindings b ON to_jsonb(w)-'enabled'=b.data)
 AND (SELECT a.rowsets=b.rowsets FROM fixture_listed_legacy a CROSS JOIN fixture_listed_before b),
 'idempotent rollback closes only this proof and preserves both fresh bindings and all legacy rows');
