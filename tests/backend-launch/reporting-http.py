#!/usr/bin/env python3
"""Exercise reporting over an owned loopback PostgREST and synthetic JWTs."""
import base64
import hashlib
import hmac
import json
import os
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

base=os.environ['RMG_REPORT_TEST_URL']
p=urlsplit(base)
if p.scheme!='http' or p.hostname!='127.0.0.1' or not p.port or p.path not in ('','/'):
    raise SystemExit('Refusing non-loopback test endpoint')
secret=os.environ['RMG_REPORT_TEST_SECRET'].encode()
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None
opener=build_opener(ProxyHandler({}),NoRedirect())
def b64(data): return base64.urlsafe_b64encode(data).rstrip(b'=')
def token(sub):
    header=b64(b'{"alg":"HS256","typ":"JWT"}')
    payload=b64(json.dumps({'role':'authenticated','sub':sub,'exp':int(time.time())+300},separators=(',',':')).encode())
    msg=header+b'.'+payload
    return (msg+b'.'+b64(hmac.new(secret,msg,hashlib.sha256).digest())).decode()
def request(path,data=None,identity=None,method=None):
    headers={'Accept':'application/json'}
    if identity: headers['Authorization']='Bearer '+token(identity)
    if data is not None: headers['Content-Type']='application/json';data=json.dumps(data).encode()
    try:
        with opener.open(Request(base+path,data=data,headers=headers,method=method),timeout=5) as r: code=r.status;raw=r.read()
    except HTTPError as e: code=e.code;raw=e.read()
    try: body=json.loads(raw) if raw else None
    except ValueError: body=None
    return code,body
def require(condition,message):
    if not condition: raise AssertionError(message)
for attempt in range(50):
    try:
        if request('/')[0] in (200,401,403): break
    except (URLError,ConnectionError): pass
    time.sleep(.1)
else: raise SystemExit('Local PostgREST did not start')
review='70000000-0000-0000-0000-000000000002'
args={'p_jurisdiction':'OR','p_source_id':'rate-2','p_review_id':review,'p_reason':'other'}
reporter='00000000-0000-0000-0000-000000000003'
moderator='00000000-0000-0000-0000-000000000004'
author='00000000-0000-0000-0000-000000000001'
review_args={'p_jurisdiction':'OR','p_source_id':'fixture-one','p_quality':5,'p_intensity':None,'p_rebook':None,'p_body':'Synthetic duplicate','p_firsthand':True,'p_relationship':'none','p_trip_responses':None}
code,duplicate=request('/rpc/rmg_submit_review',review_args,author)
require(code!=200 and isinstance(duplicate,dict) and duplicate.get('code')=='P4091','confirmed duplicate code not preserved over PostgREST')
code,_=request('/rpc/rmg_report_review',args);require(code in (401,403,404),'anonymous report unexpectedly available')
code,first=request('/rpc/rmg_report_review',args,reporter);require(code==200 and first.get('status')=='submitted' and first.get('existing') is False,'persisted report receipt missing')
code,retry=request('/rpc/rmg_report_review',args,reporter);require(code==200 and retry.get('id')==first.get('id') and retry.get('existing') is True,'report retry not idempotent')
code,_=request('/review_flags?select=*',identity=reporter);require(code in (401,403,404),'direct report data exposed')
code,_=request('/rpc/rmg_report_queue',{'p_offset':0,'p_limit':100},reporter);require(code==403,'ordinary user accessed moderation queue')
code,queue=request('/rpc/rmg_report_queue',{'p_offset':0,'p_limit':100},moderator)
require(code==200 and any(row.get('id')==first['id'] and 'reporter_id' not in row for row in queue),'moderator queue missing private report')
code,result=request('/rpc/rmg_resolve_report',{'p_id':first['id']},moderator);require(code==200 and result=={'id':first['id'],'status':'resolved'},'moderator resolution failed')
code,queue=request('/rpc/rmg_report_queue',{'p_offset':0,'p_limit':100},moderator);require(code==200 and not any(row.get('id')==first['id'] for row in queue),'resolved report remained pending')
print('PASS local PostgREST: real JWT roles, denied direct access, durable retry, moderator queue and resolution')
