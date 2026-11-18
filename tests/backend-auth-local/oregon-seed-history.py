#!/usr/bin/env python3
"""Rehearse the exact Oregon seed with local Supabase CLI history, never hosted."""
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
if os.environ.get('RUNNER_ENVIRONMENT') != 'github-hosted' or os.environ.get('RMG_FIXTURE_SCHEMA_ONLY') != '1' or os.environ.get('RMG_FINAL_LAUNCH_FIXTURE') != '1':
    raise SystemExit('Requires disposable schema-only GitHub-hosted final fixture')
if not re.fullmatch(r'rmgqa[0-9]+', project) or project != 'rmgqa' + os.environ['GITHUB_RUN_ID'] + os.environ['GITHUB_RUN_ATTEMPT']:
    raise SystemExit('Unexpected local project')
if status_path != work / 'status.json' or cli != work / 'bin/supabase' or not work.is_relative_to(Path(os.environ['RUNNER_TEMP']).resolve(strict=True)):
    raise SystemExit('Unexpected fixture paths')
if urlsplit(json.loads(status_path.read_text())['DB_URL']).hostname != '127.0.0.1':
    raise SystemExit('Nonlocal database prohibited')

def pinned(path, sha):
    data = (root / path).read_bytes()
    if hashlib.sha256(data).hexdigest() != sha:
        raise SystemExit('Unexpected candidate hash: ' + path)
    return data

body = pinned('supabase/review-candidates/oregon-mapping-seed-migration-body.sql', '04f88b0df9e2e87856063b8e93595a6ba98c1dd2ac8c13212bf483d87818838b')
launch = pinned('supabase/review-candidates/final-launch-migration-body.sql', 'e76030edd1cfe5d9b61ef48cf8132a96536f01f13e3030016890ab549b076f78')
source = pinned('lib/oregon-guides.json', '3f0671e58d8d9f5615ba15668b7043fbc4f11859dafb10cf91068a5eb2a62081')
ids = sorted(row['registration'] for row in json.loads(source))
if len(ids) != 1027 or len(set(ids)) != len(ids) or not all(re.fullmatch(r'OG\.[A-Z0-9.&]+', x) for x in ids):
    raise SystemExit('Unexpected source identities')
if subprocess.check_output([sys.executable, str(root / 'supabase/review-candidates/assemble-runner-seed.py')]) != body:
    raise SystemExit('Runner body differs from generated source')
clean = {'PATH': os.environ['PATH'], 'HOME': os.environ['HOME'], 'TMPDIR': str(work)}
def command(*args):
    return subprocess.run([str(cli), *args], cwd=work, env=clean, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=180)
def sql(statement, transaction=False):
    args = ['docker', 'exec', '-i', 'supabase_db_' + project, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-Atq', '-v', 'ON_ERROR_STOP=1']
    if transaction: args.append('-1')
    result = subprocess.run(args, input=statement, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=90)
    if result.returncode: raise RuntimeError('Local fixture SQL failed')
    return result.stdout.strip()
def history(version):
    if sql("SELECT coalesce(to_regclass('supabase_migrations.schema_migrations')::text,'absent');") == 'absent': return '0'
    return sql("SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='" + version + "';")
def mapping_count():
    return int(sql('SELECT count(*) FROM rmg_private.guide_identity_map;'))
def create_migration(name):
    if command('migration', 'new', name).returncode: raise SystemExit('CLI migration creation failed')
    paths = list((work / 'supabase/migrations').glob('*_' + name + '.sql'))
    if len(paths) != 1 or not re.fullmatch(r'[0-9]{14}_' + name + r'\.sql', paths[0].name): raise SystemExit('Unexpected CLI migration path')
    return paths[0], paths[0].name.split('_', 1)[0]
def rejected(expected):
    result = command('migration', 'up', '--local')
    output = (result.stdout + result.stderr).decode(errors='replace').lower()
    if result.returncode == 0 or expected.lower() not in output:
        raise SystemExit('CLI expected rejection missing: ' + expected)
    if history(version) != '0': raise SystemExit('Rejected seed was recorded as applied')

# Prerequisite only: exact launch body on reconstructed schema, without a hosted connection.
sql(launch.decode(), transaction=True)
if sql('SELECT enabled FROM rmg_private.launch_control WHERE singleton') != 'f': raise SystemExit('Launch gate was not false')
source_json = json.dumps(ids, separators=(',', ':'))
sql("""INSERT INTO public.guides(id,slug,full_name,license_number,listing_status)
 SELECT md5('synthetic:' || v)::uuid,lower(regexp_replace(v,'[^a-zA-Z0-9]+','-','g')),
 'Synthetic fixture',v,'published' FROM jsonb_array_elements_text('""" + source_json + """'::jsonb) AS a(v);""")
if sql("SELECT count(*) FROM public.guides WHERE full_name='Synthetic fixture';") != '1027' or mapping_count() != 0:
    raise SystemExit('Synthetic target setup failed')
path, version = create_migration('rmg_oregon_seed_local')

# All checks reuse the exact candidate unless deliberately injecting a post-body failure.
path.write_bytes(body + b'\nSELECT 1/0;\n')
rejected('division by zero')
if mapping_count() != 0: raise SystemExit('Injected failure persisted mappings')
print('PASS injected post-body failure rolls back all mappings and migration history')
path.write_bytes(body)
first, second = ids[:2]
sql("UPDATE public.guides SET listing_status='draft' WHERE license_number='" + first + "';")
rejected('Missing or ambiguous Oregon mapping')
if mapping_count() != 0: raise SystemExit('Missing target persisted mappings')
sql("UPDATE public.guides SET listing_status='published' WHERE license_number='" + first + "';")
print('PASS missing target leaves mappings and history unchanged')
sql("INSERT INTO rmg_private.guide_identity_map VALUES ('OR','" + first + "',md5('synthetic:" + second + "')::uuid,now(),'synthetic conflict');")
rejected('Conflicting Oregon mapping')
if mapping_count() != 1: raise SystemExit('OR conflict altered mappings')
sql("DELETE FROM rmg_private.guide_identity_map WHERE review_reference='synthetic conflict';")
print('PASS conflicting Oregon mapping leaves existing row and history unchanged')
sql("INSERT INTO rmg_private.guide_identity_map VALUES ('WA','synthetic-wa',md5('synthetic:" + first + "')::uuid,now(),'synthetic cross-state');")
rejected('Cross-jurisdiction alias requires independent provenance review')
if mapping_count() != 1: raise SystemExit('Cross-state conflict altered mappings')
sql("DELETE FROM rmg_private.guide_identity_map WHERE review_reference='synthetic cross-state';")
print('PASS cross-jurisdiction conflict leaves existing row and history unchanged')
if command('migration', 'up', '--local').returncode: raise SystemExit('Exact seed CLI migration failed')
if history(version) != '1' or mapping_count() != 1027: raise SystemExit('Seed or migration history incorrect')
if sql("SELECT count(*) FROM rmg_private.guide_identity_map WHERE jurisdiction='OR' AND review_reference='source-sha256:3f0671e58d8d9f5615ba15668b7043fbc4f11859dafb10cf91068a5eb2a62081; exact-registration+derived-slug';") != '1027': raise SystemExit('Seed mapping provenance incorrect')
print('PASS exact pinned body inserts 1027 synthetic mappings with one CLI history entry')
time.sleep(1.1)
path2, version2 = create_migration('rmg_oregon_seed_idempotence_local')
if version2 <= version: raise SystemExit('Unexpected second migration version')
path2.write_bytes(body)
if command('migration', 'up', '--local').returncode: raise SystemExit('Exact seed reapplication failed')
if history(version2) != '1' or mapping_count() != 1027: raise SystemExit('Idempotence or second history entry incorrect')
print('PASS exact body is idempotent in a second history-recorded local transaction')
