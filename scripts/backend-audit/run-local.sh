#!/usr/bin/env bash
set -euo pipefail
# A fresh, socket-only cluster; never consult DATABASE_URL, PGHOST or .env.
root=$(cd "$(dirname "$0")/../.." && pwd)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/ratemyguide-backend-audit.XXXXXXXX")
started=0
cleanup() {
  if [[ "$started" == 1 ]]; then pg_ctl -D "$tmp/data" -m immediate -w stop >/dev/null; fi
  rm -rf -- "$tmp"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGSERVICE PGSERVICEFILE PGOPTIONS PGSSLMODE
initdb -D "$tmp/data" --username=audit_owner --auth=trust --no-locale >/dev/null
# No TCP listener: the per-run socket directory also isolates the port namespace.
pg_ctl -D "$tmp/data" -o "-c listen_addresses='' -c unix_socket_directories='$tmp' -p 55439" -w start >/dev/null
started=1
python3 "$root/scripts/backend-audit/reconstruct.py" > "$tmp/schema.sql"
psql -X -v ON_ERROR_STOP=1 -h "$tmp" -p 55439 -U audit_owner -d postgres -f "$tmp/schema.sql" >/dev/null
psql -X -v ON_ERROR_STOP=1 -h "$tmp" -p 55439 -U audit_owner -d postgres -f "$root/tests/backend-audit/authorization.sql"

# A separate database keeps the captured baseline test isolated from the repair.
psql -X -v ON_ERROR_STOP=1 -h "$tmp" -p 55439 -U audit_owner -d postgres -c 'CREATE DATABASE repair_test' >/dev/null
repair=(psql -X -v ON_ERROR_STOP=1 -h "$tmp" -p 55439 -U audit_owner -d repair_test)
# Roles belong to the cluster and were already created for the baseline DB.
sed '/^CREATE ROLE /d' "$tmp/schema.sql" > "$tmp/repair-schema.sql"
"${repair[@]}" -f "$tmp/repair-schema.sql" >/dev/null
"${repair[@]}" -f "$root/tests/backend-audit/repair-fixtures.sql" >/dev/null
"${repair[@]}" -f "$root/scripts/backend-audit/proposed-authorization-lockdown.sql" >/dev/null
"${repair[@]}" -f "$root/tests/backend-audit/locked-state.sql"
"${repair[@]}" -f "$root/tests/backend-audit/enabled-state.sql"
"${repair[@]}" -f "$root/tests/backend-audit/concurrency-setup.sql" >/dev/null
PGAPPNAME=ratemyguide_race_a "${repair[@]}" -f "$root/tests/backend-audit/concurrency-first.sql" >"$tmp/race-a.log" 2>&1 &
race_pid=$!
ready=0
for attempt in {1..100}; do
  if [[ $("${repair[@]}" -Atc "SELECT count(*) FROM pg_stat_activity WHERE application_name='ratemyguide_race_a' AND wait_event='PgSleep'") == 1 ]]; then ready=1; break; fi
  if ! kill -0 "$race_pid" 2>/dev/null; then break; fi
  sleep 0.05
done
if [[ "$ready" != 1 ]]; then
  wait "$race_pid" || true
  cat "$tmp/race-a.log"
  echo 'first concurrency session did not acquire the guide lock' >&2
  exit 1
fi
PGAPPNAME=ratemyguide_race_b "${repair[@]}" -f "$root/tests/backend-audit/concurrency-second.sql" >"$tmp/race-b.log" 2>&1 &
race_b_pid=$!
blocked=0
for attempt in {1..100}; do
  if [[ $("${repair[@]}" -Atc "SELECT count(*) FROM pg_stat_activity WHERE application_name='ratemyguide_race_b' AND cardinality(pg_blocking_pids(pid)) > 0") == 1 ]]; then blocked=1; break; fi
  if ! kill -0 "$race_b_pid" 2>/dev/null; then break; fi
  sleep 0.02
done
if [[ "$blocked" != 1 ]]; then
  wait "$race_b_pid" || true
  wait "$race_pid" || true
  echo 'second concurrency session did not block on the first' >&2
  cat "$tmp/race-b.log" >&2
  exit 1
fi
if wait "$race_b_pid"; then
  echo 'competing claim unexpectedly succeeded' >&2
  wait "$race_pid" || true
  exit 1
fi
wait "$race_pid"
if ! grep -q 'A captain is already approved for this listing' "$tmp/race-b.log"; then
  cat "$tmp/race-b.log" >&2
  exit 1
fi
"${repair[@]}" -f "$root/tests/backend-audit/concurrency-check.sql"
