#!/usr/bin/env bash
set -euo pipefail

# This runner creates roles and schema. It is only for a fresh local fixture
# cluster, never a Supabase URL, an existing database, or a production credential.
if [[ ${RMG_AUTOMATIC_PUBLICATION_FIXTURE:-} != 1 ]]; then
  echo 'Set RMG_AUTOMATIC_PUBLICATION_FIXTURE=1 for a disposable local PostgreSQL 17 fixture.' >&2
  exit 2
fi
fixture_host=${RMG_FIXTURE_HOST:-127.0.0.1}
fixture_port=${RMG_FIXTURE_PORT:-5432}
case "$fixture_host" in
  127.0.0.1|localhost|::1) ;;
  *) echo 'Fixture host must be localhost.' >&2; exit 2 ;;
esac
if [[ ! "$fixture_port" =~ ^[0-9]+$ ]] || (( fixture_port < 1 || fixture_port > 65535 )); then
  echo 'Invalid local fixture port.' >&2
  exit 2
fi
if [[ ${RMG_FIXTURE_PASSWORD:-} != rmg-local-fixture-only ]]; then
  echo 'Use only the documented synthetic fixture password.' >&2
  exit 2
fi

root=$(cd "$(dirname "$0")/../.." && pwd)
umask 077
work=$(mktemp -d "${TMPDIR:-/tmp}/rmg-automatic-publication.XXXXXXXX")
trap 'rm -r -- "$work"' EXIT
# Strip ambient PG* settings, including hostaddr/service, and ignore psqlrc.
ps=(env -i "PATH=$PATH" LC_ALL=C PGPASSWORD=rmg-local-fixture-only PGCONNECT_TIMEOUT=5
  psql -X --no-password --host="$fixture_host" --port="$fixture_port"
  --username=rmg_fixture_owner --dbname=rmg_automatic_publication_fixture
  --set=ON_ERROR_STOP=1)

"${ps[@]}" <<'SQL'
DO $$
BEGIN
 IF current_database()<>'rmg_automatic_publication_fixture' OR current_user<>'rmg_fixture_owner' THEN
  RAISE EXCEPTION 'Expected the named disposable localhost fixture';
 END IF;
 IF current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999 THEN
  RAISE EXCEPTION 'This fixture requires PostgreSQL 17';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname NOT LIKE 'pg_%')
  OR EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace)
  OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace)
  OR EXISTS(SELECT 1 FROM pg_type WHERE typnamespace='public'::regnamespace)
  OR EXISTS(SELECT 1 FROM pg_extension WHERE extname<>'plpgsql') THEN
  RAISE EXCEPTION 'Fixture database must be empty';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role'))
  OR EXISTS(SELECT 1 FROM pg_database WHERE datname NOT IN ('postgres','template0','template1','rmg_automatic_publication_fixture')) THEN
  RAISE EXCEPTION 'Use a fresh dedicated fixture cluster';
 END IF;
END $$;
SELECT version();
SQL

python3 "$root/tests/backend-launch/reconstruct.py" >"$work/schema.sql"
cat >"$work/auth-reports.sql" <<'SQL'
ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz,
 ADD COLUMN is_anonymous boolean NOT NULL DEFAULT false, ADD COLUMN deleted_at timestamptz;
UPDATE auth.users SET email_confirmed_at=now();
CREATE TABLE public.review_flags(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), review_id uuid NOT NULL REFERENCES public.reviews(id),
 reporter_id uuid NOT NULL REFERENCES auth.users(id), reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(review_id,reporter_id));
ALTER TABLE public.review_flags ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.review_flags TO anon,authenticated;
SQL
"${ps[@]}" --single-transaction --file="$work/schema.sql" \
 --file="$root/tests/backend-launch/fixtures.sql" --file="$work/auth-reports.sql"

for migration in \
 final-launch-migration-body.sql \
 09-oregon-reviews-split-v1.sql \
 10-oregon-claims-v1.sql \
 11-guard-legacy-claim-decision-v1.sql \
 structured-guide-offerings-v1.sql \
 public-review-summaries-v1.sql \
 wa-review-pilot-v1.sql \
 wa-listed-review-identity-proof-v1.sql \
 wa-listed-review-adapter-v1.sql \
 wa-listed-review-summaries-v1.sql \
 wa-listed-review-summaries-readonly-v1.sql \
 wa-catalog-review-targets-v1.sql \
 richer-review-ratings-v1.sql \
 richer-review-survey-v1.sql \
 review-moderator-own-submission-v1.sql \
 automatic-review-publication-v1.sql; do
  "${ps[@]}" --single-transaction --file="$root/supabase/review-candidates/$migration"
done
"${ps[@]}" --file="$root/tests/backend-launch/automatic-review-publication-v1.sql"
"${ps[@]}" --file="$root/tests/backend-launch/automatic-review-publication-rollback-before.sql" \
 --file="$root/supabase/review-candidates/automatic-review-publication-v1-rollback.sql" \
 --file="$root/tests/backend-launch/automatic-review-publication-rollback-after.sql"
# The rollback rehearsal above runs inside its own rolled-back transaction.
# Install twice to cover the candidate's idempotent path before exercising public RPCs.
candidate="$root/supabase/review-candidates/rejected-review-resubmission-v1.sql"
"${ps[@]}" --single-transaction --file="$candidate"
"${ps[@]}" --single-transaction --file="$candidate"
"${ps[@]}" --file="$root/tests/backend-launch/automatic-review-publication-resubmission.sql"

# Two overlapping transactions try to replace the same rejected review. Keep
# the winner's transaction open briefly so the other writer contends for its lock.
race_sql="BEGIN;
 SET LOCAL statement_timeout='8s';
 SET LOCAL ROLE authenticated;
 SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000181';
 SELECT public.rmg_submit_review_v3('OR','OG.0000184',4::smallint,NULL,true,'Synthetic concurrent replacement',true,'none',NULL,NULL,'{}');
 SELECT pg_sleep(0.4);
 COMMIT;"
pids=()
for worker in first second; do
  "${ps[@]}" --set=VERBOSITY=verbose --command="$race_sql" >"$work/$worker.log" 2>&1 &
  pids+=("$!")
done
successes=0
for pid in "${pids[@]}"; do
  if wait "$pid"; then successes=$((successes + 1)); fi
done
if (( successes != 1 )) || ! grep -q 'P4091:' "$work/first.log" "$work/second.log"; then
  cat "$work/first.log" "$work/second.log" >&2
  exit 1
fi
"${ps[@]}" --command="SELECT public.fixture_assert(
  (SELECT count(*)=2 AND count(*) FILTER (WHERE status='rejected')=1 FROM public.reviews
      WHERE guide_id='10000000-0000-0000-0000-000000000184')
  AND public.rmg_review_summary('OR','OG.0000184') @> '{\"count\":1}',
  'concurrent replacements produce one publication and preserve rejected history');"
echo 'PASS: automatic review publication, resubmission, revision, report and authorization fixture on PostgreSQL 17.'
