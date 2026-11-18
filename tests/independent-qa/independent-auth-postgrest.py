#!/usr/bin/env python3
"""05 synthetic real local Auth/PostgREST assertions; NEVER use hosted endpoints."""
import html
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import time
from html.parser import HTMLParser
from urllib.error import HTTPError
from urllib.parse import quote, urlencode, urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

stage='safety checks'
class StopRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None
opener=build_opener(StopRedirect())
class Links(HTMLParser):
    def __init__(self): super().__init__();self.urls=[]
    def handle_starttag(self,tag,attrs):
        if tag.lower()=='a': self.urls.extend(v for k,v in attrs if k.lower()=='href' and v)
def require(condition,label):
    if not condition: raise AssertionError(label)
def loopback(url,schemes=('http',)):
    p=urlsplit(url)
    require(p.scheme in schemes and p.hostname=='127.0.0.1' and p.port and not p.fragment,'nonlocal endpoint')
    return p
def main():
    global stage
    require(os.environ.get('RUNNER_ENVIRONMENT')=='github-hosted','ephemeral CI required')
    project=os.environ.get('RMG_LOCAL_PROJECT','')
    runid=os.environ.get('GITHUB_RUN_ID','');attempt=os.environ.get('GITHUB_RUN_ATTEMPT','')
    require(runid.isdigit() and attempt.isdigit() and project=='rmgqa'+runid+attempt,'unexpected project')
    temp=Path(os.environ['RUNNER_TEMP']).resolve(strict=True)
    status_path=Path(os.environ['RMG_LOCAL_STATUS_FILE']).resolve(strict=True)
    require(status_path.is_relative_to(temp) and status_path.is_file() and not (status_path.stat().st_mode & 0o077),'unsafe status file')
    status=json.loads(status_path.read_text())
    api=status['API_URL'].rstrip('/');mail=status['MAILPIT_URL'].rstrip('/');db=status['DB_URL']
    loopback(api);loopback(mail);loopback(db,('postgres','postgresql'))
    require(urlsplit(api).port!=urlsplit(mail).port,'endpoints must differ')
    key=status.get('ANON_KEY') or status.get('PUBLISHABLE_KEY');require(isinstance(key,str) and key,'missing local key')
    password='qa-'+secrets.token_urlsafe(24);run_tag=secrets.token_hex(6)
    def request(method,url,payload=None,token=None,expected=None):
        loopback(url)
        headers={'Accept':'application/json'}
        if urlsplit(url).port==urlsplit(api).port:
            headers['apikey']=key
            headers['Authorization']='Bearer '+(token or key)
        data=None
        if payload is not None:headers['Content-Type']='application/json';data=json.dumps(payload).encode()
        try:
            with opener.open(Request(url,data=data,headers=headers,method=method),timeout=12) as r:
                code=r.status;raw=r.read();location=r.headers.get('Location')
        except HTTPError as e:code=e.code;raw=e.read();location=e.headers.get('Location')
        require(expected is None or code in expected,'unexpected HTTP status')
        try:body=json.loads(raw) if raw else None
        except (ValueError,UnicodeDecodeError):body=None
        return code,body,location
    def sql(query):
        result=subprocess.run(['docker','exec','-i','supabase_db_'+project,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],input=query,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30)
        require(result.returncode==0,'local synthetic SQL failed')
        return result.stdout.strip()
    def rpc(name,args,token=None,expected=(200,)):
        return request('POST',api+'/rest/v1/rpc/'+name,args,token,expected)
    def signup(label):
        nonlocal api
        email='qa-'+run_tag+'-'+label+'@example.invalid'
        return_to='http://127.0.0.1:3000/guides/og-0002254?intent=review'
        _,body,_=request('POST',api+'/auth/v1/signup?'+urlencode({'redirect_to':return_to}),{'email':email,'password':password},expected=(200,))
        require(isinstance(body,dict) and not body.get('access_token'),'unconfirmed signup created session')
        code,_,_=request('POST',api+'/auth/v1/token?grant_type=password',{'email':email,'password':password})
        require(code in (400,401,403),'unconfirmed password session accepted')
        link=None
        for _ in range(30):
            _,listing,_=request('GET',mail+'/api/v1/messages',expected=(200,))
            for entry in (listing or {}).get('messages',[]):
                tos=entry.get('To') or []
                if any(isinstance(t,dict) and str(t.get('Address','')).lower()==email for t in tos):
                    mid=entry.get('ID');require(isinstance(mid,str) and re.fullmatch(r'[A-Za-z0-9_-]+',mid),'invalid synthetic mail id')
                    _,detail,_=request('GET',mail+'/api/v1/message/'+quote(mid,safe=''),expected=(200,))
                    parser=Links();parser.feed((detail or {}).get('HTML') or '')
                    for candidate in parser.urls:
                        candidate=html.unescape(candidate);p=urlsplit(candidate)
                        if p.path.endswith('/verify') and p.hostname=='127.0.0.1' and p.port==urlsplit(api).port:
                            link=candidate;break
                if link:break
            if link:break
            time.sleep(1)
        require(link is not None,'confirmation email missing')
        _,_,location=request('GET',link,expected=(302,303))
        require(isinstance(location,str),'missing auth redirect')
        dest=urlsplit(location)
        require(dest.scheme=='http' and dest.hostname=='127.0.0.1' and dest.port==3000 and dest.path=='/guides/og-0002254' and dest.query=='intent=review','sign-in return destination changed')
        _,session,_=request('POST',api+'/auth/v1/token?grant_type=password',{'email':email,'password':password},expected=(200,))
        token=(session or {}).get('access_token');uid=((session or {}).get('user') or {}).get('id')
        require(isinstance(token,str) and token and isinstance(uid,str) and re.fullmatch(r'[0-9a-f-]{36}',uid),'confirmed session missing')
        return token,uid
    stage='real synthetic signups and confirmations'
    author,author_id=signup('author');captain,captain_id=signup('captain');moderator,moderator_id=signup('moderator');other,other_id=signup('other')
    require(len({author_id,captain_id,moderator_id,other_id})==4,'synthetic actors not distinct')
    stage='default-off direct RPC'
    code,_,_=rpc('rmg_resolve_guide',{'p_jurisdiction':'OR','p_source_id':'fixture-one'},expected=(400,401,403,404,500,503));require(code!=200,'disabled RPC exposed')
    require(sql("SELECT CASE WHEN enabled=false THEN 'off' ELSE 'bad' END FROM rmg_private.launch_control WHERE singleton;")=='off','gate was not initially off')
    sql("UPDATE rmg_private.launch_control SET enabled=true WHERE singleton; INSERT INTO public.site_admins(user_id) VALUES ('"+moderator_id+"'::uuid);")
    stage='review submission and published-only visibility'
    responses={'version':1,'answers':{'children_present':{'state':'not_applicable'},'guide_patience':{'state':'answered','value':4}}}
    review_args={'p_jurisdiction':'OR','p_source_id':'fixture-one','p_quality':5,'p_intensity':None,'p_rebook':None,'p_body':'Synthetic original review','p_firsthand':True,'p_relationship':'none','p_trip_responses':responses}
    _,review,_=rpc('rmg_submit_review',review_args,author);rid=(review or {}).get('id');require(isinstance(rid,str) and re.fullmatch(r'[0-9a-f-]{36}',rid) and review.get('status')=='pending','review receipt')
    _,summary,_=rpc('rmg_review_summary',{'p_jurisdiction':'OR','p_source_id':'fixture-one'});require(summary.get('count')==0 and summary.get('averageQuality') is None,'pending review counted')
    _,rows,_=request('GET',api+'/rest/v1/public_angler_reviews?'+urlencode({'id':'eq.'+rid,'select':'id,body,quality'}),expected=(200,));require(rows==[],'pending review public')
    code,_,_=rpc('rmg_submit_review',review_args,author,expected=(400,409));require(code!=200,'duplicate review accepted')
    stage='cross-user review controls'
    code,_,_=rpc('rmg_submit_revision',{'p_review_id':rid,'p_quality':1,'p_intensity':None,'p_rebook':None,'p_body':'Synthetic unauthorized edit','p_firsthand':True,'p_relationship':'none','p_trip_responses':None},other,expected=(400,401,403,404,409,500));require(code!=200,'cross-user revision accepted')
    code,_,_=request('PATCH',api+'/rest/v1/reviews?'+urlencode({'id':'eq.'+rid}),{'status':'published'},other,expected=(200,204,401,403,404));require(code!=200,'cross-user direct publish accepted')
    code,_,_=request('DELETE',api+'/rest/v1/reviews?'+urlencode({'id':'eq.'+rid}),token=other,expected=(200,204,401,403,404));require(code!=200,'cross-user direct delete accepted')
    _,own,_=rpc('rmg_own_status',{'p_kind':'review','p_id':rid},author);require((own or {}).get('status')=='pending','cross-user direct write changed review')
    _,decision,_=rpc('rmg_decide_submission',{'p_kind':'review','p_id':rid,'p_approve':True,'p_reason':'Synthetic independent moderator evidence'},moderator);require(decision=={'id':rid,'status':'published'},'review moderation receipt')
    _,summary,_=rpc('rmg_review_summary',{'p_jurisdiction':'OR','p_source_id':'fixture-one'});require(summary.get('count')==1 and float(summary.get('averageQuality'))==5 and summary.get('wouldBookAgainResponses')==0 and summary.get('wouldBookAgainPercent') is None,'published aggregate incorrect')
    _,rows,_=request('GET',api+'/rest/v1/public_angler_reviews?'+urlencode({'id':'eq.'+rid,'select':'id,guide_id,trip_responses'}),expected=(200,));require(len(rows)==1 and rows[0]['guide_id']=='10000000-0000-0000-0000-000000000001' and rows[0]['trip_responses']==responses,'published review association or structured answers wrong')
    code,_,_=rpc('rmg_submit_revision',{'p_review_id':rid,'p_quality':1,'p_intensity':None,'p_rebook':None,'p_body':'Synthetic unauthorized edit','p_firsthand':True,'p_relationship':'none','p_trip_responses':None},other,expected=(400,401,403,404,409,500));require(code!=200,'other actor revised published review')
    stage='pending revision and publication'
    args={'p_review_id':rid,'p_quality':3,'p_intensity':None,'p_rebook':None,'p_body':'Synthetic revised review','p_firsthand':True,'p_relationship':'none','p_trip_responses':responses}
    _,revision,_=rpc('rmg_submit_revision',args,author);vid=(revision or {}).get('id');require(isinstance(vid,str) and re.fullmatch(r'[0-9a-f-]{36}',vid) and revision.get('status')=='pending','revision receipt')
    _,rows,_=request('GET',api+'/rest/v1/public_angler_reviews?'+urlencode({'id':'eq.'+rid,'select':'id,body,quality'}),expected=(200,));require(len(rows)==1 and rows[0]['body']=='Synthetic original review' and rows[0]['quality']==5,'pending revision changed published review')
    code,_,_=rpc('rmg_own_status',{'p_kind':'revision','p_id':vid},other,expected=(400,401,403,404,500));require(code!=200,'other user read revision status')
    _,decision,_=rpc('rmg_decide_revision',{'p_id':vid,'p_approve':True,'p_reason':'Synthetic revision verified by moderator'},moderator);require((decision or {}).get('id')==vid and decision.get('status')=='approved','revision decision receipt')
    _,rows,_=request('GET',api+'/rest/v1/public_angler_reviews?'+urlencode({'id':'eq.'+rid,'select':'id,body,quality'}),expected=(200,));require(len(rows)==1 and rows[0]['body']=='Synthetic revised review' and rows[0]['quality']==3,'approved revision missing')
    stage='claim and captain boundary'
    claim_args={'p_jurisdiction':'OR','p_source_id':'fixture-two','p_name':'Synthetic captain','p_business':'','p_evidence':'Synthetic public ownership evidence'}
    _,claim,_=rpc('rmg_submit_claim',claim_args,captain);cid=(claim or {}).get('id');require(isinstance(cid,str) and re.fullmatch(r'[0-9a-f-]{36}',cid) and claim.get('status')=='pending','claim receipt')
    detail={'p_jurisdiction':'OR','p_source_id':'fixture-two','p_boat':'Synthetic boat','p_gear':'Synthetic gear','p_years':None,'p_expertise':'Synthetic expertise','p_species':'Synthetic species'}
    code,_,_=rpc('rmg_edit_details',detail,captain,expected=(400,401,403,404,500));require(code!=200,'unapproved claimant edited profile')
    _,decision,_=rpc('rmg_decide_submission',{'p_kind':'claim','p_id':cid,'p_approve':True,'p_reason':'Synthetic ownership evidence verified'},moderator);require(decision=={'id':cid,'status':'approved'},'claim approval receipt')
    _,saved,_=rpc('rmg_edit_details',detail,captain);require((saved or {}).get('status')=='saved','approved owner edit failed')
    require(sql("SELECT CASE WHEN full_name='Synthetic guide two' AND slug='fixture-two' THEN 'ok' ELSE 'bad' END FROM public.guides WHERE id='10000000-0000-0000-0000-000000000002';")=='ok','owner edit altered registry identity')
    other_review={**review_args,'p_source_id':'fixture-two','p_body':'Synthetic independent captain review'}
    _,r2,_=rpc('rmg_submit_review',other_review,author);rid2=(r2 or {}).get('id');require(isinstance(rid2,str) and re.fullmatch(r'[0-9a-f-]{36}',rid2),'second review receipt')
    sql("INSERT INTO public.site_admins(user_id) VALUES ('"+captain_id+"'::uuid);")
    code,_,_=rpc('rmg_decide_submission',{'p_kind':'review','p_id':rid2,'p_approve':False,'p_reason':'Synthetic denial attempt'},captain,expected=(400,401,403,404,409,500));require(code!=200,'captain moderated independent review')
    _,own,_=rpc('rmg_own_status',{'p_kind':'review','p_id':rid2},author);require((own or {}).get('status')=='pending','captain changed independent review')
    stage='claim denial remains unowned'
    denied_args={**claim_args,'p_source_id':'fixture-one','p_name':'Synthetic claimant'}
    _,denied,_=rpc('rmg_submit_claim',denied_args,other);denied_id=(denied or {}).get('id');require(isinstance(denied_id,str) and re.fullmatch(r'[0-9a-f-]{36}',denied_id),'denial claim receipt')
    _,decision,_=rpc('rmg_decide_submission',{'p_kind':'claim','p_id':denied_id,'p_approve':False,'p_reason':'Synthetic claim denial'},moderator);require(decision=={'id':denied_id,'status':'denied'},'claim denial receipt')
    code,_,_=rpc('rmg_edit_details',{**detail,'p_source_id':'fixture-one'},other,expected=(400,401,403,404,500));require(code!=200,'denied claimant edited profile')
    print('PASS isolated local Auth/PostgREST: confirmations and return, default-off gate, actor isolation, reviews and revisions, moderation and claims')

try:main()
except Exception:
    print('FAIL independent local Auth/PostgREST at '+stage+' (details withheld)',file=sys.stderr)
    sys.exit(1)
