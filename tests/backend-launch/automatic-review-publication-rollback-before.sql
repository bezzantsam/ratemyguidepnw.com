-- Keep this transaction/session open for the captured rollback and after checks.
BEGIN;
CREATE TEMP TABLE auto_rollback_receipts(name text PRIMARY KEY,receipt jsonb);
GRANT SELECT,INSERT ON auto_rollback_receipts TO authenticated;
INSERT INTO auth.users(id,email_confirmed_at)
 SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,now() FROM generate_series(171,174) n;
INSERT INTO public.site_admins(user_id) VALUES('00000000-0000-0000-0000-000000000174');
INSERT INTO public.guides(id,slug,full_name,listing_status)
 SELECT ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 'fixture-rollback-'||n,'Synthetic rollback guide '||n,'published' FROM generate_series(171,173) n;
INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference)
 SELECT 'OR','OG.'||lpad(n::text,7,'0')||'.F&F',
 ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,now(),'synthetic rollback'
 FROM generate_series(171,173) n;
UPDATE rmg_private.launch_control SET enabled=true WHERE singleton;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000171',true);
INSERT INTO auto_rollback_receipts SELECT 'published_'||n,public.rmg_submit_review_v3('OR',
 'OG.'||lpad(n::text,7,'0')||'.F&F',5::smallint,NULL,true,'Synthetic previously automatic review',true,'none',NULL,NULL,'{"equipment":4}')
 FROM generate_series(171,173) n;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000173',true);
INSERT INTO auto_rollback_receipts SELECT 'flag',public.rmg_report_review('OR','OG.0000171.F&F',(receipt->>'id')::uuid,'other')
 FROM auto_rollback_receipts WHERE name='published_171';
RESET ROLE;
