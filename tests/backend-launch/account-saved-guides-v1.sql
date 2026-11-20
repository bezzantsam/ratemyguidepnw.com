\set ON_ERROR_STOP on
WITH synthetic AS (
 INSERT INTO public.guides(id,slug,full_name,listing_status)
 SELECT gen_random_uuid(),'fixture-saved-'||n,'Synthetic saved listing','published' FROM generate_series(0,51) n
 RETURNING id,slug
)
INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference)
 SELECT 'OR','OG.'||lpad(split_part(slug,'-',3),7,'0')||'.X&Y',id,now(),'synthetic-saved' FROM synthetic;
INSERT INTO rmg_private.wa_catalog_review_targets_v1(source_id,source_key_sha256,listing_sha256,hold_reason)
 VALUES('wa-987650001',encode(sha256(convert_to('saved-fixture-key','UTF8')),'hex'),
        encode(sha256(convert_to('saved-fixture-listing','UTF8')),'hex'),'fixture-held');

SELECT public.fixture_assert(
 NOT has_function_privilege('anon','public.rmg_account_saved_guides_v1(text,jsonb)','EXECUTE')
 AND NOT has_table_privilege('authenticated','rmg_private.account_saved_guides','INSERT,UPDATE,DELETE')
 AND NOT has_column_privilege('authenticated','rmg_private.account_saved_guides','entry_order','SELECT'),
 'anonymous RPC and direct mutation denied, entry ordering private');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT set_config('request.jwt.claims','{"is_anonymous":true}',false);
DO $$
BEGIN
 PERFORM public.rmg_account_saved_guides_v1('list','[]');
 RAISE EXCEPTION 'Anonymous auth session attempted shortlist read';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
SELECT set_config('request.jwt.claims','{"is_anonymous":false}',false);
SELECT public.fixture_assert(public.rmg_account_saved_guides_v1('list','[]')='{"status":"listed","items":[]}',
 'an account starts empty');
SELECT public.fixture_assert(public.rmg_account_saved_guides_v1('save','[{"jurisdiction":"OR","sourceId":"OG.0000000.X&Y"}]') =
 '{"status":"saved","items":[{"jurisdiction":"OR","sourceId":"OG.0000000.X&Y"}]}',
 'save retains the exact Oregon registration suffix');
SELECT public.fixture_assert(public.rmg_account_saved_guides_v1('import','[
  {"jurisdiction":"OR","sourceId":"OG.0000000.X&Y"},
  {"jurisdiction":"WA","sourceId":"wa-987650001"},
  {"jurisdiction":"WA","sourceId":"wa-987650001"}
 ]')='{"status":"imported","items":[{"jurisdiction":"OR","sourceId":"OG.0000000.X&Y"},
 {"jurisdiction":"WA","sourceId":"wa-987650001"}]}',
 'explicit import dedupes and a held public WA profile can be saved');
DO $$
BEGIN
 PERFORM public.rmg_account_saved_guides_v1('save','[{"jurisdiction":"OR","sourceId":"OG.0000000.X&Y","userId":"other"}]');
 RAISE EXCEPTION 'Caller-supplied owner accepted';
EXCEPTION WHEN invalid_parameter_value THEN NULL;
END $$;
DO $$
BEGIN
 PERFORM public.rmg_account_saved_guides_v1('save','[{"jurisdiction":"WA","sourceId":"wa-999999999"}]');
 RAISE EXCEPTION 'Unknown guide accepted';
EXCEPTION WHEN invalid_parameter_value THEN NULL;
END $$;
SELECT public.fixture_assert((SELECT count(source_id) FROM rmg_private.account_saved_guides)=2,
 'RLS allows the signed-in account to read its own items');

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
SELECT public.fixture_assert(public.rmg_account_saved_guides_v1('list','[]')='{"status":"listed","items":[]}'
 AND NOT EXISTS(SELECT source_id FROM rmg_private.account_saved_guides),
 'account switch isolates RPC and direct table SELECT');
SELECT public.fixture_assert(public.rmg_account_saved_guides_v1('remove','[{"jurisdiction":"WA","sourceId":"wa-987650001"}]')
 ='{"status":"removed","items":[]}', 'other account remove is a harmless no-op');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT public.fixture_assert(jsonb_array_length(public.rmg_account_saved_guides_v1('list','[]')->'items')=2,
 'first account retains its saved rows across sessions');
SELECT public.fixture_assert(public.rmg_account_saved_guides_v1('import',(
 SELECT jsonb_agg(jsonb_build_object('jurisdiction','OR','sourceId','OG.'||lpad(n::text,7,'0')||'.X&Y') ORDER BY n)
 FROM generate_series(1,47) n))->>'status'='imported','shortlist can explicitly import to 49');
SELECT public.fixture_assert(public.rmg_account_saved_guides_v1('import','[
  {"jurisdiction":"OR","sourceId":"OG.0000048.X&Y"},
  {"jurisdiction":"OR","sourceId":"OG.0000049.X&Y"}
 ]')->>'status'='full' AND (SELECT count(source_id) FROM rmg_private.account_saved_guides)=49,
 'oversize import changes no rows');
RESET ROLE;
