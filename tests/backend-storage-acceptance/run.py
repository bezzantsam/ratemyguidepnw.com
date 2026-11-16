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
    p.add_argument('--results',help='sanitized output JSON')
    args=p.parse_args()
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
            schema=cmd([sys.executable,str(ROOT/'scripts/backend-audit/reconstruct.py')]).stdout
            sql(schema)
            file(ROOT/'tests/backend-independent-review/fixtures.sql')
            sql(f"DELETE FROM public.site_admins WHERE user_id='{U(5)}';")
            state(f"NOT EXISTS (SELECT 1 FROM public.site_admins WHERE user_id='{U(5)}') AND EXISTS (SELECT 1 FROM public.site_admins WHERE user_id='{U(4)}')",'separate owner and administrator')
            env={**clean,'NODE_ENV':'production','SERVER_HOST':'127.0.0.1','SERVER_PORT':str(webport),'DATABASE_URL':f'postgresql://qa_owner@127.0.0.1:{dbport}/postgres','DB_INSTALL_ROLES':'false','DB_SUPER_USER':'qa_owner','AUTH_JWT_SECRET':secret.decode(),'AUTH_JWT_ALGORITHM':'HS256','SERVICE_KEY':tokens['service'],'ANON_KEY':tokens['anon'],'STORAGE_BACKEND':'file','STORAGE_FILE_BACKEND_PATH':str(root/'objects'),'STORAGE_S3_BUCKET':'qa-fixture','STORAGE_S3_REGION':'local','UPLOAD_FILE_SIZE_LIMIT':'1024','UPLOAD_FILE_SIZE_LIMIT_STANDARD':'1024','PG_QUEUE_ENABLE':'false','IMAGE_TRANSFORMATION_ENABLED':'false','LOG_LEVEL':'fatal','AWS_EC2_METADATA_DISABLED':'true'}
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
            for bucket,public in (('qa-private-evidence',False),('qa-media-quarantine',False),('qa-public-empty',True)):
                expect('create '+bucket,'POST','/bucket',200,'service',{'name':bucket,'id':bucket,'public':public,'file_size_limit':512,'allowed_mime_types':['image/png']})
                state(f"(SELECT public={'true' if public else 'false'} FROM storage.buckets WHERE id='{bucket}')",'bucket config');mark('create '+bucket)
            file(TESTS/'local-proposal.sql');file(TESTS/'local-intents.sql')
            # Remaining API authorization checks are performed below.
            exercise(expect,call,sql,state,mark,tokens,results,sensitive)
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

def exercise(expect,call,sql,state,mark,tokens,results,sensitive):
    evidence='qa-private-evidence'; media='qa-media-quarantine'; public='qa-public-empty'
    def obj(bucket,key):return '/object/'+bucket+'/'+key
    def count(bucket,key,n):state(f"(SELECT count(*)={n} FROM storage.objects WHERE bucket_id='{bucket}' AND name='{key}')",bucket+'/'+key)
    def upload(label,who,bucket,key,status=200,body=PNG,mime='image/png',headers=None):
        expect(label,'POST',obj(bucket,key),status,who,body,mime,headers);count(bucket,key,1 if status==200 else 0);mark(label)
    upload('locked claimant upload','1',evidence,'claims/one.png',400)
    upload('locked owner upload','5',media,'media/owner.png',400)
    upload('locked administrator upload','4',evidence,'claims/two.png',400)
    upload('locked anonymous upload','anon',evidence,'claims/two.png',400)
    sql((TESTS/'local-enable-fixture.sql').read_text())
    upload('claimant upload','1',evidence,'claims/one.png')
    label='other claimant cross upload';expect(label,'POST',obj(evidence,'claims/two-later.png'),400,'1',PNG,'image/png');count(evidence,'claims/two-later.png',0);mark(label)
    label='other claimant read';expect(label,'GET','/object/authenticated/'+evidence+'/claims/one.png',400,'2');count(evidence,'claims/one.png',1);mark(label)
    label='anonymous read';expect(label,'GET','/object/authenticated/'+evidence+'/claims/one.png',400,'anon');count(evidence,'claims/one.png',1);mark(label)
    for who,label in [('1','claimant reads evidence'),('4','admin reads evidence')]:
        expect(label,'GET','/object/authenticated/'+evidence+'/claims/one.png',200,who,verify=lambda v,r:r==PNG);count(evidence,'claims/one.png',1);mark(label)
    label='claimant list';expect(label,'POST','/object/list/'+evidence,200,'1',{'prefix':'claims/','limit':100},verify=lambda v,r:isinstance(v,list) and any(x.get('name')=='one.png' for x in v));count(evidence,'claims/one.png',1);mark(label)
    label='admin list';expect(label,'POST','/object/list/'+evidence,200,'4',{'prefix':'claims/','limit':100},verify=lambda v,r:isinstance(v,list) and any(x.get('name')=='one.png' for x in v));count(evidence,'claims/one.png',1);mark(label)
    label='anonymous list';expect(label,'POST','/object/list/'+evidence,400,'anon',{'prefix':'claims/','limit':100});count(evidence,'claims/one.png',1);mark(label)
    label='other claimant list';expect(label,'POST','/object/list/'+evidence,200,'2',{'prefix':'claims/','limit':100},verify=lambda v,r:isinstance(v,list) and not any(x.get('name')=='one.png' for x in v));count(evidence,'claims/one.png',1);mark(label)
    upload('second claimant upload','2',evidence,'claims/two.png')
    sql(f"UPDATE public.guide_claims SET status='denied' WHERE id='{C(10)}';")
    label='rejected claim evidence remains readable';expect(label,'GET','/object/authenticated/'+evidence+'/claims/two.png',200,'2',verify=lambda v,r:r==PNG);count(evidence,'claims/two.png',1);mark(label)
    upload('rejected claim new upload','2',evidence,'claims/two-later.png',400)
    upload('unrelated media upload','1',media,'media/owner.png',400)
    upload('approved owner media','5',media,'media/owner.png',headers={'x-metadata':base64.b64encode(b'{"public":true}').decode()})
    state(f"(SELECT user_metadata->>'public'='true' FROM storage.objects WHERE bucket_id='{media}' AND name='media/owner.png') AND (SELECT NOT public FROM storage.buckets WHERE id='{media}')",'user metadata cannot make bucket public')
    label='admin reads media';expect(label,'GET','/object/authenticated/'+media+'/media/owner.png',200,'4',verify=lambda v,r:r==PNG);count(media,'media/owner.png',1);mark(label)
    label='private media public URL';expect(label,'GET','/object/public/'+media+'/media/owner.png',400,'anon');count(media,'media/owner.png',1);mark(label)
    label='bucket change';expect(label,'PUT','/bucket/'+media,400,'5',{'public':True});state(f"(SELECT NOT public FROM storage.buckets WHERE id='{media}')",label);mark(label)
    upload('cross bucket upload','5',public,'media/owner.png',400)
    label='repeated upload';expect(label,'POST',obj(media,'media/owner.png'),400,'5',PNG,'image/png');count(media,'media/owner.png',1);mark(label)
    label='upsert existing';expect(label,'POST',obj(media,'media/owner.png'),400,'5',PNG,'image/png',{'x-upsert':'true'});count(media,'media/owner.png',1);mark(label)
    label='overwrite existing';expect(label,'PUT',obj(media,'media/owner.png'),400,'5',PNG,'image/png');count(media,'media/owner.png',1);mark(label)
    for operation in ('copy','move'):
        label=operation+' to public bucket';expect(label,'POST','/object/'+operation,400,'5',{'bucketId':media,'sourceKey':'media/owner.png','destinationBucket':public,'destinationKey':'media/owner.png'});count(media,'media/owner.png',1);count(public,'media/owner.png',0);mark(label)
    label='other claimant delete';expect(label,'DELETE',obj(media,'media/owner.png'),400,'2');count(media,'media/owner.png',1);mark(label)
    label='delete pending media';expect(label,'DELETE',obj(media,'media/owner.png'),400,'5');count(media,'media/owner.png',1);mark(label)
    upload('oversized file','5',media,'media/oversize.png',400,b'x'*513)
    upload('active content MIME','5',media,'media/active.png',400,HTML,'text/html')
    upload('spoofed PNG MIME quarantined','5',media,'media/spoof.png',200,HTML,'image/png')
    label='spoof inaccessible publicly';expect(label,'GET','/object/public/'+media+'/media/spoof.png',400,'anon');count(media,'media/spoof.png',1);mark(label)
    label='unauthorized sign';expect(label,'POST','/object/sign/'+media+'/media/owner.png',400,'2',{'expiresIn':8});count(media,'media/owner.png',1);mark(label)
    label='owner sign';value,_=expect(label,'POST','/object/sign/'+media+'/media/owner.png',200,'5',{'expiresIn':8});count(media,'media/owner.png',1);mark(label)
    signed=value.get('signedURL') if isinstance(value,dict) else None
    if not isinstance(signed,str) or not signed.startswith('/object/sign/'):raise AssertionError('invalid local signed URL')
    query=urllib.parse.parse_qs(urllib.parse.urlsplit(signed).query)
    if 'token' not in query:raise AssertionError('signed URL missing token')
    sensitive.extend((signed.encode(),query['token'][0].encode()))
    sql(f"UPDATE public.guide_claims SET status='denied' WHERE id='{C(1)}';")
    label='revoked owner read';expect(label,'GET','/object/authenticated/'+media+'/media/owner.png',400,'5');count(media,'media/owner.png',1);mark(label)
    label='issued URL survives revocation';expect(label,'GET',signed,200,verify=lambda v,r:r==PNG);count(media,'media/owner.png',1);mark(label)
    time.sleep(9)
    label='signed URL expired';expect(label,'GET',signed,400);count(media,'media/owner.png',1);mark(label)

if __name__=='__main__':
    try:sys.exit(main())
    except Exception as exc:
        print('FAIL:',str(exc),file=sys.stderr);sys.exit(1)
