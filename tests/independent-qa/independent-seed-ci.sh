#!/usr/bin/env bash
# Independent 05 synthetic seed guard checks; disposable GitHub-hosted runner only.
set -euo pipefail
set +x
umask 077
[[ "${RUNNER_ENVIRONMENT:-}" == github-hosted && -n "${RUNNER_TEMP:-}" && -n "${GITHUB_RUN_ID:-}" ]] || { echo 'Requires disposable hosted CI' >&2; exit 1; }
[[ $# == 1 && -d "$1" ]] || { echo 'Expected exact candidate root' >&2; exit 1; }
root=$(cd "$1" && pwd)
tmp=$(mktemp -d "$RUNNER_TEMP/rmg-seed-05.XXXXXXXX")
started=0
blocker_pid=''
cleanup() {
  if [[ -n "$blocker_pid" ]]; then kill "$blocker_pid" 2>/dev/null || true; wait "$blocker_pid" 2>/dev/null || true; fi
  if [[ "$started" == 1 ]]; then pg_ctl -D "$tmp/data" -m immediate -w stop >/dev/null || true; fi
  rm -rf -- "$tmp"
}
trap cleanup EXIT
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGSERVICE PGSERVICEFILE PGOPTIONS PGSSLMODE
printf '%s  %s\n' \
  74afb69db957037086c0e5ffddd2a8d312bed4ded3e446ba3f145284a351686d "$root/supabase/review-candidates/launch-combined.sql" \
  1ec9b5e3ea2e821ccf58695db6fa9ac7e59be7f22040f45ed44d6953cc602ac6 "$root/supabase/review-candidates/oregon-mapping-seed.sql" \
  3f0671e58d8d9f5615ba15668b7043fbc4f11859dafb10cf91068a5eb2a62081 "$root/lib/oregon-guides.json" \
  9f57ab89a9635500db309cfbcda9b2669e44055fce49682f7737823b1e4c426f "$root/supabase/review-candidates/assemble-oregon-seed.py" | sha256sum -c -
python3 "$root/supabase/review-candidates/assemble-oregon-seed.py" "$root/lib/oregon-guides.json" > "$tmp/regenerated.sql"
cmp "$tmp/regenerated.sql" "$root/supabase/review-candidates/oregon-mapping-seed.sql"
python3 "$root/supabase/review-candidates/assemble-oregon-seed.py" "$root/tests/backend-launch/fixtures/synthetic-oregon.json" > "$tmp/synthetic-seed.sql"
initdb -D "$tmp/data" --username=audit_owner --auth=trust --no-locale >/dev/null
pg_ctl -D "$tmp/data" -o "-c listen_addresses='' -c unix_socket_directories='$tmp' -p 55442" -w start >/dev/null
started=1
ps=(psql -X -v ON_ERROR_STOP=1 -h "$tmp" -p 55442 -U audit_owner -d postgres)
python3 "$root/tests/backend-launch/reconstruct.py" > "$tmp/schema.sql"
"${ps[@]}" -f "$tmp/schema.sql" >/dev/null
"${ps[@]}" -f "$root/tests/backend-launch/fixtures.sql" >/dev/null
"${ps[@]}" -c "ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz, ADD COLUMN is_anonymous boolean NOT NULL DEFAULT false, ADD COLUMN deleted_at timestamptz; UPDATE auth.users SET email_confirmed_at=now();" >/dev/null
"${ps[@]}" -f "$root/supabase/review-candidates/launch-combined.sql" >/dev/null
"${ps[@]}" -c "INSERT INTO public.guides(id,slug,full_name,license_number,listing_status) VALUES ('90000000-0000-0000-0000-000000000001','og-qatest001','Synthetic one','OG.QATEST001','published'),('90000000-0000-0000-0000-000000000002','og-qatest002','Synthetic two','OG.QATEST002','published'),('90000000-0000-0000-0000-000000000003','og-qatest003','Synthetic three','OG.QATEST003','published')" >/dev/null

# Existing cross-state identity must stop the automatic seed without any partial OR mapping.
"${ps[@]}" -c "INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference) VALUES ('WA','wa-synthetic','90000000-0000-0000-0000-000000000001',now(),'synthetic conflict')" >/dev/null
if "${ps[@]}" -f "$tmp/synthetic-seed.sql" > "$tmp/alias.log" 2>&1; then echo 'FAIL: cross-state alias accepted without review' >&2; exit 1; fi
if ! rg -q 'Cross-jurisdiction alias requires independent provenance review' "$tmp/alias.log"; then echo 'FAIL: unexpected alias error' >&2; exit 1; fi
"${ps[@]}" -c "SELECT public.fixture_assert((SELECT count(*)=0 FROM rmg_private.guide_identity_map WHERE jurisdiction='OR'),'cross-state guard leaves OR mappings untouched')" >/dev/null
"${ps[@]}" -c "DELETE FROM rmg_private.guide_identity_map WHERE jurisdiction='WA' AND source_id='wa-synthetic'" >/dev/null
"${ps[@]}" -f "$tmp/synthetic-seed.sql" >/dev/null
"${ps[@]}" -f "$tmp/synthetic-seed.sql" >/dev/null
"${ps[@]}" -c "SELECT public.fixture_assert((SELECT count(*)=3 FROM rmg_private.guide_identity_map WHERE jurisdiction='OR'),'synthetic seed is idempotent')" >/dev/null

# Simulate a concurrent table writer. The candidate's own 3s lock timeout must
# reject the seed while that writer holds the lock; neither mapping is altered.
PGAPPNAME=rmg_05_seed_blocker "${ps[@]}" -qAt -c "BEGIN; LOCK TABLE public.guides IN ROW EXCLUSIVE MODE; SELECT pg_sleep(6); COMMIT;" > "$tmp/blocker.log" 2>&1 &
blocker_pid=$!
ready=0
for attempt in {1..100}; do
  if [[ $("${ps[@]}" -Atc "SELECT count(*) FROM pg_stat_activity WHERE application_name='rmg_05_seed_blocker' AND wait_event='PgSleep'") == 1 ]]; then ready=1; break; fi
  if ! kill -0 "$blocker_pid" 2>/dev/null; then break; fi
  sleep 0.05
done
[[ "$ready" == 1 ]] || { echo 'FAIL: synthetic concurrent writer not ready' >&2; exit 1; }
if "${ps[@]}" -f "$tmp/synthetic-seed.sql" > "$tmp/lock.log" 2>&1; then echo 'FAIL: seed bypassed concurrent writer' >&2; exit 1; fi
if ! rg -q 'lock timeout' "$tmp/lock.log"; then echo 'FAIL: unexpected seed lock error' >&2; exit 1; fi
wait "$blocker_pid"
blocker_pid=''
"${ps[@]}" -c "SELECT public.fixture_assert((SELECT count(*)=3 FROM rmg_private.guide_identity_map WHERE jurisdiction='OR'),'lock timeout leaves mappings intact')" >/dev/null
echo 'PASS independent synthetic seed alias, idempotence and concurrent writer lock checks'
