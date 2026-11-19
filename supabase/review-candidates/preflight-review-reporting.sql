-- Read-only reporting migration targets; no report contents or user identities.
SELECT jsonb_build_object(
 'captured_at',now(),
 'current_user',current_user,
 'relation',(SELECT jsonb_build_object('owner',pg_get_userbyid(relowner),'rls',relrowsecurity,'force_rls',relforcerowsecurity,'acl',relacl) FROM pg_class WHERE oid='public.review_flags'::regclass),
 'columns',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',attname,'type',format_type(atttypid,atttypmod),'not_null',attnotnull,'default',pg_get_expr(adbin,adrelid),'acl',attacl) ORDER BY attnum),'[]'::jsonb) FROM pg_attribute LEFT JOIN pg_attrdef ON adrelid=attrelid AND adnum=attnum WHERE attrelid='public.review_flags'::regclass AND attnum>0 AND NOT attisdropped),
 'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid)) ORDER BY conname),'[]'::jsonb) FROM pg_constraint WHERE conrelid='public.review_flags'::regclass),
 'indexes',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef) ORDER BY indexname),'[]'::jsonb) FROM pg_indexes WHERE schemaname='public' AND tablename='review_flags'),
 'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',policyname,'permissive',permissive,'roles',roles,'cmd',cmd,'using',qual,'check',with_check) ORDER BY policyname),'[]'::jsonb) FROM pg_policies WHERE schemaname='public' AND tablename='review_flags'),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) ORDER BY tgname),'[]'::jsonb) FROM pg_trigger WHERE tgrelid='public.review_flags'::regclass AND NOT tgisinternal),
 'name_collisions',jsonb_build_object('reporter_index',to_regclass('public.rmg_review_flags_reporter_time')::text,'pending_index',to_regclass('public.rmg_review_flags_pending_queue')::text,'submit_rpc',to_regprocedure('public.rmg_report_review(text,text,uuid,text)')::text,'queue_rpc',to_regprocedure('public.rmg_report_queue(integer,integer)')::text,'resolve_rpc',to_regprocedure('public.rmg_resolve_report(uuid)')::text),
 'report_count',(SELECT count(*) FROM public.review_flags)
) AS reporting_preflight;
