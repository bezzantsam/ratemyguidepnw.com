-- Read-only pre-change metadata. Contains no user, review, claim or credential rows.
WITH rels AS (
 SELECT c.oid,n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.reloptions,c.relacl,pg_get_userbyid(c.relowner) owner
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE (n.nspname='public' AND c.relname IN ('guides','guide_claims','claim_evidence','reviews','site_admins','guide_details','guide_media','moderation_audit','public_angler_reviews','admin_pending_reviews','admin_pending_claims'))
    OR (n.nspname='storage' AND c.relname='objects')
), funcs AS (
 SELECT p.oid,p.proname,p.proacl,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) owner,pg_get_functiondef(p.oid) definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('admin_decide_claim','admin_decide_review','is_site_admin','refresh_guide_rating','reviews_rating_trigger','throttle_review_submission')
)
SELECT jsonb_build_object(
 'captured_at',clock_timestamp(),'server_version',current_setting('server_version_num'),'current_user',current_user,
 'relations',(SELECT jsonb_agg(jsonb_build_object('schema',nspname,'name',relname,'kind',relkind,'owner',owner,'rls',relrowsecurity,'force_rls',relforcerowsecurity,'options',reloptions,'acl',relacl,'view',CASE WHEN relkind='v' THEN pg_get_viewdef(oid,true) ELSE NULL END) ORDER BY nspname,relname) FROM rels),
 'columns',(SELECT jsonb_agg(jsonb_build_object('schema',c.nspname,'table',c.relname,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'acl',a.attacl) ORDER BY c.nspname,c.relname,a.attnum) FROM rels c JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE c.relkind='r'),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('schema',c.nspname,'table',c.relname,'name',co.conname,'definition',pg_get_constraintdef(co.oid,true)) ORDER BY c.nspname,c.relname,co.conname) FROM rels c JOIN pg_constraint co ON co.conrelid=c.oid),
 'indexes',(SELECT jsonb_agg(jsonb_build_object('schema',c.nspname,'table',c.relname,'name',ic.relname,'definition',pg_get_indexdef(i.indexrelid)) ORDER BY c.nspname,c.relname,ic.relname) FROM rels c JOIN pg_index i ON i.indrelid=c.oid JOIN pg_class ic ON ic.oid=i.indexrelid),
 'policies',(SELECT jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'name',policyname,'permissive',permissive,'roles',roles,'command',cmd,'using',qual,'check',with_check) ORDER BY schemaname,tablename,policyname) FROM pg_policies WHERE (schemaname,tablename) IN (SELECT nspname,relname FROM rels)),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('schema',c.nspname,'table',c.relname,'name',t.tgname,'definition',pg_get_triggerdef(t.oid)) ORDER BY c.nspname,c.relname,t.tgname) FROM rels c JOIN pg_trigger t ON t.tgrelid=c.oid AND NOT t.tgisinternal),
 'functions',(SELECT jsonb_agg(jsonb_build_object('name',proname,'owner',owner,'security_definer',prosecdef,'config',proconfig,'acl',proacl,'definition',definition) ORDER BY proname) FROM funcs),
 'role_memberships',(SELECT jsonb_agg(jsonb_build_object('role',parent.rolname,'member',member.rolname,'inherit_option',m.inherit_option,'set_option',m.set_option) ORDER BY parent.rolname,member.rolname) FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid JOIN pg_roles member ON member.oid=m.member WHERE parent.rolname IN ('anon','authenticated') OR member.rolname IN ('anon','authenticated')),
 'storage_policy_md5',(SELECT md5(string_agg(policyname||'|'||cmd||'|'||roles::text||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''),E'\n' ORDER BY policyname)) FROM pg_policies WHERE schemaname='storage' AND tablename='objects'),
 'guide_photo_bucket',(SELECT jsonb_build_object('id',id,'public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types) FROM storage.buckets WHERE id='guide-photos')
) AS catalog;
