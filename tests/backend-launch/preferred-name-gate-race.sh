#!/usr/bin/env bash
# Synthetic Unix-socket fixture only; run after preferred-name-v1.sql.
set -euo pipefail
p=${1:?synthetic fixture directory required}
case "$p" in */rmg-preferred-name-06.*) ;; *) echo 'unsafe fixture path' >&2; exit 1;; esac
[[ -f "$p/data/PG_VERSION" && -S "$p/.s.PGSQL.56434" ]] || { echo 'synthetic socket is not running' >&2; exit 1; }
ps=(psql -X -v ON_ERROR_STOP=1 -h "$p" -p 56434 -U audit_owner -d postgres)
[[ $("${ps[@]}" -qAt -c "SELECT current_user='audit_owner' AND inet_server_addr() IS NULL AND EXISTS(SELECT 1 FROM rmg_private.guide_identity_map WHERE source_id='OG.0001225.F&F')") == t ]] || { echo 'unexpected fixture target' >&2; exit 1; }
cat > "$p/name-gate-writer.sql" <<'SQL'
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
BEGIN;
SELECT public.rmg_set_profile_name_v1('OR','OG.0000004','temporary synthetic name');
SELECT pg_sleep(4);
ROLLBACK;
SQL
cat > "$p/name-gate-close.sql" <<'SQL'
UPDATE rmg_private.profile_name_control_v1 SET enabled=false WHERE singleton;
SQL
PGAPPNAME=rmg_preferred_gate_writer "${ps[@]}" -q -f "$p/name-gate-writer.sql" > "$p/name-gate-writer.log" 2>&1 &
writer=$!
ready=0
for attempt in {1..100}; do
 if [[ $("${ps[@]}" -qAt -c "SELECT count(*) FROM pg_stat_activity WHERE application_name='rmg_preferred_gate_writer' AND wait_event='PgSleep'") == 1 ]]; then ready=1; break; fi
 if ! kill -0 "$writer" 2>/dev/null; then break; fi
 sleep 0.05
done
if [[ "$ready" != 1 ]]; then wait "$writer" || true; echo 'name writer did not reach sleep' >&2; exit 1; fi
PGAPPNAME=rmg_preferred_gate_close "${ps[@]}" -q -f "$p/name-gate-close.sql" > "$p/name-gate-close.log" 2>&1 &
closer=$!
blocked=0
for attempt in {1..100}; do
 if [[ $("${ps[@]}" -qAt -c "SELECT count(*) FROM pg_stat_activity WHERE application_name='rmg_preferred_gate_close' AND cardinality(pg_blocking_pids(pid))>0") == 1 ]]; then blocked=1; break; fi
 if ! kill -0 "$closer" 2>/dev/null; then break; fi
 sleep 0.05
done
if [[ "$blocked" != 1 ]]; then wait "$closer" || true; wait "$writer" || true; echo 'gate close did not wait for in-flight write' >&2; exit 1; fi
wait "$writer"
wait "$closer"
"${ps[@]}" -q <<'SQL'
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
DO $$BEGIN
 BEGIN PERFORM public.rmg_set_profile_name_v1('OR','OG.0000004','after close'); RAISE EXCEPTION 'write after gate close succeeded'; EXCEPTION WHEN SQLSTATE 'P5030' THEN NULL; END;
END$$;
RESET ROLE;
SELECT public.fixture_assert((SELECT enabled IS FALSE FROM rmg_private.profile_name_control_v1 WHERE singleton),'gate closed after in-flight writer finished');
UPDATE rmg_private.profile_name_control_v1 SET enabled=true WHERE singleton;
SQL
printf 'PASS gate disable waits for in-flight owner write; later direct write denied\n'
