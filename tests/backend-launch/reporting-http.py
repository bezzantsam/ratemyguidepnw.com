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
code,ready=request('/rpc/rmg_review_write_availability',{'p_jurisdiction':'OR','p_source_id':'fixture-two'})
require(code==200 and ready=={'available':True},'local write readiness unavailable')
month_args={**review_args,'p_source_id':'fixture-two','p_trip_month':'2026-07'}
code,submitted=request('/rpc/rmg_submit_review_v2',month_args,reporter)
require(code==200 and submitted.get('status')=='pending','month review receipt missing')
code,owned=request('/rpc/rmg_own_review_for_guide',{'p_jurisdiction':'OR','p_source_id':'fixture-two'},reporter)
require(code==200 and owned.get('id')==submitted.get('id') and owned.get('status')=='pending','guide recovery failed')
code,decision=request('/rpc/rmg_decide_submission',{'p_kind':'review','p_id':submitted['id'],'p_approve':True,'p_reason':'Independent review of synthetic trip'},moderator)
require(code==200 and decision.get('status')=='published','month review publication failed')
code,published=request('/public_angler_reviews?id=eq.'+submitted['id']+'&select=id,trip_month')
require(code==200 and len(published)==1 and published[0]['trip_month']=='2026-07-01','published month did not persist')
revision_args={'p_review_id':submitted['id'],'p_quality':4,'p_intensity':None,'p_rebook':None,'p_body':'Synthetic revision','p_firsthand':True,'p_relationship':'none','p_trip_responses':None,'p_trip_month_specified':True,'p_trip_month':'2026-08'}
code,revision=request('/rpc/rmg_submit_revision_v2',revision_args,reporter)
require(code==200 and revision.get('status')=='pending','month revision receipt missing')
code,published=request('/public_angler_reviews?id=eq.'+submitted['id']+'&select=id,trip_month')
require(code==200 and published[0]['trip_month']=='2026-07-01','unreviewed month became public')
code,decision=request('/rpc/rmg_decide_revision',{'p_id':revision['id'],'p_approve':True,'p_reason':'Independent review of synthetic revision'},moderator)
require(code==200 and decision.get('status')=='approved','month revision approval failed')
code,published=request('/public_angler_reviews?id=eq.'+submitted['id']+'&select=id,trip_month')
require(code==200 and published[0]['trip_month']=='2026-08-01','approved month edit missing')
code,_=request('/rpc/rmg_report_review',args);require(code in (401,403,404),'anonymous report unexpectedly available')
code,first=request('/rpc/rmg_report_review',args,reporter);require(code==200 and first.get('status')=='submitted' and first.get('existing') is False,'persisted report receipt missing')
code,retry=request('/rpc/rmg_report_review',args,reporter);require(code==200 and retry.get('id')==first.get('id') and retry.get('existing') is True,'report retry not idempotent')
code,_=request('/review_flags?select=*',identity=reporter);require(code in (401,403,404),'direct report data exposed')
code,_=request('/rpc/rmg_report_queue',{'p_offset':0,'p_limit':100},reporter);require(code==403,'ordinary user accessed moderation queue')
code,queue=request('/rpc/rmg_report_queue',{'p_offset':0,'p_limit':100},moderator)
require(code==200 and any(row.get('id')==first['id'] and 'reporter_id' not in row for row in queue),'moderator queue missing private report')
code,result=request('/rpc/rmg_resolve_report',{'p_id':first['id']},moderator);require(code==200 and result=={'id':first['id'],'status':'resolved'},'moderator resolution failed')
code,queue=request('/rpc/rmg_report_queue',{'p_offset':0,'p_limit':100},moderator);require(code==200 and not any(row.get('id')==first['id'] for row in queue),'resolved report remained pending')
print('PASS local PostgREST: JWT roles, readiness, month/revision persistence, recovery, reporting and moderation')
