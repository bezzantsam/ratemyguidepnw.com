#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
export PATH="/opt/homebrew/bin:$PATH"
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGSERVICE PGSERVICEFILE PGOPTIONS PGSSLMODE PGSSLROOTCERT
umask 077
tmp=$(mktemp -d "${TMPDIR:-/tmp}/rmg-preferred-name-06.XXXXXXXX")
started=0
cleanup() {
 if [[ "$started" == 1 ]]; then pg_ctl -D "$tmp/data" -m fast -w stop >/dev/null; fi
 rm -r -- "$tmp"
}
trap cleanup EXIT
initdb -D "$tmp/data" --username=audit_owner --auth=trust --no-locale --encoding=UTF8 >"$tmp/init.log" 2>&1
pg_ctl -D "$tmp/data" -l "$tmp/server.log" -o "-c listen_addresses='' -c unix_socket_directories='$tmp' -p 56434" -w start >/dev/null
started=1
ps=(psql -X -v ON_ERROR_STOP=1 -h "$tmp" -p 56434 -U audit_owner -d postgres)
python3 "$root/tests/backend-launch/reconstruct.py" > "$tmp/schema.sql"
"${ps[@]}" -q -f "$tmp/schema.sql"
"${ps[@]}" -q -f "$root/tests/backend-launch/fixtures.sql"
"${ps[@]}" -q -f "$root/tests/backend-launch/storage-existing-fixture.sql"
"${ps[@]}" -q -c "ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz, ADD COLUMN is_anonymous boolean NOT NULL DEFAULT false, ADD COLUMN deleted_at timestamptz; UPDATE auth.users SET email_confirmed_at=now(); CREATE TABLE public.review_flags(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),review_id uuid NOT NULL REFERENCES public.reviews(id),reporter_id uuid NOT NULL REFERENCES auth.users(id),reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(review_id,reporter_id)); ALTER TABLE public.review_flags ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.review_flags TO anon,authenticated;"
"${ps[@]}" -q -1 -f "$root/supabase/review-candidates/final-launch-migration-body.sql" -f "$root/supabase/review-candidates/09-oregon-reviews-split-v1.sql"
"${ps[@]}" -q -f "$root/tests/backend-launch/oregon-reviews-split-v1.sql" >/dev/null
"${ps[@]}" -q -f "$root/supabase/review-candidates/10-oregon-claims-v1.sql" -f "$root/supabase/review-candidates/11-guard-legacy-claim-decision-v1.sql"
"${ps[@]}" -q -f "$root/tests/backend-launch/oregon-claims-v1.sql" >/dev/null
"${ps[@]}" -q -1 -f "$root/supabase/review-candidates/structured-guide-offerings-v1.sql"
git -C "$root" show 656a98d:supabase/maintenance/revoke-oregon-guide-claim.sql > "$tmp/revoke.sql"
"${ps[@]}" -q -c "INSERT INTO public.guides(id,slug,full_name,listing_status) VALUES ('10000000-0000-0000-0000-000000000004','fixture-four','Existing declaration','published'); INSERT INTO public.guide_claims(id,guide_id,claimant_id,status) VALUES ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000006','approved'); INSERT INTO public.guide_details(guide_id,boat) VALUES ('10000000-0000-0000-0000-000000000004','Prior boat'); INSERT INTO rmg_private.profile_declarations(guide_id,declared_by) VALUES ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000006');"
python3 - "$root/supabase/review-candidates/08-preferred-name-v1.sql" "$tmp/injected.sql" <<'PYCODE'
import pathlib,sys
source=pathlib.Path(sys.argv[1]).read_text()
marker='END\n$migration$;'
if source.count(marker)!=1: raise SystemExit('Unexpected migration boundary')
pathlib.Path(sys.argv[2]).write_text(source.replace(marker,"RAISE EXCEPTION 'preferred_v1_injected';\n"+marker))
PYCODE
if "${ps[@]}" -q -1 -f "$tmp/injected.sql" >"$tmp/injected.log" 2>&1; then echo 'Injected migration unexpectedly succeeded' >&2; exit 1; fi
if ! /usr/bin/grep -q 'preferred_v1_injected' "$tmp/injected.log"; then echo 'Unexpected injected failure' >&2; exit 1; fi
"${ps[@]}" -q -c "SELECT public.fixture_assert(to_regclass('rmg_private.profile_name_admin_v1') IS NULL AND to_regclass('rmg_private.profile_name_audit_v1') IS NULL AND NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='rmg_private.profile_declarations'::regclass AND attname='details_declared' AND NOT attisdropped),'failure rolls back additive schema');"
"${ps[@]}" -q -1 -f "$root/supabase/review-candidates/08-preferred-name-v1.sql"
"${ps[@]}" -q -v "revocation_sql=$tmp/revoke.sql" -f "$root/tests/backend-launch/preferred-name-v1.sql"
"$root/tests/backend-launch/preferred-name-gate-race.sh" "$tmp"
"${ps[@]}" -q -1 -f "$root/supabase/review-candidates/08-preferred-name-v1-disable.sql"
"${ps[@]}" -q -f "$root/tests/backend-launch/preferred-name-disable-v1.sql"
printf 'PASS preferred-name-v1 synthetic PostgreSQL tests\n'
