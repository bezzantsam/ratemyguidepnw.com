#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
available=$(df -Pk "${TMPDIR:-/tmp}" | awk 'NR==2 {print $4}')
[[ "$available" =~ ^[0-9]+$ && "$available" -ge 153600 ]] || { echo 'Need at least 150 MiB free for one disposable PostgreSQL fixture' >&2; exit 1; }
tmp=$(mktemp -d "${TMPDIR:-/tmp}/rmg-report-06.XXXXXXXX")
started=0
postgrest_pid=''
cleanup() { if [[ -n "$postgrest_pid" ]]; then kill "$postgrest_pid" 2>/dev/null || true; wait "$postgrest_pid" 2>/dev/null || true; fi; if [[ "$started" == 1 ]]; then pg_ctl -D "$tmp/data" -m immediate -w stop >/dev/null; fi; rm -rf -- "$tmp"; }
trap cleanup EXIT
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGSERVICE PGSERVICEFILE PGOPTIONS PGSSLMODE
initdb -D "$tmp/data" --username=audit_owner --auth=trust --no-locale >/dev/null
pg_ctl -D "$tmp/data" -o "-c listen_addresses='' -c unix_socket_directories='$tmp' -p 55443" -w start >/dev/null
started=1
ps=(psql -X -v ON_ERROR_STOP=1 -h "$tmp" -p 55443 -U audit_owner -d postgres)
python3 "$root/tests/backend-launch/reconstruct.py" > "$tmp/schema.sql"
"${ps[@]}" -f "$tmp/schema.sql" >/dev/null
"${ps[@]}" -f "$root/tests/backend-launch/fixtures.sql" >/dev/null
"${ps[@]}" -c "ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz, ADD COLUMN is_anonymous boolean NOT NULL DEFAULT false, ADD COLUMN deleted_at timestamptz; UPDATE auth.users SET email_confirmed_at=now(); CREATE TABLE public.review_flags(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), review_id uuid NOT NULL REFERENCES public.reviews(id), reporter_id uuid NOT NULL REFERENCES auth.users(id), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(review_id,reporter_id)); ALTER TABLE public.review_flags ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.review_flags TO anon,authenticated;" >/dev/null
python3 "$root/tests/backend-launch/assemble-reporting-migration.py" > "$tmp/reporting-body.sql"
cmp "$tmp/reporting-body.sql" "$root/supabase/review-candidates/review-reporting-migration-body.sql"
python3 "$root/tests/backend-launch/assemble-month-recovery-migration.py" > "$tmp/month-body.sql"
cmp "$tmp/month-body.sql" "$root/supabase/review-candidates/review-month-recovery-migration-body.sql"
python3 "$root/tests/backend-launch/assemble-final-launch.py" launch > "$tmp/final-launch.sql"
cmp "$tmp/final-launch.sql" "$root/supabase/review-candidates/final-launch-migration-body.sql"
# The runner owns the transaction. A failure after the complete body must roll it all back.
baseline_query="SELECT md5(concat_ws('|',(SELECT relacl::text FROM pg_class WHERE oid='public.reviews'::regclass),(SELECT relacl::text FROM pg_class WHERE oid='public.review_flags'::regclass),(SELECT proacl::text||pg_get_functiondef(oid) FROM pg_proc WHERE oid='public.admin_decide_review(uuid,boolean,text)'::regprocedure),(SELECT count(*)::text FROM public.reviews),(SELECT count(*)::text FROM public.guide_claims),(SELECT count(*)::text FROM public.review_flags)))"
baseline=$("${ps[@]}" -Atc "$baseline_query")
if "${ps[@]}" -1 -f "$tmp/final-launch.sql" -c 'SELECT 1/0' >"$tmp/injected-failure.log" 2>&1; then echo 'Injected final-migration failure unexpectedly succeeded' >&2; exit 1; fi
[[ "$baseline" == "$("${ps[@]}" -Atc "$baseline_query")" ]] || { echo 'Injected failure changed sampled baseline grants, function or row counts' >&2; exit 1; }
"${ps[@]}" -c "SELECT public.fixture_assert(to_regnamespace('rmg_private') IS NULL AND NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.review_flags'::regclass AND attname='status' AND NOT attisdropped) AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.reviews'::regclass AND conname='reviews_body_check' AND pg_get_constraintdef(oid) LIKE '%80%'),'final migration failure rolled back base and additive changes');"
"${ps[@]}" -1 -f "$tmp/final-launch.sql" >/dev/null
"${ps[@]}" >/dev/null <<'SQL'
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
DO $$BEGIN BEGIN PERFORM public.rmg_report_review('OR','fixture-one','30000000-0000-0000-0000-000000000001','other'); RAISE EXCEPTION 'disabled report unexpectedly succeeded'; EXCEPTION WHEN SQLSTATE 'P5030' THEN NULL; END; END$$;
SQL
"${ps[@]}" -c "UPDATE rmg_private.launch_control SET enabled=true WHERE singleton;" >/dev/null
# Run the existing authorization, revision, ratings and identity checks after
# the additive migration, then discard their synthetic writes before reporting tests.
"${ps[@]}" >/dev/null <<SQL
BEGIN;
\i '$root/tests/backend-launch/access.sql'
\i '$root/tests/backend-launch/revisions.sql'
ROLLBACK;
SQL
"${ps[@]}" >/dev/null <<SQL
BEGIN;
\i '$root/tests/backend-launch/month-recovery.sql'
ROLLBACK;
SQL
"${ps[@]}" -c "INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference) VALUES ('OR','fixture-one','10000000-0000-0000-0000-000000000001',now(),'fixture'),('OR','fixture-two','10000000-0000-0000-0000-000000000002',now(),'fixture');" >/dev/null
"${ps[@]}" >/dev/null <<'SQL'
BEGIN READ ONLY;
SET ROLE anon;
SELECT public.fixture_assert(NOT (public.rmg_review_write_availability('OR','fixture-one')->>'available')::boolean,'read-only transaction is not reported writable');
ROLLBACK;
SQL
if [[ -n "${RMG_INDEPENDENT_SQL_DIR:-}" ]]; then
 for name in independent-boundaries.sql independent-privacy-gate.sql; do
  [[ -f "$RMG_INDEPENDENT_SQL_DIR/$name" ]] || { echo 'Missing independent QA assertion file' >&2; exit 1; }
  "${ps[@]}" -f "$RMG_INDEPENDENT_SQL_DIR/$name" >/dev/null
 done
fi
"${ps[@]}" -f "$root/tests/backend-launch/reporting.sql"
# Two sessions deliberately overlap a retry against the same actor/review.
cat > "$tmp/first.sql" <<'SQL'
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
BEGIN;
SELECT public.rmg_report_review('OR','rate-1','70000000-0000-0000-0000-000000000001','other');
SELECT pg_sleep(3);
COMMIT;
SQL
cat > "$tmp/second.sql" <<'SQL'
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
SELECT public.rmg_report_review('OR','rate-1','70000000-0000-0000-0000-000000000001','other');
SQL
PGAPPNAME=rmg_report_first "${ps[@]}" -qAt -f "$tmp/first.sql" > "$tmp/first.log" 2>&1 & first=$!
ready=0
for attempt in {1..100}; do
 if [[ $("${ps[@]}" -Atc "SELECT count(*) FROM pg_stat_activity WHERE application_name='rmg_report_first' AND wait_event='PgSleep'") == 1 ]]; then ready=1; break; fi
 if ! kill -0 "$first" 2>/dev/null; then break; fi
 sleep 0.02
done
[[ "$ready" == 1 ]] || { wait "$first" || true; echo 'First report transaction did not reach overlap' >&2; exit 1; }
PGAPPNAME=rmg_report_second "${ps[@]}" -qAt -f "$tmp/second.sql" > "$tmp/second.log" 2>&1 & second=$!
blocked=0
for attempt in {1..100}; do
 if [[ $("${ps[@]}" -Atc "SELECT count(*) FROM pg_stat_activity WHERE application_name='rmg_report_second' AND cardinality(pg_blocking_pids(pid))>0") == 1 ]]; then blocked=1; break; fi
 if ! kill -0 "$second" 2>/dev/null; then break; fi
 sleep 0.02
done
[[ "$blocked" == 1 ]] || { wait "$second" || true; wait "$first" || true; echo 'Retry did not block behind first transaction' >&2; exit 1; }
wait "$first"
wait "$second"
grep -q '"existing": true' "$tmp/second.log"
"${ps[@]}" -c "SELECT public.fixture_assert((SELECT count(*)=1 FROM public.review_flags WHERE reporter_id='00000000-0000-0000-0000-000000000003' AND review_id='70000000-0000-0000-0000-000000000001'),'concurrent report retries persist one row');"
if [[ -n "${RMG_REPORT_POSTGREST:-}" ]]; then
 [[ -x "$RMG_REPORT_POSTGREST" ]] || { echo 'PostgREST executable not found' >&2; exit 1; }
 "${ps[@]}" >/dev/null <<'SQL'
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
SQL
 port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')
 secret=$(python3 -c 'import secrets;print(secrets.token_urlsafe(48))')
 db_uri=$(python3 -c 'import sys,urllib.parse; print("postgresql://audit_owner@/postgres?host="+urllib.parse.quote(sys.argv[1],safe="")+"&port=55443")' "$tmp")
 DYLD_FALLBACK_LIBRARY_PATH="${RMG_REPORT_PQ_LIB_DIR:-}" PGRST_DB_URI="$db_uri" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$secret" PGRST_SERVER_HOST=127.0.0.1 PGRST_SERVER_PORT="$port" "$RMG_REPORT_POSTGREST" >"$tmp/postgrest.log" 2>&1 & postgrest_pid=$!
 if ! RMG_REPORT_TEST_URL="http://127.0.0.1:$port" RMG_REPORT_TEST_SECRET="$secret" python3 "$root/tests/backend-launch/reporting-http.py"; then
  RMG_REPORT_LOG="$tmp/postgrest.log" RMG_REPORT_TEST_SECRET="$secret" python3 - <<'PY'
import os,pathlib,re
s=pathlib.Path(os.environ['RMG_REPORT_LOG']).read_text(errors='replace').replace(os.environ['RMG_REPORT_TEST_SECRET'],'[redacted]')
s=re.sub(r'(?i)bearer\s+\S+','Bearer [redacted]',s)
for line in s.splitlines()[-8:]: print(line[:500])
PY
  exit 1
 fi
 kill "$postgrest_pid"; wait "$postgrest_pid" || true; postgrest_pid=''
fi
"${ps[@]}" -f "$root/supabase/review-candidates/disable-review-reporting.sql" >/dev/null
"${ps[@]}" -c "SELECT public.fixture_assert(NOT has_function_privilege('authenticated','public.rmg_report_review(text,text,uuid,text)','EXECUTE') AND (SELECT count(*)>=12 FROM public.review_flags),'emergency reporting disable revokes access and retains reports');"
"${ps[@]}" -f "$root/supabase/review-candidates/disable-review-v26.sql" >/dev/null
"${ps[@]}" -c "SELECT public.fixture_assert(NOT has_function_privilege('authenticated','public.rmg_submit_review_v2(text,text,smallint,smallint,boolean,text,boolean,text,jsonb,text)','EXECUTE') AND (SELECT count(*)>=14 FROM public.reviews),'v2.6 disable revokes access and retains reviews');"
python3 "$root/tests/backend-launch/assemble-final-launch.py" disable > "$tmp/final-disable.sql"
cmp "$tmp/final-disable.sql" "$root/supabase/review-candidates/final-launch-disable-body.sql"
counts_query="SELECT concat_ws(',',(SELECT count(*) FROM public.reviews),(SELECT count(*) FROM public.review_flags),(SELECT count(*) FROM rmg_private.review_revisions),(SELECT count(*) FROM public.guide_claims),(SELECT count(*) FROM public.moderation_audit),(SELECT count(*) FROM rmg_private.guide_identity_map))"
before=$("${ps[@]}" -Atc "$counts_query")
"${ps[@]}" -1 -f "$tmp/final-disable.sql" >/dev/null
after=$("${ps[@]}" -Atc "$counts_query")
[[ "$before" == "$after" ]] || { echo 'Emergency disable changed retained row counts' >&2; exit 1; }
"${ps[@]}" -c "SELECT public.fixture_assert((SELECT NOT enabled FROM rmg_private.launch_control WHERE singleton) AND NOT has_function_privilege('authenticated','public.rmg_submit_review_v2(text,text,smallint,smallint,boolean,text,boolean,text,jsonb,text)','EXECUTE') AND NOT has_function_privilege('authenticated','public.rmg_report_review(text,text,uuid,text)','EXECUTE'),'final disable closes launch gate and v2 RPCs without deleting rows');"
