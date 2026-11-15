-- Read-only catalog snapshot; contains schema definitions and grants, never rows.
-- Run only against the explicitly identified RateMyGuidePNW project.
WITH rels AS (
 SELECT c.oid,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.reloptions
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('regions','jurisdictions','waterways','species','guides','guide_claims','claim_evidence','reviews','site_admins','guide_details','moderation_audit','guide_replies','public_angler_reviews','admin_pending_reviews','admin_pending_claims')
), funcs AS (
 SELECT p.oid,p.proname,p.prosecdef,p.proconfig,p.proacl,pg_get_functiondef(p.oid) definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('admin_decide_claim','admin_decide_review','is_site_admin','refresh_guide_rating','reviews_rating_trigger','throttle_review_submission')
)
SELECT jsonb_build_object(
 'server_version',current_setting('server_version_num'),
 'relations',(SELECT jsonb_agg(jsonb_build_object('name',relname,'kind',relkind,'rls',relrowsecurity,'force_rls',relforcerowsecurity,'options',reloptions,'view',CASE WHEN relkind='v' THEN pg_get_viewdef(oid,true) ELSE null END) ORDER BY relname) FROM rels),
 'columns',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY c.relname,a.attnum) FROM rels c JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE c.relkind='r'),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',co.conname,'definition',pg_get_constraintdef(co.oid,true)) ORDER BY c.relname,co.conname) FROM rels c JOIN pg_constraint co ON co.conrelid=c.oid),
 'indexes',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',ic.relname,'definition',pg_get_indexdef(i.indexrelid)) ORDER BY c.relname,ic.relname) FROM rels c JOIN pg_index i ON i.indrelid=c.oid JOIN pg_class ic ON ic.oid=i.indexrelid WHERE NOT EXISTS(SELECT 1 FROM pg_constraint co WHERE co.conindid=i.indexrelid)),
 'policies',(SELECT jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'permissive',permissive,'roles',roles,'command',cmd,'using',qual,'check',with_check) ORDER BY tablename,policyname) FROM pg_policies WHERE schemaname='public' AND tablename IN (SELECT relname FROM rels)),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'definition',pg_get_triggerdef(t.oid)) ORDER BY c.relname,t.tgname) FROM rels c JOIN pg_trigger t ON t.tgrelid=c.oid AND NOT t.tgisinternal),
 'functions',(SELECT jsonb_agg(jsonb_build_object('name',proname,'security_definer',prosecdef,'config',proconfig,'acl',proacl,'definition',definition) ORDER BY proname) FROM funcs),
 'table_grants',(SELECT jsonb_agg(jsonb_build_object('table',table_name,'grantee',grantee,'privilege',privilege_type) ORDER BY table_name,grantee,privilege_type) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN (SELECT relname FROM rels) AND grantee IN ('anon','authenticated')),
 'column_select_grants',(SELECT jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'grantee',grantee) ORDER BY table_name,column_name,grantee) FROM information_schema.column_privileges WHERE table_schema='public' AND table_name IN (SELECT relname FROM rels) AND grantee IN ('anon','authenticated') AND privilege_type='SELECT')
) AS snapshot;
