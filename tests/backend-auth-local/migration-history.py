#!/usr/bin/env python3
"""Exercise CLI-generated local migration history and transactional failure."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.parse import urlsplit

root = Path(__file__).resolve().parents[2]
work = Path(os.environ['RMG_LOCAL_WORKDIR']).resolve(strict=True)
status_path = Path(os.environ['RMG_LOCAL_STATUS_FILE']).resolve(strict=True)
cli = Path(os.environ['RMG_LOCAL_CLI']).resolve(strict=True)
project = os.environ['RMG_LOCAL_PROJECT']
if os.environ.get('RUNNER_ENVIRONMENT') != 'github-hosted' or os.environ.get('RMG_FIXTURE_SCHEMA_ONLY') != '1':
    raise SystemExit('Requires disposable schema-only GitHub runner')
if not re.fullmatch(r'rmgqa[0-9]+', project) or project != 'rmgqa' + os.environ['GITHUB_RUN_ID'] + os.environ['GITHUB_RUN_ATTEMPT']:
    raise SystemExit('Unexpected local project')
if status_path != work / 'status.json' or cli != work / 'bin/supabase' or not work.is_relative_to(Path(os.environ['RUNNER_TEMP']).resolve(strict=True)):
    raise SystemExit('Unexpected local fixture paths')
status = json.loads(status_path.read_text())
if urlsplit(status['DB_URL']).hostname != '127.0.0.1':
    raise SystemExit('Nonlocal database')
body = (root / 'supabase/review-candidates/launch-migration-body.sql').read_bytes()
expected = '209c5fe39125ef17096941dac3c814c9e57b2e0b0be4789c9f49dc0510f34b9a'
if hashlib.sha256(body).hexdigest() != expected:
    raise SystemExit('Unexpected migration body hash')
clean = {'PATH': os.environ['PATH'], 'HOME': os.environ['HOME'], 'TMPDIR': str(work)}
def command(*args):
    return subprocess.run([str(cli), *args], cwd=work, env=clean, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=180)
def sql(statement):
    result = subprocess.run(['docker', 'exec', '-i', 'supabase_db_' + project, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-Atq', '-v', 'ON_ERROR_STOP=1'], input=statement, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
    if result.returncode: raise RuntimeError('Local SQL verification failed')
    return result.stdout.strip()
def history_count(version):
    if sql("SELECT coalesce(to_regclass('supabase_migrations.schema_migrations')::text,'absent');") == 'absent': return '0'
    return sql("SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='" + version + "';")
def public_snapshot():
    return sql("""SELECT md5(concat_ws('|',
      (SELECT coalesce(string_agg(c.oid::text||':'||c.relname||':'||coalesce(c.relacl::text,''),',' ORDER BY c.oid),'') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
      (SELECT coalesce(string_agg(p.oid::text||':'||p.proname||':'||coalesce(p.proacl::text,'')||':'||pg_get_functiondef(p.oid),',' ORDER BY p.oid),'') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'),
      (SELECT coalesce(string_agg(oid::text||':'||pg_get_constraintdef(oid),',' ORDER BY oid),'') FROM pg_constraint WHERE connamespace='public'::regnamespace),
      (SELECT coalesce(string_agg(oid::text||':'||polname||':'||coalesce(pg_get_expr(polqual,polrelid),'')||':'||coalesce(pg_get_expr(polwithcheck,polrelid),''),',' ORDER BY oid),'') FROM pg_policy WHERE polrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace))));""")
if sql("SELECT coalesce(to_regclass('rmg_private.launch_control')::text,'absent');") != 'absent':
    raise SystemExit('Candidate already applied')
before = public_snapshot()
if command('migration', 'new', 'rmg_launch_local').returncode:
    raise SystemExit('CLI migration new failed')
paths = list((work / 'supabase/migrations').glob('*_rmg_launch_local.sql'))
if len(paths) != 1 or not re.fullmatch(r'[0-9]{14}_rmg_launch_local\.sql', paths[0].name):
    raise SystemExit('Unexpected CLI migration file')
path = paths[0]; version = path.name.split('_', 1)[0]
path.write_bytes(body + b'\nSELECT 1/0;\n')
if command('migration', 'up', '--local').returncode == 0:
    raise SystemExit('Injected failure unexpectedly passed')
if sql("SELECT coalesce(to_regclass('rmg_private.launch_control')::text,'absent');") != 'absent' or history_count(version) != '0' or public_snapshot() != before:
    raise SystemExit('Failed migration left schema or history behind')
print('PASS local CLI failed migration rolls back schema and history')
path.write_bytes(body)
if command('migration', 'up', '--local').returncode:
    raise SystemExit('CLI local migration application failed')
if history_count(version) != '1' or sql('SELECT enabled FROM rmg_private.launch_control WHERE singleton;') != 'f':
    raise SystemExit('Migration history or default-off gate incorrect')
print('PASS local CLI generated migration applied once with default-off gate and history')
rollback = (root / 'supabase/review-candidates/emergency-disable-migration-body.sql').read_bytes()
if hashlib.sha256(rollback).hexdigest() != '769333a38e66d394b80fcd95a71bbc97130c1e3e6465322decb9d37eb44a3b5d':
    raise SystemExit('Unexpected emergency-disable body hash')
sql("""INSERT INTO public.guides(id,slug,full_name,listing_status) VALUES ('10000000-0000-0000-0000-000000000001','fixture-one','Synthetic guide','published');
INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference) VALUES ('OR','fixture-one','10000000-0000-0000-0000-000000000001',now(),'Synthetic fixture');
UPDATE rmg_private.launch_control SET enabled=true WHERE singleton;""")
time.sleep(1.1)  # CLI-generated versions have one-second resolution.
if command('migration', 'new', 'rmg_emergency_disable_local').returncode:
    raise SystemExit('CLI emergency migration new failed')
paths = list((work / 'supabase/migrations').glob('*_rmg_emergency_disable_local.sql'))
if len(paths) != 1 or not re.fullmatch(r'[0-9]{14}_rmg_emergency_disable_local\.sql', paths[0].name):
    raise SystemExit('Unexpected emergency migration file')
rollback_path = paths[0]; rollback_version = rollback_path.name.split('_', 1)[0]
if rollback_version <= version: raise SystemExit('Emergency version must follow launch version')
rollback_path.write_bytes(rollback)
if command('migration', 'up', '--local').returncode:
    raise SystemExit('CLI emergency migration failed')
if history_count(rollback_version) != '1' or sql('SELECT enabled FROM rmg_private.launch_control WHERE singleton;') != 'f':
    raise SystemExit('Emergency migration history or gate incorrect')
if sql('SELECT count(*) FROM rmg_private.guide_identity_map;') != '1':
    raise SystemExit('Emergency disable did not preserve mappings')
if sql("SELECT has_function_privilege('authenticated','public.rmg_own_status(text,uuid)','EXECUTE');") != 'f':
    raise SystemExit('Emergency disable did not revoke RPC execution')
print('PASS local emergency migration disables RPCs, records history and preserves fixture mapping')
