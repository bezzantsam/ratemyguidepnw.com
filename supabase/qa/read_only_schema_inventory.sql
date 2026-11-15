-- READ ONLY / INSPECTION ONLY, for OWNER-APPROVED project restoration and staging analysis.
-- DO NOT RUN UNTIL THE USER HAS APPROVED RESTORING THE INACTIVE PROJECT.
-- Run individually in a project-owner review context; avoid logging real user records.
-- This is metadata: never selects auth.users, guide_claims, review bodies or credentials.

-- 1. Actual public tables/views present in the deployed database.
select table_schema, table_name, table_type
from information_schema.tables
where table_schema = 'public'
order by table_name;

-- 2. Real columns backing the app's review, claim and fishery contracts.
select table_name, ordinal_position, column_name, data_type,
       is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'guides', 'guide_claims', 'claim_evidence', 'reviews',
    'public_angler_reviews', 'guide_fishery_proposals',
    'guide_replies', 'moderation_events'
  )
order by table_name, ordinal_position;

-- 3. RLS enabled/forced, and security_invoker view options.
select n.nspname as schema_name, c.relname as object_name,
       c.relkind as object_kind, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced,
       c.reloptions as view_or_table_options
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p', 'v', 'm')
order by c.relname;

-- 4. Actual RLS policies (do not infer from schema files).
select schemaname, tablename, policyname, permissive, roles, cmd,
       qual as using_clause, with_check as insert_or_update_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 5. Client grants may be broad even when RLS appears safe.
select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
order by table_name, grantee, privilege_type;

-- 6. Column-level grants for pending proposal metadata safety.
select table_schema, table_name, column_name, grantee, privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and table_name in ('guide_fishery_proposals', 'reviews', 'guide_claims')
  and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
order by table_name, column_name, grantee, privilege_type;

-- 7. Check public views do not run with privileged access unexpectedly.
select schemaname, viewname, definition
from pg_views
where schemaname = 'public'
  and viewname in ('public_angler_reviews')
order by viewname;

-- Additional gate (not automatable by this read-only file):
-- Test JWT-backed auth.uid() ownership for real anon, approved claimant,
-- wrong claimant, revoked claimant and moderator *in a disposable staging DB*.
-- Verify inserts cannot set review_state/published_at/verified credentials.
-- Verify published-only views never disclose pending review bodies or PII.
