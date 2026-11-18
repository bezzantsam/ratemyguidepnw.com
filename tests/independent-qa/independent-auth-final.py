#!/usr/bin/env python3
"""Bootstrap exact reviewed migration then run unchanged 05 Auth/PostgREST assertions on disposable CI."""
import hashlib, json, os, re, runpy, subprocess, sys
from pathlib import Path
from urllib.parse import urlsplit
try:
    project=os.environ.get('RMG_LOCAL_PROJECT','');run=os.environ.get('GITHUB_RUN_ID','');attempt=os.environ.get('GITHUB_RUN_ATTEMPT','')
    assert os.environ.get('RUNNER_ENVIRONMENT')=='github-hosted' and run.isdigit() and attempt.isdigit() and project=='rmgqa'+run+attempt
    assert os.environ.get('RMG_FIXTURE_SCHEMA_ONLY')=='1' and os.environ.get('RMG_FINAL_LAUNCH_FIXTURE')=='1'
    temp=Path(os.environ['RUNNER_TEMP']).resolve(strict=True); status_path=Path(os.environ['RMG_LOCAL_STATUS_FILE']).resolve(strict=True)
    assert status_path.is_relative_to(temp) and not (status_path.stat().st_mode&0o077)
    status=json.loads(status_path.read_text())
    for key in ('API_URL','MAILPIT_URL','DB_URL'):
        u=urlsplit(status[key]);assert u.hostname=='127.0.0.1' and u.port and u.scheme in ('http','postgres','postgresql')
    root=Path(os.environ['GITHUB_WORKSPACE']).resolve(strict=True)
    migration=root/'supabase/review-candidates/final-launch-migration-body.sql';raw=migration.read_bytes()
    assert hashlib.sha256(raw).hexdigest()=='e76030edd1cfe5d9b61ef48cf8132a96536f01f13e3030016890ab549b076f78'
    subprocess.run(['git','diff','--quiet','HEAD','--',str(migration.relative_to(root))],cwd=root,check=True)
    assertion=Path(__file__).with_name('independent-auth-postgrest-v2.py').resolve(strict=True)
    assert hashlib.sha256(assertion.read_bytes()).hexdigest()=='08c43f44c92928899b83a2abc56345783da03c2a5cdbe7253a56fd8cb529f417'
    cmd=['docker','exec','-i','supabase_db_'+project,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-q','-1']
    def execute(data):
        r=subprocess.run(cmd,input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=40);assert r.returncode==0,'disposable SQL bootstrap failed'
    execute(b"DO $$BEGIN IF (SELECT count(*) FROM public.guides)<>0 OR (SELECT count(*) FROM public.reviews)<>0 OR to_regclass('rmg_private.launch_control') IS NOT NULL THEN RAISE EXCEPTION 'fixture not empty'; END IF; END$$;")
    execute(raw)
    execute(b"INSERT INTO public.guides(id,slug,full_name,listing_status) VALUES ('10000000-0000-0000-0000-000000000001','fixture-one','Synthetic guide one','published'),('10000000-0000-0000-0000-000000000002','fixture-two','Synthetic guide two','published'); INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference) VALUES ('OR','fixture-one','10000000-0000-0000-0000-000000000001',now(),'independent fixture'),('OR','fixture-two','10000000-0000-0000-0000-000000000002',now(),'independent fixture');")
    runpy.run_path(str(assertion),run_name='__main__')
except Exception:
    print('FAIL exact-candidate disposable Auth bootstrap; details withheld',file=sys.stderr);sys.exit(1)
