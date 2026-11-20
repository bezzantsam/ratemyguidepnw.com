#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
umask 077
work=$(mktemp -d "${TMPDIR:-/tmp}/rmg-wa-pilot.XXXXXXXX")
mkdir "$work/home"
cd "$work"
clean=(env -i "PATH=$PATH" "HOME=$work/home" "TMPDIR=$work" LC_ALL=C)
run() { "${clean[@]}" "$@"; }
[[ $(run pg_config --version) == 'PostgreSQL 17.'* ]]
run initdb -D "$work/data" --username=audit_owner --auth=trust --no-locale --encoding=UTF8 >"$work/init.log" 2>&1
# Private Unix socket and no TCP listener. No external connection setting is inherited.
run pg_ctl -D "$work/data" -l "$work/server.log" -o "-c listen_addresses='' -c unix_socket_directories='$work'" -w start >/dev/null
cleanup() {
  run pg_ctl -D "$work/data" -m fast -w stop >/dev/null
  if [[ ${1:-} == --listed-adapter ]]; then
    cd /
    rm -r -- "$work"
  fi
}
trap 'cleanup "${1:-}"' EXIT
printf 'Disposable PostgreSQL fixture %s\n' "$work"
ps=("${clean[@]}" psql -X -q -v ON_ERROR_STOP=1 -h "$work" -U audit_owner -d postgres)
run python3 "$root/tests/backend-launch/reconstruct.py" >"$work/schema.sql"
"${ps[@]}" -f "$work/schema.sql" -f "$root/tests/backend-launch/fixtures.sql"
"${ps[@]}" <<'SQL'
ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz,
 ADD COLUMN is_anonymous boolean NOT NULL DEFAULT false, ADD COLUMN deleted_at timestamptz;
UPDATE auth.users SET email_confirmed_at=now();
CREATE TABLE public.review_flags(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), review_id uuid NOT NULL REFERENCES public.reviews(id),
 reporter_id uuid NOT NULL REFERENCES auth.users(id), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(review_id,reporter_id));
ALTER TABLE public.review_flags ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.review_flags TO anon,authenticated;
SQL
candidate="$root/supabase/review-candidates"
[[ $(shasum -a 256 "$candidate/final-launch-migration-body.sql" | awk '{print $1}') == e76030edd1cfe5d9b61ef48cf8132a96536f01f13e3030016890ab549b076f78 ]]
[[ $(shasum -a 256 "$candidate/09-oregon-reviews-split-v1.sql" | awk '{print $1}') == 28ddf1ce024b0e2ac80e550e536fdfe37c0522e41aa0b0c245be7e0515f3f032 ]]
"${ps[@]}" -1 -f "$candidate/final-launch-migration-body.sql" -f "$candidate/09-oregon-reviews-split-v1.sql"
"${ps[@]}" -f "$root/tests/backend-launch/oregon-reviews-split-v1.sql" >/dev/null
echo 'PASS preflight Oregon split behavior on the fixture'
"${ps[@]}" -1 -f "$candidate/wa-review-pilot-v1.sql"
if [[ ${1:-} == --listed-adapter ]]; then
  "${ps[@]}" -1 -f "$candidate/wa-listed-review-identity-proof-v1.sql" -f "$candidate/wa-listed-review-adapter-v1.sql"
fi
"${ps[@]}" -f "$root/tests/backend-launch/oregon-reviews-split-v1.sql" >/dev/null
echo 'PASS original Oregon split tests with the unconfigured WA extension installed'
"${ps[@]}" -v "disable_sql=$candidate/wa-review-pilot-disable-v1.sql" -f "$root/tests/backend-launch/wa-review-pilot-v1.sql"
run python3 "$root/tests/backend-launch/wa-review-pilot-race.py" "$work"

if [[ ${1:-} == --listed-identity || ${1:-} == --listed-adapter ]]; then
  if [[ ${1:-} == --listed-identity ]]; then
    "${ps[@]}" -1 -f "$candidate/wa-listed-review-identity-proof-v1.sql"
  fi
  "${ps[@]}" -v "listed_disable_sql=$candidate/wa-listed-review-identity-disable-v1.sql" \
    -f "$root/tests/backend-launch/wa-listed-review-identity-proof-v1.sql"
fi
if [[ ${1:-} == --listed-adapter ]]; then
  "${ps[@]}" -v "listed_disable_sql=$candidate/wa-listed-review-identity-disable-v1.sql" \
    -f "$root/tests/backend-launch/wa-listed-review-adapter-v1.sql"
  run python3 "$root/tests/backend-launch/wa-review-pilot-race.py" "$work" --listed-adapter
fi
