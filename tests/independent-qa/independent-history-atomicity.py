#!/usr/bin/env python3
"""05 independent exact-seed/history failure test. Disposable GH runner only."""
import hashlib,json,os,re,subprocess,sys,time
from pathlib import Path
from urllib.parse import urlsplit
stage='guard'
def need(value,message):
    if not value: raise AssertionError(message)
def main():
    global stage
    need(os.environ.get('RUNNER_ENVIRONMENT')=='github-hosted','runner')
    need(os.environ.get('RMG_FIXTURE_SCHEMA_ONLY')=='1' and os.environ.get('RMG_FINAL_LAUNCH_FIXTURE')=='1','fixture mode')
    run=os.environ.get('GITHUB_RUN_ID','');attempt=os.environ.get('GITHUB_RUN_ATTEMPT','');project=os.environ.get('RMG_LOCAL_PROJECT','')
    need(run.isdigit() and attempt.isdigit() and project=='rmgqa'+run+attempt,'project')
    root=Path(os.environ['GITHUB_WORKSPACE']).resolve(strict=True);tmp=Path(os.environ['RUNNER_TEMP']).resolve(strict=True)
    work=Path(os.environ['RMG_LOCAL_WORKDIR']).resolve(strict=True);status_path=Path(os.environ['RMG_LOCAL_STATUS_FILE']).resolve(strict=True);cli=Path(os.environ['RMG_LOCAL_CLI']).resolve(strict=True)
    need(work.is_relative_to(tmp) and status_path==work/'status.json' and cli==work/'bin/supabase' and not(status_path.stat().st_mode&0o077),'paths')
    status=json.loads(status_path.read_text()); u=urlsplit(status['DB_URL']);need(u.hostname=='127.0.0.1' and u.port and u.scheme in ('postgres','postgresql'),'database')
    def pinned(path,digest):
        b=(root/path).read_bytes();need(hashlib.sha256(b).hexdigest()==digest,'hash '+path);return b
    seed=pinned('supabase/review-candidates/oregon-mapping-seed-cli-body.sql','39da2be4ff31009b70da58fcc20e51351f76632820ff01ec407c5fe17c0df678')
    launch=pinned('supabase/review-candidates/final-launch-migration-body.sql','e76030edd1cfe5d9b61ef48cf8132a96536f01f13e3030016890ab549b076f78')
    source=pinned('lib/oregon-guides.json','3f0671e58d8d9f5615ba15668b7043fbc4f11859dafb10cf91068a5eb2a62081')
    ids=sorted(row['registration'] for row in json.loads(source));need(len(ids)==len(set(ids))==1027 and all(re.fullmatch(r'OG\.[A-Z0-9.&]+',x) for x in ids),'source ids')
    clean={'PATH':os.environ['PATH'],'HOME':os.environ['HOME'],'TMPDIR':str(work)}
    def sql(q,transaction=False):
        cmd=['docker','exec','-i','supabase_db_'+project,'psql','-X','-U','postgres','-d','postgres','-Atq','-v','ON_ERROR_STOP=1']
        if transaction:cmd.append('-1')
        r=subprocess.run(cmd,input=q,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=90);need(r.returncode==0,'fixture SQL');return r.stdout.strip()
    def command(*args):return subprocess.run([str(cli),*args],cwd=work,env=clean,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=180)
    def create(name):
        need(command('migration','new',name).returncode==0,'CLI create')
        paths=list((work/'supabase/migrations').glob('*_'+name+'.sql'));need(len(paths)==1 and re.fullmatch(r'[0-9]{14}_'+name+r'\.sql',paths[0].name),'migration path')
        return paths[0],paths[0].name[:14]
    stage='synthetic prerequisite'
    need(sql("SELECT to_regclass('rmg_private.launch_control') IS NULL AND (SELECT count(*)=0 FROM public.guides);")=='t','nonempty fixture')
    sql(launch.decode(),True);need(sql('SELECT enabled FROM rmg_private.launch_control WHERE singleton')=='f','gate')
    doc=json.dumps(ids,separators=(',',':'))
    sql("INSERT INTO public.guides(id,slug,full_name,license_number,listing_status) SELECT md5('qa-seed:'||v)::uuid,lower(regexp_replace(v,'[^a-zA-Z0-9]+','-','g')),'Synthetic fixture',v,'published' FROM jsonb_array_elements_text('"+doc+"'::jsonb) AS a(v);")
    need(sql('SELECT count(*) FROM public.guides;')=='1027' and sql('SELECT count(*) FROM rmg_private.guide_identity_map;')=='0','initial rows')
    stage='real CLI history bootstrap'
    init,initversion=create('qa_history_baseline');init.write_text('SELECT 1;\n');need(command('migration','up','--local').returncode==0,'initial history migration')
    need(sql("SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='"+initversion+"';")=='1','initial history')
    time.sleep(1.1)
    path,version=create('qa_oregon_atomicity');need(version>initversion,'version');path.write_bytes(seed)
    stage='inject history insert failure'
    sql("CREATE FUNCTION public.qa_reject_history() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.version='"+version+"' THEN RAISE EXCEPTION 'qa history insertion failure'; END IF; RETURN NEW; END$$; CREATE TRIGGER qa_reject_history BEFORE INSERT ON supabase_migrations.schema_migrations FOR EACH ROW EXECUTE FUNCTION public.qa_reject_history();")
    result=command('migration','up','--local');out=(result.stdout+result.stderr).decode(errors='replace').lower()
    need(result.returncode!=0 and 'qa history insertion failure' in out,'failure did not reach injected history insert')
    mappings=sql('SELECT count(*) FROM rmg_private.guide_identity_map;');hist=sql("SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='"+version+"';")
    need(mappings=='0' and hist=='0','history failure left committed mappings or history')
    print('PASS injected history insert failure leaves no mappings and no history')
    stage='retry exact body'
    sql('DROP TRIGGER qa_reject_history ON supabase_migrations.schema_migrations; DROP FUNCTION public.qa_reject_history();')
    need(command('migration','up','--local').returncode==0,'retry')
    need(sql('SELECT count(*) FROM rmg_private.guide_identity_map;')=='1027' and sql("SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='"+version+"';")=='1','successful retry data and history')
    need(command('migration','up','--local').returncode==0 and sql('SELECT count(*) FROM rmg_private.guide_identity_map;')=='1027','same-version replay')
    print('PASS exact seed retry commits 1027 synthetic mappings with one history entry; same-version replay stable')
try:main()
except Exception as e:
    print('FAIL independent CLI history atomicity at '+stage+': '+str(e),file=sys.stderr);sys.exit(1)
