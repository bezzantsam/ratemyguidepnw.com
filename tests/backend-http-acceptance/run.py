#!/usr/bin/env python3
"""Local PostgREST/JWT acceptance; all identities and keys are ephemeral.

Requires a pinned PostgREST 12.2.12 binary passed explicitly with --postgrest.
No application credentials or hosted connections are read or used.
"""
import argparse
import base64
import concurrent.futures
import hashlib
import hmac
import http.client
import json
import os
from pathlib import Path
import platform
import re
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse

ROOT=Path(__file__).resolve().parents[2]
TESTS=ROOT/'tests/backend-http-acceptance'
BASE_TESTS=ROOT/'tests/backend-independent-review'
VERSION='12.2.12'
BINARIES={('Darwin','arm64'):'4d605ebfe3b1de1f05b1e5b559544f6b27b856533f0099e87c10d6e59833d1bb',('Linux','x86_64'):'16dbc82fd830db6a28a03231ec99fcd28139fd4558bebe402586d9534376cec1'}
U=lambda n:f'00000000-0000-0000-0000-{n:012d}'
G=lambda n:f'10000000-0000-0000-0000-{n:012d}'
C=lambda n:f'20000000-0000-0000-0000-{n:012d}'
R=lambda n:f'30000000-0000-0000-0000-{n:012d}'


def encode(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')


def jwt(key, claims):
    header=encode(json.dumps({'alg':'HS256','typ':'JWT'},separators=(',',':')).encode())
    payload=encode(json.dumps(claims,separators=(',',':')).encode())
    data=(header+'.'+payload).encode()
    return data.decode()+'.'+encode(hmac.new(key,data,hashlib.sha256).digest())


def tamper_signature(token):
    header,payload,signature=token.split('.')
    raw=bytearray(base64.urlsafe_b64decode(signature+'='*((-len(signature))%4)))
    raw[0]^=1
    return header+'.'+payload+'.'+encode(raw)


def require(name):
    value=shutil.which(name)
    if not value: raise RuntimeError('required executable not found: '+name)
    return value


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1',0))
        return s.getsockname()[1]


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--postgrest',required=True,help='path to official pinned PostgREST binary')
    parser.add_argument('--results',help='write sanitized synthetic test results as JSON')
    args=parser.parse_args()
    binary=Path(args.postgrest).resolve(strict=True)
    expected=BINARIES.get((platform.system(),platform.machine()))
    if not expected or hashlib.sha256(binary.read_bytes()).hexdigest()!=expected:
        raise RuntimeError('PostgREST binary platform or SHA-256 does not match the pinned release')
    initdb,pgctl,psql,pgconfig=(require(x) for x in ('initdb','pg_ctl','psql','pg_config'))
    clean={'PATH':'/usr/bin:/bin:/opt/homebrew/bin','LC_ALL':'C'}
    postgres_version=subprocess.run([pgconfig,'--version'],env=clean,text=True,check=True,stdout=subprocess.PIPE).stdout.strip()
    if not postgres_version.startswith('PostgreSQL 17.'):
        raise RuntimeError('PostgreSQL 17 is required for this captured schema fixture')
    if platform.system()=='Darwin':
        libdir=subprocess.run([pgconfig,'--libdir'],env=clean,text=True,check=True,stdout=subprocess.PIPE).stdout.strip()
        clean['DYLD_LIBRARY_PATH']=libdir
    version=subprocess.run([str(binary),'--version'],env=clean,text=True,check=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=10).stdout.strip()
    if not re.search(r'(?<![0-9.])'+re.escape(VERSION)+r'(?![0-9.])',version):
        raise RuntimeError('unexpected PostgREST version')
    snapshot=hashlib.sha256((ROOT/'docs/backend-catalog-snapshot.json').read_bytes()).hexdigest()
    results={'postgrest_version':version,'postgresql_version':postgres_version,'captured_snapshot_sha256':snapshot,'mode':'synthetic-local-only','states':{},'jwt':{},'limitations':['No hosted Auth, OAuth, email, session revocation, gateway, storage or hosted configuration tested','Synthetic auth.uid shim; JWTs signed by run-owned test key','Audience claim absent accepted; issuer not enforced in this configuration']}
    with tempfile.TemporaryDirectory(prefix='ratemyguide-http-') as directory:
        root=Path(directory); data=root/'data'; dbport=free_port(); started=False; server=None
        def command(argv,*,input_text=None,check=True,extra_env=None,timeout=90):
            proc=subprocess.run(argv,input=input_text,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,env={**clean,**(extra_env or {})},timeout=timeout)
            if check and proc.returncode: raise RuntimeError('local command failed: '+Path(argv[0]).name+' (details withheld)')
            return proc
        def db(database='postgres'):
            return [psql,'-X','-v','ON_ERROR_STOP=1','-h',str(root),'-p',str(dbport),'-U','qa_owner','-d',database]
        def sql(database,statement):
            return command(db(database)+['-Atq'],input_text=statement).stdout.strip()
        def file(database,path): command(db(database)+['-f',str(path)])
        def assertdb(database,expr,label):
            actual=sql(database,'SELECT CASE WHEN ('+expr+") THEN 'ok' ELSE 'bad' END;")
            if actual!='ok': raise AssertionError('database state assertion failed: '+label)
        def call(port,method,path,token=None,payload=None):
            conn=http.client.HTTPConnection('127.0.0.1',port,timeout=15)
            headers={'Accept':'application/json'}
            body=None
            if token: headers['Authorization']='Bearer '+token
            if payload is not None:
                body=json.dumps(payload,separators=(',',':'))
                headers['Content-Type']='application/json'
                headers['Prefer']='return=minimal'
            try:
                conn.request(method,path,body=body,headers=headers)
                response=conn.getresponse(); raw=response.read()
                try: parsed=json.loads(raw) if raw else None
                except json.JSONDecodeError: parsed=None
                return response.status,parsed
            finally: conn.close()
        def check(port,label,method,path,expected_status,token=None,payload=None,code=None,verify=None,message=None):
            status,body=call(port,method,path,token,payload)
            actual_code=body.get('code') if isinstance(body,dict) else None
            actual_message=body.get('message') if isinstance(body,dict) else None
            if status!=expected_status or (code is not None and actual_code!=code) or (message is not None and actual_message!=message) or (verify is not None and not verify(body)):
                raise AssertionError(f'{label}: expected HTTP {expected_status} code {code}, got HTTP {status} code {actual_code}; body withheld')
            return status,body
        def start_server(database):
            port=free_port(); secret=secrets.token_hex(32).encode(); key=root/(database+'.key'); key.write_bytes(secret); key.chmod(0o600)
            conf=root/(database+'.conf')
            uri=f'postgresql://qa_authenticator@/{database}?host={urllib.parse.quote(str(root),safe="")}&port={dbport}'
            conf.write_text(f'db-uri = "{uri}"\ndb-schemas = "public"\ndb-anon-role = "anon"\ndb-config = false\njwt-secret = "@{key}"\njwt-aud = "ratemyguide-local"\nserver-host = "127.0.0.1"\nserver-port = {port}\ndb-pool = 6\n')
            conf.chmod(0o600)
            log=open(root/(database+'.log'),'w+')
            proc=subprocess.Popen([str(binary),str(conf)],stdout=log,stderr=subprocess.STDOUT,env=clean)
            ready=False
            try:
                deadline=time.monotonic()+20
                while time.monotonic()<deadline:
                    if proc.poll() is not None:
                        raise RuntimeError(f'PostgREST exited before readiness (exit {proc.returncode}); diagnostics withheld')
                    log.seek(0)
                    if 'Listening on port ' not in log.read():
                        time.sleep(.1); continue
                    try:
                        status,_=call(port,'GET','/public_angler_reviews?select=id&limit=1')
                        if status in (200,401,403) and proc.poll() is None:
                            ready=True
                            return proc,log,port,secret
                    except (ConnectionError,OSError,http.client.HTTPException): pass
                    time.sleep(.1)
                raise RuntimeError('PostgREST readiness timed out')
            finally:
                if not ready:
                    if proc.poll() is None:
                        proc.terminate()
                        try: proc.wait(timeout=5)
                        except subprocess.TimeoutExpired: proc.kill();proc.wait(timeout=5)
                    log.close()
        def stop_server(item):
            proc,log,_,_=item
            if proc.poll() is None:
                proc.terminate()
                try: proc.wait(timeout=5)
                except subprocess.TimeoutExpired: proc.kill();proc.wait(timeout=5)
            log.close()
        def tokens(secret):
            now=int(time.time()); common={'aud':'ratemyguide-local','iat':now-10,'exp':now+3600,'role':'authenticated'}
            return {i:jwt(secret,{**common,'sub':U(i)}) for i in range(1,8)},common
        try:
            command([initdb,'-D',str(data),'--username=qa_owner','--auth=trust','--no-locale'])
            command([pgctl,'-D',str(data),'-l',str(root/'postgres.log'),'-o',f"-c listen_addresses='' -c unix_socket_directories='{root}' -p {dbport}",'-w','start'])
            started=True
            schema=command([sys.executable,str(ROOT/'scripts/backend-audit/reconstruct.py')]).stdout
            sql('postgres',schema)
            sql('postgres','CREATE ROLE qa_authenticator LOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER; GRANT anon,authenticated TO qa_authenticator;')
            assertdb('postgres',"(SELECT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit FROM pg_roles WHERE rolname='qa_authenticator') AND (SELECT bool_and(NOT rolsuper AND NOT rolbypassrls) FROM pg_roles WHERE rolname IN ('anon','authenticated'))",'authenticator and application roles have no elevated database attributes')
            bare_schema='\n'.join(line for line in schema.splitlines() if not line.startswith('CREATE ROLE '))
            for index,(state,database) in enumerate((('A baseline','http_baseline'),('B inherited','http_inherited'),('C candidate','http_candidate'))):
                sql('postgres','CREATE DATABASE '+database+';')
                sql(database,bare_schema)
                file(database,BASE_TESTS/'fixtures.sql')
                sql(database,f"INSERT INTO public.reviews(id,guide_id,author_id,quality,intensity,would_book_again,body,status) VALUES ('{R(5)}','{G(4)}','{U(3)}',2,3,false,repeat('rejected ',10),'rejected');")
                file(database,TESTS/'postgrest-auth.sql')
                if index:
                    file(database,BASE_TESTS/'drift.sql')
                    inherited=(BASE_TESTS/'inherited-before.sql').read_text()
                    if index==2: inherited='\n'.join(x for x in inherited.splitlines() if not x.startswith('CREATE ROLE '))
                    sql(database,inherited)
                    file(database,ROOT/'scripts/backend-audit/proposed-authorization-lockdown.sql')
                    if index==2:file(database,BASE_TESTS/'candidate-inherited-delta.sql')
                server=start_server(database);_,_,port,secret=server; ts,common=tokens(secret)
                print('READY '+state,flush=True)
                # More cases are appended below; all recorded results are labels and statuses only.
                run_state(state,database,port,secret,ts,common,check,call,sql,assertdb,results,db,clean,command)
                stop_server(server);server=None
            if args.results: Path(args.results).write_text(json.dumps(results,indent=2,sort_keys=True)+'\n')
            print('PASS local HTTP acceptance for baseline, inherited and candidate states',flush=True)
            return 0
        finally:
            if server: stop_server(server)
            if started:
                stopped=command([pgctl,'-D',str(data),'-m','immediate','-w','stop'],check=False)
                if stopped.returncode: raise RuntimeError('could not stop owned local database')


def run_state(state,database,port,secret,ts,common,check,call,sql,assertdb,results,db,clean,command):
    state_results={}
    results['states'][state]=state_results
    def request(label,method,path,expected,token=None,payload=None,code=None,verify=None,message=None):
        status,body=check(port,label,method,path,expected,token,payload,code,verify,message)
        state_results[label]={'http_status':status,'code':code,'database_checked':False}
        return body
    published=lambda x:isinstance(x,list) and [r.get('id') for r in x]==[R(1)]
    review={'id':R(9),'guide_id':G(4),'author_id':U(1),'quality':4,'intensity':4,'would_book_again':True,'body':'synthetic test content '*5}
    if state=='A baseline':
        request('baseline public view permission error','GET','/public_angler_reviews?select=id',401,code='42501')
        request('baseline pending review accepted','POST','/reviews',201,ts[1],review)
        request('baseline self approval accepted','POST','/rpc/admin_decide_review',204,ts[4],{'p_id':R(4),'p_approve':True})
        request('baseline self claim accepted','POST','/rpc/admin_decide_claim',204,ts[4],{'p_id':C(3),'p_approve':True})
        assertdb(database,f"(SELECT status='pending' FROM public.reviews WHERE id='{R(9)}') AND (SELECT status='published' FROM public.reviews WHERE id='{R(4)}') AND (SELECT status='approved' FROM public.guide_claims WHERE id='{C(3)}') AND (SELECT count(*)=2 FROM public.moderation_audit WHERE target_id IN ('{R(4)}','{C(3)}')) AND (SELECT status='published' FROM public.reviews WHERE id='{R(1)}')",'baseline insert, self approvals and published fixture')
        state_results['baseline public view permission error']['database_checked']=True
        state_results['baseline pending review accepted']['database_checked']=True
        state_results['baseline self approval accepted']['database_checked']=True
        state_results['baseline self claim accepted']['database_checked']=True
        return
    request('anonymous published view','GET','/public_angler_reviews?select=id,body,quality',200,verify=published)
    request('anonymous direct published rows','GET','/reviews?select=id,body,quality',200,verify=published)
    request('anonymous reviewer identifier denied','GET','/reviews?select=author_id',401,code='42501')
    request('public view omits reviewer identifier','GET','/public_angler_reviews?select=author_id',400,code='42703')
    request('anonymous cannot read claim evidence','GET','/claim_evidence?select=claim_id,public_evidence',200,verify=lambda x:x==[])
    request('user one reads own evidence','GET','/claim_evidence?select=claim_id,public_evidence',200,ts[1],verify=lambda x:isinstance(x,list) and len(x)==1 and x[0].get('claim_id')==C(2) and x[0].get('public_evidence')=='QA private evidence')
    request('user two cannot read evidence','GET','/claim_evidence?select=claim_id,public_evidence',200,ts[2],verify=lambda x:x==[])
    request('user two cannot read queues','GET','/admin_pending_claims?select=id',200,ts[2],verify=lambda x:x==[])
    request('admin can read queues','GET','/admin_pending_claims?select=id,public_evidence',200,ts[4],verify=lambda x:isinstance(x,list) and {r.get('id') for r in x}=={C(2),C(3)} and any(r.get('public_evidence')=='QA private evidence' for r in x))
    request('authenticated reviewer identifier denied','GET','/reviews?select=author_id',403,ts[2],code='42501')
    request('owner detail edit blocked','PATCH','/guide_details?guide_id=eq.'+G(1),403,ts[5],{'expertise':'unsafe edit'},code='42501')
    request('owner media edit blocked','PATCH','/guide_media?guide_id=eq.'+G(1),403,ts[5],{'caption':'unsafe edit'},code='42501')
    request('claim write blocked','POST','/guide_claims',403,ts[2],{'guide_id':G(4),'claimant_id':U(2)},code='42501')
    request('claim evidence write blocked','POST','/claim_evidence',403,ts[1],{'claim_id':C(2),'claimant_name':'test','public_evidence':'test evidence'},code='42501')
    request('admin bootstrap blocked','POST','/site_admins',403,ts[2],{'user_id':U(2)},code='42501')
    assertdb(database,f"(SELECT expertise='before' FROM public.guide_details WHERE guide_id='{G(1)}') AND (SELECT caption='before' FROM public.guide_media WHERE guide_id='{G(1)}') AND (SELECT count(*)=3 FROM public.guide_claims) AND (SELECT count(*)=2 FROM public.guide_claims WHERE status='pending') AND (SELECT count(*)=1 FROM public.claim_evidence) AND NOT EXISTS(SELECT 1 FROM public.site_admins WHERE user_id='{U(2)}') AND (SELECT status='rejected' FROM public.reviews WHERE id='{R(5)}') AND (SELECT status='published' AND author_id='{U(1)}' FROM public.reviews WHERE id='{R(1)}') AND (SELECT status='pending' FROM public.reviews WHERE id='{R(2)}')",'denied writes, private author and published/pending/rejected fixtures')
    for label in ('owner detail edit blocked','owner media edit blocked','claim write blocked','claim evidence write blocked','admin bootstrap blocked','anonymous published view','anonymous direct published rows','anonymous reviewer identifier denied','public view omits reviewer identifier','anonymous cannot read claim evidence','authenticated reviewer identifier denied','admin can read queues','user two cannot read queues','user one reads own evidence','user two cannot read evidence'): state_results[label]['database_checked']=True
    if state=='B inherited':
        request('inherited review write bypass','POST','/reviews',201,ts[1],review)
        request('inherited moderator execute bypass','POST','/rpc/admin_decide_review',204,ts[4],{'p_id':R(2),'p_approve':True})
        assertdb(database,f"(SELECT status='pending' FROM public.reviews WHERE id='{R(9)}') AND (SELECT status='published' FROM public.reviews WHERE id='{R(2)}') AND (SELECT count(*)=1 FROM public.moderation_audit WHERE target_id='{R(2)}')",'inherited bypass')
        for label in ('inherited review write bypass','inherited moderator execute bypass'):state_results[label]['database_checked']=True
        return
    request('candidate review write blocked','POST','/reviews',403,ts[1],review,code='42501')
    request('candidate moderator execute blocked','POST','/rpc/admin_decide_review',403,ts[4],{'p_id':R(2),'p_approve':True},code='42501')
    assertdb(database,f"NOT EXISTS(SELECT 1 FROM public.reviews WHERE id='{R(9)}') AND (SELECT status='pending' FROM public.reviews WHERE id='{R(2)}') AND (SELECT count(*)=0 FROM public.moderation_audit)",'candidate locked state')
    for label in ('candidate review write blocked','candidate moderator execute blocked'):state_results[label]['database_checked']=True
    now=int(time.time())
    cases=(
        ('tampered signature',tamper_signature(jwt(secret,{**common,'sub':U(2)})),401,'PGRST301'),
        ('expired token',jwt(secret,{**common,'sub':U(2),'exp':now-3600}),401,'PGRST301'),
        ('not-yet-valid token',jwt(secret,{**common,'sub':U(2),'nbf':now+3600}),401,'PGRST301'),
        ('wrong audience',jwt(secret,{**common,'sub':U(2),'aud':'wrong-audience'}),401,'PGRST301'),
        ('ungranted database role',jwt(secret,{**common,'sub':U(2),'role':'qa_owner'}),403,'42501'),
        ('ungranted service role',jwt(secret,{**common,'sub':U(2),'role':'service_role'}),403,'42501'),
    )
    expected_flag={'tampered signature':'signature','expired token':'expired','not-yet-valid token':'notyet','wrong audience':'audience','ungranted database role':'role','ungranted service role':'role'}
    for label,token,expected,code in cases:
        status,error=check(port,label,'GET','/public_angler_reviews?select=id',expected,token,code=code)
        # Retain only predetermined classifications, never response text or JWTs.
        content=' '.join(str(error.get(k) or '') for k in ('message','details','hint')).lower() if isinstance(error,dict) else ''
        flags=[word for word in ('signature','expired','not yet','notyet','audience','permission','role') if word in content]
        if expected_flag[label] not in flags:
            raise AssertionError(label+': expected token-error classification missing; response withheld')
        results['jwt'][label]={'http_status':status,'code':code,'error_flags':flags}
    without_aud={k:v for k,v in common.items() if k!='aud'}
    no_aud=jwt(secret,{**without_aud,'sub':U(2)})
    wrong_issuer=jwt(secret,{**common,'sub':U(2),'iss':'https://untrusted-issuer.invalid'})
    no_role=jwt(secret,{k:v for k,v in {**common,'sub':U(2)}.items() if k!='role'})
    for label,token in (('missing audience accepted',no_aud),('issuer not enforced',wrong_issuer),('missing role defaults to anonymous',no_role)):
        status,_=check(port,label,'GET','/public_angler_reviews?select=id',200,token,verify=published)
        results['jwt'][label]={'http_status':status}
    status,_=check(port,'missing role cannot read admin queue','GET','/admin_pending_claims?select=id',401,no_role,code='42501')
    results['jwt']['missing role cannot read admin queue']={'http_status':status,'code':'42501'}
    explicit_anon=jwt(secret,{**common,'sub':U(4),'role':'anon','user_metadata':{'is_admin':True}})
    status,_=check(port,'explicit anonymous role cannot read admin queue','GET','/admin_pending_claims?select=id',401,explicit_anon,code='42501')
    results['jwt']['explicit anonymous role cannot read admin queue']={'http_status':status,'code':'42501'}
    assertdb(database,f"(SELECT status='pending' FROM public.reviews WHERE id='{R(2)}') AND (SELECT count(*)=0 FROM public.moderation_audit)",'token checks preserve target state')
    for value in results['jwt'].values():value['database_checked']=True
    # Local DB owner explicitly enables only the moderator functions, not DML.
    sql(database,'GRANT EXECUTE ON FUNCTION public.admin_decide_review(uuid,boolean,text),public.admin_decide_claim(uuid,boolean,text) TO authenticated;')
    request('independent review approved','POST','/rpc/admin_decide_review',204,ts[4],{'p_id':R(2),'p_approve':True})
    request('independent claim approved','POST','/rpc/admin_decide_claim',204,ts[4],{'p_id':C(2),'p_approve':True})
    assertdb(database,f"(SELECT status='published' FROM public.reviews WHERE id='{R(2)}') AND (SELECT status='approved' FROM public.guide_claims WHERE id='{C(2)}') AND (SELECT count(*)=2 FROM public.moderation_audit) AND (SELECT review_count=1 AND average_quality=3 FROM public.guides WHERE id='{G(2)}')",'independent moderation')
    for label in ('independent review approved','independent claim approved'):state_results[label]['database_checked']=True
    request('admin self review denied','POST','/rpc/admin_decide_review',400,ts[4],{'p_id':R(4),'p_approve':True},code='P0001',message='Cannot approve your own submission')
    request('admin self claim denied','POST','/rpc/admin_decide_claim',400,ts[4],{'p_id':C(3),'p_approve':True},code='P0001',message='Cannot approve your own submission')
    request('owner moderation denied','POST','/rpc/admin_decide_review',400,ts[5],{'p_id':R(3),'p_approve':False},code='P0001',message='Guide owners cannot moderate their own guide')
    spoof=jwt(secret,{**common,'sub':U(2),'user_metadata':{'is_admin':True,'role':'admin'}})
    request('user metadata cannot confer admin','POST','/rpc/admin_decide_review',400,spoof,{'p_id':R(3),'p_approve':True},code='P0001',message='Not authorized')
    assertdb(database,f"(SELECT status='pending' FROM public.reviews WHERE id='{R(3)}') AND (SELECT status='pending' FROM public.reviews WHERE id='{R(4)}') AND (SELECT status='pending' FROM public.guide_claims WHERE id='{C(3)}') AND (SELECT count(*)=2 FROM public.moderation_audit)",'denied moderation preserved state')
    for label in ('admin self review denied','admin self claim denied','owner moderation denied','user metadata cannot confer admin'):state_results[label]['database_checked']=True
    concurrent_claims(database,port,ts,call,sql,assertdb,db,clean,state_results)


def concurrent_claims(database,port,ts,call,sql,assertdb,db,clean,state_results):
    sql(database,f"INSERT INTO public.guide_claims(id,guide_id,claimant_id) VALUES ('{C(9)}','{G(4)}','{U(1)}'),('{C(10)}','{G(4)}','{U(2)}');")
    locker_sql=f"BEGIN; SELECT 1 FROM public.guides WHERE id='{G(4)}' FOR UPDATE; SELECT pg_sleep(7); COMMIT;"
    locker=subprocess.Popen(db(database)+['-c',locker_sql],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,env={**clean,'PGAPPNAME':'qa_http_lock'})
    try:
        deadline=time.monotonic()+5
        while time.monotonic()<deadline:
            if locker.poll() is not None: raise RuntimeError('concurrency lock session exited early')
            if sql(database,"SELECT count(*) FROM pg_stat_activity WHERE application_name='qa_http_lock' AND wait_event='PgSleep';")=='1':break
            time.sleep(.04)
        else: raise RuntimeError('concurrency lock session did not become ready')
        barrier=threading.Barrier(2)
        def attempt(claim,token):
            barrier.wait(timeout=5)
            return call(port,'POST','/rpc/admin_decide_claim',token,{'p_id':claim,'p_approve':True})
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            futures=[pool.submit(attempt,C(9),ts[4]),pool.submit(attempt,C(10),ts[5])]
            deadline=time.monotonic()+5
            while time.monotonic()<deadline:
                waiting=int(sql(database,"SELECT count(*) FROM pg_stat_activity WHERE datname='http_candidate' AND usename='qa_authenticator' AND wait_event_type='Lock';"))
                if waiting>=2:break
                time.sleep(.04)
            else: raise RuntimeError('two HTTP database sessions did not concurrently wait on the lock')
            if locker.wait(timeout=12)!=0: raise RuntimeError('concurrency lock session failed')
            outputs=[future.result(timeout=15) for future in futures]
        winner=[(status,body) for status,body in outputs if status==204]
        loser=[(status,body) for status,body in outputs if status==400 and isinstance(body,dict) and body.get('code')=='P0001' and body.get('message')=='A captain is already approved for this listing']
        if len(winner)!=1 or len(loser)!=1: raise AssertionError('competing HTTP claims did not return one approval and the exact conflict')
        assertdb(database,f"(SELECT count(*)=1 FROM public.guide_claims WHERE id IN ('{C(9)}','{C(10)}') AND status='approved') AND (SELECT count(*)=1 FROM public.guide_claims WHERE id IN ('{C(9)}','{C(10)}') AND status='pending') AND (SELECT count(*)=1 FROM public.moderation_audit WHERE target_id IN ('{C(9)}','{C(10)}')) AND (SELECT review_count=0 FROM public.guides WHERE id='{G(4)}')",'concurrent HTTP claim decisions')
        state_results['concurrent competing claims']={'http_statuses':[204,400],'observed_blocked_sessions':2,'database_checked':True}
    finally:
        if locker.poll() is None:
            locker.terminate();locker.wait(timeout=5)
        if locker.stdout:locker.stdout.close()


if __name__=='__main__':
    try: raise SystemExit(main())
    except (RuntimeError,AssertionError,subprocess.TimeoutExpired,OSError) as exc:
        print('ERROR: '+str(exc),file=sys.stderr)
        raise SystemExit(1)
