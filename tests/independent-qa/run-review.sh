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
sha256sum "$root/supabase/review-candidates/01-authorization-lockdown.sql" "$root/supabase/review-candidates/02-launch-api.sql" "$root/supabase/review-candidates/04-review-revisions.sql" "$root/supabase/review-candidates/05-storage-via-claim-visibility.sql" "$root/supabase/review-candidates/launch-combined.sql" "$root/tests/independent-qa/independent-disposable-boundaries-v2.sql" "$root/tests/independent-qa/independent-privacy-null-v2.sql"
printf '%s  %s\n' b74d6bf9f6baef22dd1f4c9051bedf0972ddfbdd6fbb0315da05994255981bfd "$root/tests/independent-qa/independent-disposable-boundaries-v2.sql" 8f3d0b570de30ead5846c8cd8dece37b25f4c2f8da9a07f612f53d622a02284a "$root/tests/independent-qa/independent-privacy-null-v2.sql" | sha256sum -c -
"${ps[@]}" -f "$root/supabase/review-candidates/launch-combined.sql" >/dev/null
"${ps[@]}" -f "$root/tests/backend-launch/gate.sql"
"${ps[@]}" -f "$root/tests/independent-qa/independent-disposable-boundaries-v2.sql"
"${ps[@]}" -f "$root/tests/independent-qa/independent-privacy-null-v2.sql"
