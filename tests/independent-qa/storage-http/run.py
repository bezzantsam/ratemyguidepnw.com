#!/usr/bin/env python3
"""Synthetic Storage API acceptance, isolated cluster, no hosted dependencies."""
import argparse
import base64
import hashlib
import hmac
import http.client
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.parse

ROOT=Path(__file__).resolve().parents[2]
TESTS=ROOT/'tests/backend-storage-acceptance'
UPSTREAM_COMMIT='c8f93e5164ba564fccd66596b318c5e8e2136604'
PINS={'package-lock.json':'6db873d14116a55792e090d0189142190999d0098446443941d2b42e6c2562a7','src/start/server.ts':'131cec73190c1f64ad8d50d9dce33991432decd373c79377532eaaf568c5318b','migrations/tenant/0002-storage-schema.sql':'2d7087b9a391d195c5705d27fad68886a61e24e302c620b939bb73b11b696c12'}
U=lambda n:f'00000000-0000-0000-0000-{n:012d}'
C=lambda n:f'20000000-0000-0000-0000-{n:012d}'
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aWQAAAAASUVORK5CYII=')
HTML=b'<!doctype html><html><body>synthetic harmless content</body></html>'


def enc(data):return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')
def token(key,role,sub=None,extra=None):
    header=enc(b'{"alg":"HS256","typ":"JWT"}')
    claims={'role':role,'exp':int(time.time())+1800,**(extra or {})}
    if sub:claims['sub']=sub
    msg=(header+'.'+enc(json.dumps(claims,separators=(',',':')).encode())).encode()
    return msg.decode()+'.'+enc(hmac.new(key,msg,hashlib.sha256).digest())
def need(name):
    out=shutil.which(name)
    if not out: raise RuntimeError('required executable missing: '+name)
    return out

def port():
    with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--storage-source',required=True,help='pinned upstream source with npm ci and npm run build completed')
    p.add_argument('--candidate-root',required=True,help='exact synthetic candidate source checkout')
    p.add_argument('--fixture-dir',required=True,help='05-owned synthetic test files')
    p.add_argument('--results',help='sanitized output JSON')
    args=p.parse_args()
    global ROOT, TESTS
    ROOT=Path(args.candidate_root).resolve(strict=True)
    TESTS=Path(args.fixture_dir).resolve(strict=True)
    combined=ROOT/'supabase/review-candidates/launch-combined.sql'
    if hashlib.sha256(combined.read_bytes()).hexdigest()!='74afb69db957037086c0e5ffddd2a8d312bed4ded3e446ba3f145284a351686d': raise RuntimeError('candidate combined SQL SHA mismatch')
    source=Path(args.storage_source).resolve(strict=True)
    for name,digest in PINS.items():
        if hashlib.sha256((source/name).read_bytes()).hexdigest()!=digest: raise RuntimeError('Storage source pin mismatch: '+name)
    if (source/'.env').exists() or not (source/'dist/start/server.js').is_file():
        raise RuntimeError('Storage source must have a build and no .env file')
    initdb,pgctl,psql,pgconfig,node=(need(x) for x in ('initdb','pg_ctl','psql','pg_config','node'))
    clean={'PATH':'/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin','LC_ALL':'C'}
    pgver=subprocess.run([pgconfig,'--version'],env=clean,text=True,check=True,stdout=subprocess.PIPE).stdout.strip()
    if not pgver.startswith('PostgreSQL 17.'):raise RuntimeError('PostgreSQL 17 required')
    nodever=subprocess.run([node,'--version'],env=clean,text=True,check=True,stdout=subprocess.PIPE).stdout.strip()
    if not nodever.startswith('v20.'):raise RuntimeError('Node 20 required for pinned Storage release')
    results={'storage_source_commit':UPSTREAM_COMMIT,'postgresql_version':pgver,'node_version':nodever,'scope':'local synthetic only','checks':{},'unverified':['hosted storage schemas and policies','hosted Auth/gateway','real identity mappings','content-safe public promotion','revocation of already-issued signed URLs']}
    with tempfile.TemporaryDirectory(prefix='ratemyguide-storage-') as directory:
        root=Path(directory); data=root/'db'; dbport=port();webport=port();proc=None;started=False
        secret=('qa-signing-'+secrets.token_hex(32)).encode();marker='qa-sensitive-marker-'+secrets.token_hex(16)
        tokens={'anon':token(secret,'anon'),'service':token(secret,'service_role',extra={'marker':marker})}
        tokens.update({str(n):token(secret,'authenticated',U(n)) for n in (1,2,4,5)})
        sensitive=[secret,marker.encode(),*(v.encode() for v in tokens.values())]
        def cmd(argv,*,input_text=None,check=True,timeout=100):
            r=subprocess.run(argv,input=input_text,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,env=clean,timeout=timeout)
            if check and r.returncode: raise RuntimeError('local command failed: '+Path(argv[0]).name+' (details withheld)')
            return r
        db=[psql,'-X','-v','ON_ERROR_STOP=1','-h',str(root),'-p',str(dbport),'-U','qa_owner','-d','postgres']
        def sql(query):return cmd(db+['-Atq'],input_text=query).stdout.strip()
        def file(path):cmd(db+['-f',str(path)])
        def state(expr,label):
            if sql('SELECT CASE WHEN ('+expr+") THEN 'ok' ELSE 'bad' END;")!='ok': raise AssertionError('database assertion failed: '+label)
        def call(method,path,who=None,body=None,content_type=None,headers=None):
            parts=urllib.parse.urlsplit(path)
            if parts.scheme or parts.netloc or not path.startswith('/'):raise RuntimeError('refusing non-local URL')
            conn=http.client.HTTPConnection('127.0.0.1',webport,timeout=12)
            hdr={'Accept':'application/json',**(headers or {})}
            if who:hdr['Authorization']='Bearer '+tokens[who]
            if isinstance(body,dict):body=json.dumps(body,separators=(',',':')).encode();content_type='application/json'
            if content_type:hdr['Content-Type']=content_type
            try:
                conn.request(method,path,body=body,headers=hdr); response=conn.getresponse();raw=response.read()
                for item in sensitive:
                    if item in raw:raise AssertionError('synthetic secret marker appeared in HTTP response')
                try:value=json.loads(raw) if raw else None
                except (json.JSONDecodeError,UnicodeDecodeError):value=None
                return response.status,value,raw
            finally:conn.close()
        def expect(label,method,path,status,who=None,body=None,content_type=None,headers=None,verify=None):
            got,value,raw=call(method,path,who,body,content_type,headers)
            if got!=status or (verify and not verify(value,raw)):
                code=value.get('error') or value.get('code') if isinstance(value,dict) else None
                safe={'Unauthorized','not_found','Bucket not found','Duplicate','Payload too large','invalid_mime_type','InvalidJWT'}
                code=code if code in safe else 'other or absent'
                raise AssertionError(f'{label}: expected HTTP {status}, got HTTP {got}, error category {code}; body withheld')

            if got >= 400:
                category = value.get('error') or value.get('code') if isinstance(value,dict) else None
                expected_errors={'other claimant read':'not_found','private media public URL':'Bucket not found','repeated upload':'Duplicate','oversized file':'Payload too large','active content MIME':'invalid_mime_type','spoof inaccessible publicly':'Bucket not found','unauthorized sign':'not_found','revoked owner read':'not_found','signed URL expired':'InvalidJWT'}
                if category != expected_errors.get(label,'Unauthorized'): raise AssertionError(label+': unexpected denial category')
                print('DENIAL',label,category,flush=True)
            results['checks'][label]={'http_status':got,'database_checked':False,**({'error':category} if got >= 400 else {})}
            return value,raw
        def mark(*labels):
            for label in labels:results['checks'][label]['database_checked']=True
        try:
            cmd([initdb,'-D',str(data),'--username=qa_owner','--auth=trust','--no-locale'])
            cmd([pgctl,'-D',str(data),'-l',str(root/'postgres.log'),'-o',f"-c listen_addresses=127.0.0.1 -c unix_socket_directories='{root}' -p {dbport}",'-w','start']);started=True
            schema=cmd([sys.executable,str(ROOT/'tests/backend-launch/reconstruct.py')]).stdout
            sql(schema)
            file(ROOT/'tests/backend-launch/fixtures.sql')
            sql("ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz, ADD COLUMN is_anonymous boolean NOT NULL DEFAULT false, ADD COLUMN deleted_at timestamptz; UPDATE auth.users SET email_confirmed_at=now();")
            sql(f"DELETE FROM public.site_admins WHERE user_id='{U(5)}';")
            file(TESTS/'storage-fixture.sql')
            state(f"NOT EXISTS (SELECT 1 FROM public.site_admins WHERE user_id='{U(5)}') AND EXISTS (SELECT 1 FROM public.site_admins WHERE user_id='{U(4)}')",'separate owner and administrator')
            env={**clean,'NODE_ENV':'production','SERVER_HOST':'127.0.0.1','SERVER_PORT':str(webport),'DATABASE_URL':f'postgresql://qa_owner@127.0.0.1:{dbport}/postgres','DB_INSTALL_ROLES':'false','DB_SUPER_USER':'qa_owner','AUTH_JWT_SECRET':secret.decode(),'AUTH_JWT_ALGORITHM':'HS256','SERVICE_KEY':tokens['service'],'ANON_KEY':tokens['anon'],'STORAGE_BACKEND':'file','STORAGE_FILE_BACKEND_PATH':str(root/'objects'),'STORAGE_S3_BUCKET':'qa-fixture','STORAGE_S3_REGION':'local','UPLOAD_FILE_SIZE_LIMIT':'5242880','UPLOAD_FILE_SIZE_LIMIT_STANDARD':'5242880','PG_QUEUE_ENABLE':'false','IMAGE_TRANSFORMATION_ENABLED':'false','LOG_LEVEL':'fatal','AWS_EC2_METADATA_DISABLED':'true'}
            log_path=root/'storage.log'
            log=open(log_path,'w+')
            proc=subprocess.Popen([node,'dist/start/server.js'],cwd=source,env=env,stdout=log,stderr=subprocess.STDOUT)
            deadline=time.monotonic()+30
            while time.monotonic()<deadline:
                if proc.poll() is not None:raise RuntimeError(f'Storage service exited before readiness (exit {proc.returncode}); details withheld')
                try:
                    status,_,_=call('GET','/status')
                    if status==200 and proc.poll() is None:break
                except (OSError,http.client.HTTPException):pass
                time.sleep(.1)
            else:raise RuntimeError('Storage service did not become ready')
            print('READY synthetic local Storage service',flush=True)
            sql('ALTER ROLE service_role BYPASSRLS; GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role; GRANT ALL ON ALL TABLES IN SCHEMA storage TO service_role; GRANT SELECT ON storage.buckets TO anon,authenticated; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA storage TO anon,authenticated,service_role;')
            for bucket,public in (('guide-photos',True),('qa-unrelated',False)):
                expect('create '+bucket,'POST','/bucket',200,'service',{'name':bucket,'id':bucket,'public':public,'file_size_limit':5242880,'allowed_mime_types':['image/jpeg','image/png','image/webp']})
                state(f"(SELECT public={'true' if public else 'false'} FROM storage.buckets WHERE id='{bucket}')",'bucket config');mark('create '+bucket)
            file(TESTS/'storage-policies.sql')
            exercise(call,sql,state,results)
            proc.terminate()
            try:proc.wait(timeout=4)
            except subprocess.TimeoutExpired:proc.kill();proc.wait(timeout=4)
            proc=None;log.flush();log.seek(0);logdata=log.read().encode();log.close()
            for item in sensitive:
                if item in logdata:raise AssertionError('synthetic credential marker appeared in Storage logs')
            results['secret_boundary']={'responses_checked':True,'service_log_checked':True,'artifacts_sanitized':True}
            serialized=json.dumps(results,sort_keys=True,indent=2)+'\n'
            if any(item in serialized.encode() for item in sensitive):raise AssertionError('synthetic credential marker appeared in results')
            if args.results:Path(args.results).write_text(serialized)
            print('PASS real local Storage HTTP acceptance',flush=True)
        finally:
            if proc and proc.poll() is None:
                proc.terminate()
                try:proc.wait(timeout=4)
                except subprocess.TimeoutExpired:proc.kill();proc.wait(timeout=4)
            if started:
                stopped=cmd([pgctl,'-D',str(data),'-m','immediate','-w','stop'],check=False)
                if stopped.returncode:raise RuntimeError('failed to stop owned local PostgreSQL')
    return 0

def exercise(call,sql,state,results):
    """All values are fictional; state is checked after each HTTP mutation."""
    bucket='guide-photos'
    def obj(key):return '/object/'+bucket+'/'+key
    def count(key,n):state(f"(SELECT count(*)={n} FROM storage.objects WHERE bucket_id='guide-photos' AND name='{key}')",key)
    def request(label,method,path,statuses,who='5',body=None,headers=None):
        status,_,raw=call(method,path,who,body,'image/png' if body is not None else None,headers)
        if status not in statuses:raise AssertionError(f'{label}: unexpected HTTP {status}')
        results['checks'][label]={'http_status':status,'database_checked':True}
        print('CHECK',label,'HTTP',status,flush=True)
        return raw
    for key in ('fixture-one/remove.png','fixture-one/retain.png'):
        request('before insert '+key,'POST',obj(key),(200,),body=PNG);count(key,1)
    request('before delete','DELETE',obj('fixture-one/remove.png'),(200,204));count('fixture-one/remove.png',0)
    request('before update denied','PUT',obj('fixture-one/retain.png'),(400,403),body=HTML);count('fixture-one/retain.png',1)
    request('before upsert denied','POST',obj('fixture-one/retain.png'),(400,403),body=HTML,headers={'x-upsert':'true'});count('fixture-one/retain.png',1)
    sql((ROOT/'supabase/review-candidates/launch-combined.sql').read_text())
    sql("UPDATE rmg_private.launch_control SET enabled=true WHERE singleton; INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference) VALUES ('OR','fixture-1','10000000-0000-0000-0000-000000000001',now(),'synthetic reviewed mapping');")
    request('after insert denied','POST',obj('fixture-one/later.png'),(400,403),body=PNG);count('fixture-one/later.png',0)
    request('after delete denied','DELETE',obj('fixture-one/retain.png'),(200,204,400,403,404));count('fixture-one/retain.png',1)
    request('after update denied','PUT',obj('fixture-one/retain.png'),(400,403),body=HTML);count('fixture-one/retain.png',1)
    request('after upsert denied','POST',obj('fixture-one/retain.png'),(400,403),body=HTML,headers={'x-upsert':'true'});count('fixture-one/retain.png',1)
    status,_,raw=call('GET','/object/public/guide-photos/fixture-one/retain.png','anon')
    if status!=200 or raw!=PNG:raise AssertionError('retained object bytes changed or unavailable')
    results['checks']['retained bytes unchanged']={'http_status':status,'database_checked':True}
    request('synthetic unrelated insert','POST','/object/qa-unrelated/control.png',(200,),body=PNG)
    state("(SELECT count(*)=1 FROM storage.objects WHERE bucket_id='qa-unrelated' AND name='control.png')",'synthetic unrelated bucket')
    out=sql("BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true); SELECT public.rmg_own_status('claim','20000000-0000-0000-0000-000000000001')->>'status'; SELECT public.rmg_edit_details('OR','fixture-1','Boat','Gear',5::smallint,'Expertise','Species')->>'status'; ROLLBACK;")
    lines=out.splitlines()
    if 'approved' not in lines or 'saved' not in lines:raise AssertionError('approved owner status/edit RPC failed')
    results['checks']['owner status and edit']={'database_checked':True}
    print('PASS policy scenario assertions; owner status/edit remain available',flush=True)

if __name__=='__main__':
    try:sys.exit(main())
    except Exception as exc:
        print('FAIL:',str(exc),file=sys.stderr);sys.exit(1)
