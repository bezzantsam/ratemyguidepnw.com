#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
foundation=$(cd "$(dirname "${1:?supply exact 01 claim SQL}")" && pwd)/$(basename "$1")
umask 077
work=$(mktemp -d "${TMPDIR:-/tmp}/rmg-guide-offerings.XXXXXXXX")
mkdir "$work/home"
cd "$work"
clean=(env -i "PATH=$PATH" "HOME=$work/home" "TMPDIR=$work" LC_ALL=C)
run() { "${clean[@]}" "$@"; }
[[ $(run pg_config --version) == 'PostgreSQL 17.'* ]]
run initdb -D "$work/data" --username=audit_owner --auth=trust --no-locale --encoding=UTF8 >"$work/init.log" 2>&1
run pg_ctl -D "$work/data" -l "$work/server.log" -o "-c listen_addresses='' -c unix_socket_directories='$work'" -w start >/dev/null
cleanup() {
  run pg_ctl -D "$work/data" -m fast -w stop >/dev/null
  cd /
  rm -r -- "$work"
}
trap cleanup EXIT
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
printf 'Claim foundation SHA-256 '
shasum -a 256 "$foundation" | awk '{print $1}'
"${ps[@]}" -f "$foundation"
"${ps[@]}" -1 -f "$candidate/structured-guide-offerings-v1.sql"
"${ps[@]}" -v "disable_sql=$candidate/structured-guide-offerings-disable-v1.sql"  -f "$root/tests/backend-launch/structured-guide-offerings-v1.sql"
run python3 "$root/tests/backend-launch/structured-guide-offerings-race.py" "$work"
run node "$root/tests/backend-launch/structured-guide-offerings-http.mjs" "$work"

if [[ ${2:-} == --review-summaries || ${2:-} == --wa-review-summaries ]]; then
  "${ps[@]}" -1 -f "$candidate/public-review-summaries-v1.sql"
  "${ps[@]}" -f "$root/tests/backend-launch/public-review-summaries-v1.sql"
fi

if [[ ${2:-} == --wa-review-summaries ]]; then
  "${ps[@]}" -1 -f "$candidate/wa-review-pilot-v1.sql" -f "$candidate/wa-listed-review-identity-proof-v1.sql" \
    -f "$candidate/wa-listed-review-adapter-v1.sql" -f "$candidate/wa-listed-review-summaries-v1.sql"
  "${ps[@]}" -v "listed_pause=$candidate/wa-listed-review-identity-disable-v1.sql" \
    -f "$root/tests/backend-launch/wa-listed-review-summaries-v1.sql"
fi
