#!/usr/bin/env python3
"""Exercise two-session gate closure on the CLI runner's disposable fixture."""
import os
from pathlib import Path
import selectors
import subprocess
import sys
import time
from uuid import uuid4

socket_dir = Path(sys.argv[1]).resolve(strict=True)
port = int(sys.argv[2])
assert socket_dir.name.startswith('rmg-oregon-split.') and (socket_dir / 'data/PG_VERSION').read_text().strip() == '17'
psql = ['psql', '-XAtq', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose',
        '-h', str(socket_dir), '-p', str(port), '-U', 'audit_owner', '-d', 'postgres']


def query(sql):
    return subprocess.check_output([*psql, '-c', sql], text=True, timeout=10).strip()


def start(sql, actor=None):
    tag = f'rmg_split_{uuid4().hex}'
    process = subprocess.Popen(psql, env={**os.environ, 'PGAPPNAME': tag}, text=True,
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if actor is not None:
        sql = ("SET ROLE authenticated; SET request.jwt.claim.sub="
               f"'00000000-0000-0000-0000-{actor:012d}';\n{sql}")
    send(process, sql)
    return process, tag


def send(process, sql):
    process.stdin.write(sql + '\n')
    process.stdin.flush()


def ready(process):
    with selectors.DefaultSelector() as selector:
        selector.register(process.stdout, selectors.EVENT_READ)
        if not selector.select(8) or process.stdout.readline().strip() != 'fixture-ready':
            raise RuntimeError('fixture transaction did not reach the expected checkpoint')


def blocked(tag):
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        if query(f"SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name='{tag}' "
                 "AND cardinality(pg_blocking_pids(pid))>0)") == 't':
            return
        time.sleep(0.03)
    raise RuntimeError('fixture session did not wait on the expected lock')


def finish(process, should_fail=False):
    stdout, stderr = process.communicate(timeout=10)
    if should_fail:
        if process.returncode == 0 or 'P5030' not in stderr:
            raise RuntimeError('expected overlapping write to fail with P5030')
    elif process.returncode:
        raise RuntimeError(f'fixture session failed: {stderr}')
    return stdout


def terminate(*processes):
    for process in processes:
        if process.poll() is None:
            process.kill()
            process.communicate(timeout=5)


def exercise(table, write, actor, fingerprint):
    gate = f'UPDATE rmg_private.{table} SET enabled='
    query(gate + 'true WHERE singleton;')
    before = query(fingerprint)
    writer, _ = start("BEGIN; DO $$BEGIN PERFORM " + write + "; END$$;\n\\echo fixture-ready", actor)
    try:
        ready(writer)
        closer, tag = start(gate + 'false WHERE singleton;\n\\q')
        try:
            blocked(tag)
            send(writer, 'ROLLBACK;\n\\q')
            finish(writer)
            finish(closer)
        finally:
            terminate(closer)
    finally:
        terminate(writer)
    if query(fingerprint) != before:
        raise RuntimeError('rolled-back writer changed fixture rows')
    query(gate + 'true WHERE singleton;')
    closer, _ = start("BEGIN; " + gate + 'false WHERE singleton;\n\\echo fixture-ready')
    try:
        ready(closer)
        writer, tag = start('SELECT ' + write + ';\n\\q', actor)
        try:
            blocked(tag)
            send(closer, 'COMMIT;\n\\q')
            finish(closer)
            finish(writer, should_fail=True)
        finally:
            terminate(writer)
    finally:
        terminate(closer)
    if query(fingerprint) != before:
        raise RuntimeError('gate-close winner changed fixture rows')
    print(f'PASS {table}: close waits for writer and waiting writer sees committed closure')


query("""INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference)
 VALUES ('OR','race-one','10000000-0000-0000-0000-000000000001',now(),'fixture');
""")
exercise('launch_control',
         "public.rmg_submit_review_v2('OR','race-one',4::smallint,NULL,NULL,'test review',true,'none',NULL,'2026-05')",
         3, 'SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY id)::text) FROM public.reviews r')
query('UPDATE rmg_private.launch_control SET enabled=true WHERE singleton;')
exercise('claim_control_v1',
         "public.rmg_decide_submission('claim','20000000-0000-0000-0000-000000000002',true,'Verified synthetic approval reason')",
         4, """SELECT md5(jsonb_build_array(
             (SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.guide_claims c),
             (SELECT count(*) FROM public.moderation_audit))::text)""")
query('UPDATE rmg_private.launch_control SET enabled=false WHERE singleton;')
