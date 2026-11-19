#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
cli=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
umask 077
work=$(mktemp -d "${TMPDIR:-/tmp}/rmg-oregon-split.XXXXXXXX")
mkdir "$work/home"
cd "$work"
clean=(env -i "PATH=$PATH" "HOME=$work/home" "TMPDIR=$work" LC_ALL=C)
run() { "${clean[@]}" "$@"; }
[[ $(run "$cli" --version) == 3.2.0 ]]
[[ $(run pg_config --version) == 'PostgreSQL 17.'* ]]
port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
run initdb -D "$work/data" --username=audit_owner --auth=trust --no-locale --encoding=UTF8 > "$work/init.log" 2>&1
run pg_ctl -D "$work/data" -l "$work/server.log" -o "-c listen_addresses=127.0.0.1 -c unix_socket_directories='$work' -p $port" -w start >/dev/null
trap 'run pg_ctl -D "$work/data" -m fast -w stop >/dev/null' EXIT
printf 'Disposable fixture %s\n' "$work"
ps=("${clean[@]}" psql -X -q -v ON_ERROR_STOP=1 -h "$work" -p "$port" -U audit_owner -d postgres)
sql() { "${ps[@]}" -At -c "$1"; }
db_url="postgresql://audit_owner@127.0.0.1:$port/postgres?sslmode=disable"
push() { run "$cli" db push --remote="$db_url" --skip-vault --yes "$@"; }
history() { sql "SELECT version || ':' || name || ':' || cardinality(statements) FROM supabase_migrations.schema_migrations ORDER BY version"; }
new() {
  local name=$1
  local -a versions
  run "$cli" migration new "$name"
  versions=(supabase/migrations/*_"$name".sql)
  [[ ${#versions[@]} == 1 && ${versions[0]} =~ ^supabase/migrations/([0-9]{14})_${name}\.sql$ ]]
  migration_file=${versions[0]}
  version=${BASH_REMATCH[1]}
  cp "$2" "$migration_file"
  shasum -a 256 "$migration_file"
  sleep 1.1
}

run "$cli" init
python3 "$root/tests/backend-launch/reconstruct.py" > "$work/schema.sql"
"${ps[@]}" -f "$work/schema.sql" -f "$root/tests/backend-launch/fixtures.sql"
sql "ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz, ADD COLUMN is_anonymous boolean NOT NULL DEFAULT false, ADD COLUMN deleted_at timestamptz;
UPDATE auth.users SET email_confirmed_at=now();
CREATE TABLE public.review_flags(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), review_id uuid NOT NULL REFERENCES public.reviews(id), reporter_id uuid NOT NULL REFERENCES auth.users(id), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(review_id,reporter_id));
ALTER TABLE public.review_flags ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.review_flags TO anon,authenticated;"

base="$root/supabase/review-candidates/final-launch-migration-body.sql"
[[ $(shasum -a 256 "$base" | awk '{print $1}') == e76030edd1cfe5d9b61ef48cf8132a96536f01f13e3030016890ab549b076f78 ]]
new rmg_final_launch_fixture "$base"
push
prior=$(history)
[[ "$prior" == "$version:rmg_final_launch_fixture:111" ]]
candidate="$root/supabase/review-candidates/09-oregon-reviews-split-v1.sql"
new rmg_oregon_reviews_split_v1 "$candidate"
sql "UPDATE rmg_private.launch_control SET enabled=true WHERE singleton;"
if push > open-gate.log 2>&1; then echo 'Candidate unexpectedly applied with base gate open' >&2; exit 1; fi
grep -q 'P5030' open-gate.log
[[ $(history) == "$prior" ]]
sql "UPDATE rmg_private.launch_control SET enabled=false WHERE singleton;"
echo 'PASS candidate requires a closed base gate'
printf '\nSELECT 1/0;\n' >> "$migration_file"
if push > rollback.log 2>&1; then echo 'Injected failure unexpectedly applied' >&2; exit 1; fi
grep -q '22012' rollback.log
[[ $(history) == "$prior" ]]
[[ $(sql "SELECT to_regclass('rmg_private.claim_control_v1') IS NULL AND to_regprocedure('rmg_private.review_queue_eligible_v1(uuid)') IS NULL") == t ]]
echo 'PASS injected failure rolls back candidate schema and history'
cp "$candidate" "$migration_file"
cmp "$candidate" "$migration_file"
push --dry-run
[[ $(history) == "$prior" ]]
push
recorded=$(history)
[[ "$recorded" == "$prior"$'\n'"$version:rmg_oregon_reviews_split_v1:"* ]]
[[ $(printf '%s\n' "$recorded" | wc -l | tr -d ' ') == 2 ]]
"${ps[@]}" -f "$root/tests/backend-launch/oregon-reviews-split-v1.sql" >/dev/null
run python3 "$root/tests/backend-launch/oregon-reviews-split-race.py" "$work" "$port"
if [[ $# -ge 2 ]]; then
  run python3 "$root/tests/backend-launch/oregon-reviews-split-storage.py" "$work" "$port" "$2"
fi
push
[[ $(history) == "$recorded" ]]
run "$cli" migration list --remote="$db_url"
printf 'PASS CLI history\n%s\n' "$recorded"
