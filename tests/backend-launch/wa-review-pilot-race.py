"""Exercise WA-only closure in both lock orders on the disposable PG17 fixture."""
import os
from pathlib import Path
import selectors
import subprocess
import sys
import time

socket = Path(sys.argv[1]).resolve(strict=True)
assert socket.name.startswith('rmg-wa-pilot.') and (socket / 'data/PG_VERSION').read_text().strip() == '17'
psql = ['psql', '-XAtq', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose',
        '-h', str(socket), '-U', 'audit_owner', '-d', 'postgres']
listed = len(sys.argv) == 3 and sys.argv[2] == '--listed-adapter'
table, where, source, actor = (
    ('wa_listed_review_identity_v1', "source_id='wa-001'", 'wa-001@'+'b'*64, '1')
    if listed else ('wa_review_pilot_v1', 'singleton', 'wa-900001', '6')
)
enable = f"UPDATE rmg_private.{table} SET enabled=true WHERE {where};"
disable = f"UPDATE rmg_private.{table} SET enabled=false WHERE {where};"
submit = f"""SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-0000-0000-00000000000{actor}';
DO $$ BEGIN
 PERFORM public.rmg_submit_review_v2('WA','{source}',4::smallint,NULL,NULL,
 'Synthetic WA race review',true,'none',NULL,NULL);
END $$;"""


def query(sql):
    return subprocess.check_output([*psql, '-c', sql], text=True, timeout=8).strip()


def send(process, sql):
    process.stdin.write(sql + '\n')
    process.stdin.flush()


def checkpoint(process):
    with selectors.DefaultSelector() as selector:
        selector.register(process.stdout, selectors.EVENT_READ)
        if not selector.select(6) or process.stdout.readline().strip() != 'fixture-ready':
            raise RuntimeError('fixture did not reach the transaction checkpoint')


def wait_for_lock():
    deadline = time.monotonic() + 6
    while time.monotonic() < deadline:
        if query("SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name='wa_fixture_waiter'"
                 " AND cardinality(pg_blocking_pids(pid))>0)") == 't':
            return
        time.sleep(0.03)
    raise RuntimeError('fixture operation did not wait for the locked WA gate')


def race(first_sql, second_sql, first_end, expected=None):
    owner = subprocess.Popen(psql, text=True, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE)
    waiter = None
    try:
        send(owner, 'BEGIN;\n' + first_sql + '\n\\echo fixture-ready')
        checkpoint(owner)
        waiter = subprocess.Popen([*psql, '-c', second_sql],
                                  env={**os.environ, 'PGAPPNAME': 'wa_fixture_waiter'},
                                  text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        wait_for_lock()
        send(owner, first_end + '\n\\q')
        _, owner_error = owner.communicate(timeout=8)
        assert owner.returncode == 0, owner_error
        _, waiter_error = waiter.communicate(timeout=8)
        if expected:
            assert waiter.returncode != 0 and expected in waiter_error, waiter_error
        else:
            assert waiter.returncode == 0, waiter_error
    finally:
        for process in (owner, waiter):
            if process is not None and process.poll() is None:
                process.kill()
                process.communicate(timeout=5)


snapshot = "SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.reviews r"
before = query(snapshot)
query(enable)
race(submit, disable, 'ROLLBACK;')
assert query(snapshot) == before
query(enable)
race(disable, submit, 'COMMIT;', expected='P5030')
assert query(snapshot) == before
assert query(f"SELECT NOT enabled FROM rmg_private.{table} WHERE {where}") == 't'
print(f'PASS {table}: WA-only close waits for an admitted writer; a queued writer observes committed closure and leaves rows intact')
