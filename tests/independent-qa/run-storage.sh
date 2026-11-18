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
"${ps[@]}" -f "$root/tests/backend-launch/storage-fixture.sql" >/dev/null
"${ps[@]}" -c "ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz, ADD COLUMN is_anonymous boolean NOT NULL DEFAULT false, ADD COLUMN deleted_at timestamptz; UPDATE auth.users SET email_confirmed_at=now();" >/dev/null
"${ps[@]}" -f "$root/supabase/review-candidates/01-authorization-lockdown.sql" >/dev/null
"${ps[@]}" -f "$root/supabase/review-candidates/02-launch-api.sql" >/dev/null
"${ps[@]}" -f "$root/supabase/review-candidates/03-disable-uploads.sql" >/dev/null
sha256sum "$root/supabase/review-candidates/01-authorization-lockdown.sql" "$root/supabase/review-candidates/02-launch-api.sql" "$root/supabase/review-candidates/03-disable-uploads.sql" "$root/tests/independent-qa/independent-storage-rls.sql"
printf '%s  %s\n' b2052788f9b73119caf02f619d6d456673e59e545e0eb09496afa6c36de9a2ca "$root/tests/independent-qa/independent-storage-rls.sql" | sha256sum -c -
"${ps[@]}" -f "$root/tests/independent-qa/independent-storage-rls.sql"
