-- Local review delta for the known synthetic grantee ONLY. Not a migration.
-- Revocation affects every member of that role; an actual grantee must first
-- be established and its other consumers reviewed. Do not apply to hosted DBs.
BEGIN;
REVOKE INSERT ON public.reviews FROM qa_legacy_grants;
REVOKE EXECUTE ON FUNCTION public.admin_decide_review(uuid,boolean,text) FROM qa_legacy_grants;
-- Effective checks include direct, PUBLIC, role-inherited and column grants.
-- If an additional grantee exists, abort the entire delta; do not guess or
-- silently remove privileges from other roles.
DO $$DECLARE role_name text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF has_any_column_privilege(role_name,'public.reviews','INSERT') OR
     has_function_privilege(role_name,'public.admin_decide_review(uuid,boolean,text)','EXECUTE') THEN
   RAISE EXCEPTION 'Inherited review write or moderation execute remains for %',role_name;
  END IF;
 END LOOP;
END$$;
COMMIT;
