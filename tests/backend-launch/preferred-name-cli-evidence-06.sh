#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$1" && pwd)
binary=$(cd "$(dirname "$2")" && pwd)/$(basename "$2")
umask 077
work=$(mktemp -d "${TMPDIR:-/tmp}/rmg-preferred-cli.XXXXXXXX")
mkdir "$work/home"
cd "$work"
clean=(env -i "PATH=$PATH" "HOME=$work/home" "TMPDIR=$work" LC_ALL=C)
cli() { "${clean[@]}" "$binary" "$@"; }
[[ "$(cli --version)" == 3.2.0 ]]
cli db push --help > push-help.txt
grep -q -- '--remote' push-help.txt
grep -q -- '--skip-vault' push-help.txt
cli migration list --help > list-help.txt
grep -q -- '--remote' list-help.txt

port=56439
db_url="postgresql://rmg_cli_fixture@127.0.0.1:$port/rmg_cli_fixture?sslmode=disable"
pg() { "${clean[@]}" "$@"; }
pg initdb -D "$work/data" --username=rmg_cli_fixture --auth=trust --no-locale --encoding=UTF8 > init.log 2>&1
pg pg_ctl -D "$work/data" -l "$work/server.log" -o "-c listen_addresses=127.0.0.1 -c unix_socket_directories='$work' -p $port" -w start
trap 'pg pg_ctl -D "$work/data" -m fast -w stop' EXIT
pg createdb -h "$work" -p "$port" -U rmg_cli_fixture rmg_cli_fixture
ps=("${clean[@]}" psql -X -v ON_ERROR_STOP=1 -h "$work" -p "$port" -U rmg_cli_fixture -d rmg_cli_fixture)
sql() { "${ps[@]}" -Atq -c "$1"; }
[[ "$(sql "SELECT current_setting('server_version_num')::int / 10000")" == 17 ]]
[[ "$(sql "SELECT current_database() || '/' || current_user")" == rmg_cli_fixture/rmg_cli_fixture ]]
printf 'Supabase CLI %s on PostgreSQL %s
' "$(cli --version)" "$(sql 'SHOW server_version')"
cli init

version=''
new_migration() {
  local name=$1 body=$2 previous=$version
  local -a file
  cli migration new "$name"
  file=(supabase/migrations/*_"$name".sql)
  [[ ${#file[@]} == 1 && -f "${file[0]}" ]]
  [[ ${file[0]} =~ ^supabase/migrations/([0-9]{14})_${name}\.sql$ ]]
  version=${BASH_REMATCH[1]}
  [[ "$version" > "$previous" ]]
  cp "$body" "${file[0]}"
  cmp "$body" "${file[0]}"
  migration_file=${file[0]}
  sha256sum "$migration_file"
  sleep 1.1
}
push() { cli db push --remote="$db_url" --skip-vault --yes "$@"; }
history() { sql "SELECT version || ':' || name || ':' || cardinality(statements) FROM supabase_migrations.schema_migrations ORDER BY version"; }
python3 "$root/tests/backend-launch/reconstruct.py" > "$work/schema.sql"
"${ps[@]}" -q -f "$work/schema.sql"
"${ps[@]}" -q -f "$root/tests/backend-launch/fixtures.sql"
"${ps[@]}" -q -f "$root/tests/backend-launch/storage-existing-fixture.sql"
"${ps[@]}" -q -c "ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz, ADD COLUMN is_anonymous boolean NOT NULL DEFAULT false, ADD COLUMN deleted_at timestamptz; UPDATE auth.users SET email_confirmed_at=now(); CREATE TABLE public.review_flags(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),review_id uuid NOT NULL REFERENCES public.reviews(id),reporter_id uuid NOT NULL REFERENCES auth.users(id),reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(review_id,reporter_id)); ALTER TABLE public.review_flags ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.review_flags TO anon,authenticated;"
new_migration rmg_final_launch_fixture "$root/supabase/review-candidates/final-launch-migration-body.sql"
launch=$version
push
"${ps[@]}" -q -c "INSERT INTO public.guides(id,slug,full_name,listing_status) VALUES ('10000000-0000-0000-0000-000000000004','fixture-four','Existing declaration','published'); INSERT INTO public.guide_claims(id,guide_id,claimant_id,status) VALUES ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000006','approved'); INSERT INTO public.guide_details(guide_id,boat) VALUES ('10000000-0000-0000-0000-000000000004','Prior boat'); INSERT INTO rmg_private.profile_declarations(guide_id,declared_by) VALUES ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000006');"

base_history=$(history)
[[ "$base_history" =~ ^$launch:rmg_final_launch_fixture:[1-9][0-9]*$ ]]
[[ "$(sql "SELECT enabled FROM rmg_private.launch_control WHERE singleton")" == f ]]
[[ "$(sql "SELECT to_regclass('rmg_private.profile_name_control_v1') IS NULL")" == t ]]
new_migration rmg_preferred_name_v1 "$root/supabase/review-candidates/08-preferred-name-v1.sql"
preferred=$version
push --dry-run
[[ "$(history)" == "$base_history" ]]
push
expected=$(printf '%s
' "$base_history" "$preferred:rmg_preferred_name_v1:1")
[[ "$(history)" == "$expected" ]]
[[ "$(sql "SELECT l.enabled, n.enabled FROM rmg_private.launch_control l CROSS JOIN rmg_private.profile_name_control_v1 n WHERE l.singleton AND n.singleton")" == 'f|f' ]]
printf 'PASS default launch=false and preferred-name=false; migration history
%s
' "$(history)"
push
[[ "$(history)" == "$expected" ]]

"${ps[@]}" -q -f "$root/tests/backend-launch/preferred-name-v1.sql"
fingerprint_sql="SELECT md5(jsonb_build_array(
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.guide_id) FROM rmg_private.profile_declarations t),
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)) FROM rmg_private.profile_name_admin_v1 t),
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)) FROM rmg_private.profile_name_audit_v1 t),
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.reviews t),
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.guide_claims t),
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.jurisdiction,t.source_id) FROM rmg_private.guide_identity_map t)
)::text)"
[[ "$(sql "SELECT l.enabled, n.enabled FROM rmg_private.launch_control l CROSS JOIN rmg_private.profile_name_control_v1 n WHERE l.singleton AND n.singleton")" == 't|t' ]]
before=$(sql "$fingerprint_sql")
new_migration rmg_preferred_name_v1_disable "$root/supabase/review-candidates/08-preferred-name-v1-disable.sql"
disable=$version
push --dry-run
[[ "$(history)" == "$expected" ]]
push
expected=$(printf '%s
' "$expected" "$disable:rmg_preferred_name_v1_disable:1")
[[ "$(history)" == "$expected" ]]
"${ps[@]}" -q -f "$root/tests/backend-launch/preferred-name-disable-v1.sql"
[[ "$(sql "$fingerprint_sql")" == "$before" ]]
[[ "$(sql "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','rmg_private') AND p.proname ~ '(^|_)(own_profile_name|set_profile_name|admin_set_profile_name|profile_name_review|profile_names)_v1$' AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')")" == 10 ]]
push
[[ "$(history)" == "$expected" ]]
cli migration list --remote="$db_url"
printf 'PASS name=false, base launch=true, all ten name RPC ACLs closed, synthetic data unchanged; migration history
%s
' "$(history)"
