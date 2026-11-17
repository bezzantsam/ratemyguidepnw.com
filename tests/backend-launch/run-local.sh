#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/rmg-launch-06.XXXXXXXX")
started=0
cleanup() { if [[ "$started" == 1 ]]; then pg_ctl -D "$tmp/data" -m immediate -w stop >/dev/null; fi; rm -rf -- "$tmp"; }
trap cleanup EXIT
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGSERVICE PGSERVICEFILE PGOPTIONS PGSSLMODE
initdb -D "$tmp/data" --username=audit_owner --auth=trust --no-locale >/dev/null
pg_ctl -D "$tmp/data" -o "-c listen_addresses='' -c unix_socket_directories='$tmp' -p 55442" -w start >/dev/null
started=1
ps=(psql -X -v ON_ERROR_STOP=1 -h "$tmp" -p 55442 -U audit_owner -d postgres)
python3 "$root/tests/backend-launch/reconstruct.py" > "$tmp/schema.sql"
"${ps[@]}" -f "$tmp/schema.sql" >/dev/null
"${ps[@]}" -f "$root/tests/backend-launch/fixtures.sql" >/dev/null
"${ps[@]}" -c "ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz, ADD COLUMN is_anonymous boolean NOT NULL DEFAULT false, ADD COLUMN deleted_at timestamptz; UPDATE auth.users SET email_confirmed_at=now();" >/dev/null
"${ps[@]}" -f "$root/supabase/review-candidates/01-authorization-lockdown.sql" >/dev/null
"${ps[@]}" -f "$root/supabase/review-candidates/02-launch-api.sql" >/dev/null
"${ps[@]}" -f "$root/tests/backend-launch/access.sql"
# Two independent database sessions race the same actor/guide pending claim.
# The first intentionally holds the transaction open; prove the second blocked.
"${ps[@]}" -c "UPDATE auth.users SET is_anonymous=false WHERE id='00000000-0000-0000-0000-000000000006'" >/dev/null
cat > "$tmp/first.sql" <<'SQL'
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
BEGIN;
SELECT public.rmg_submit_claim('OR','fixture-2','Synthetic claimant','',repeat('e',40));
SELECT pg_sleep(4);
COMMIT;
SQL
cat > "$tmp/second.sql" <<'SQL'
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
SELECT public.rmg_submit_claim('OR','fixture-2','Synthetic claimant','',repeat('e',40));
SQL
PGAPPNAME=rmg_launch_claim_first "${ps[@]}" -qAt -f "$tmp/first.sql" > "$tmp/first.log" 2>&1 &
first_pid=$!
ready=0
for attempt in {1..100}; do
 if [[ $("${ps[@]}" -Atc "SELECT count(*) FROM pg_stat_activity WHERE application_name='rmg_launch_claim_first' AND wait_event='PgSleep'") == 1 ]]; then ready=1; break; fi
 if ! kill -0 "$first_pid" 2>/dev/null; then break; fi
 sleep 0.02
done
if [[ "$ready" != 1 ]]; then wait "$first_pid" || true; cat "$tmp/first.log"; exit 1; fi
PGAPPNAME=rmg_launch_claim_second "${ps[@]}" -qAt -f "$tmp/second.sql" > "$tmp/second.log" 2>&1 &
second_pid=$!
blocked=0
for attempt in {1..100}; do
 if [[ $("${ps[@]}" -Atc "SELECT count(*) FROM pg_stat_activity WHERE application_name='rmg_launch_claim_second' AND cardinality(pg_blocking_pids(pid))>0") == 1 ]]; then blocked=1; break; fi
 if ! kill -0 "$second_pid" 2>/dev/null; then break; fi
 sleep 0.02
done
if [[ "$blocked" != 1 ]]; then wait "$second_pid" || true; wait "$first_pid" || true; cat "$tmp/second.log"; exit 1; fi
wait "$first_pid"
wait "$second_pid"
"${ps[@]}" -c "SELECT public.fixture_assert((SELECT count(*)=1 FROM public.guide_claims WHERE claimant_id='00000000-0000-0000-0000-000000000006' AND guide_id='10000000-0000-0000-0000-000000000002' AND status='pending'),'concurrent duplicate claims serialize to one row')"
if ! grep -q '"existing": true' "$tmp/second.log"; then cat "$tmp/second.log"; exit 1; fi
