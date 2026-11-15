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
