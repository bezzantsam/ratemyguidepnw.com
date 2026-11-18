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
git -C "$root" rev-parse HEAD 'HEAD^{tree}'
python3 "$root/tests/backend-launch/assemble-migration.py" > "$tmp/expected-combined.sql"
cmp "$tmp/expected-combined.sql" "$root/supabase/review-candidates/launch-combined.sql"
sha256sum "$root/supabase/review-candidates/launch-combined.sql" "$root/tests/independent-qa/catalog-constraints-independent-v3.sql"
printf '%s  %s\n' 242930916c8177c445fc7210db177e96d551eea0e7b6cab398c95d246ef894cb "$root/tests/independent-qa/catalog-constraints-independent-v3.sql" | sha256sum -c -
"${ps[@]}" -f "$root/supabase/review-candidates/launch-combined.sql" >/dev/null
"${ps[@]}" -f "$root/tests/independent-qa/catalog-constraints-independent-v3.sql"
