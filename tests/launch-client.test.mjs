import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function compile(path,imports={}) {
  const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const exports={};vm.runInNewContext(code,{exports,fetch:()=>{throw Error('unexpected network')},require:name=>imports[name]});return exports;
}
const model=compile('components/launch/submission-model.ts');
const {createLaunchClient}=compile('lib/launch-client.ts',{'@/components/launch/submission-model':model});
const id='10000000-0000-4000-8000-000000000001';
const source={jurisdiction:'OR',sourceId:'OG.0002254'};
const draft={quality:4,intensity:3,wouldBookAgain:false,body:'A firsthand account of the trip and guide. '.repeat(3),firsthand:true,relationship:'none',tripMonth:null};
const response=(data,ok=true)=>({ok,json:async()=>data});
const errorCode=code=>error=>error?.code===code;

test('disabled client fails before token access or network requests',async()=>{
  let calls=0;const client=createLaunchClient({getAccessToken:async()=>{calls++;return 'token'},fetcher:async()=>{calls++;return response({})}});
  await assert.rejects(client.session(),errorCode('service_unavailable'));
  assert.equal(calls,0);
});

test('submission sends explicit fields with a bearer token and retains a real pending ID',async()=>{
  let request;
  const client=createLaunchClient({enabled:true,getAccessToken:async()=> 'test-token',fetcher:async(url,init)=>{request={url,init};return response({id,status:'pending'})}});
  const result=await client.submitReview(source,draft);
  assert.equal(result.id,id);assert.equal(result.status,'pending');
  assert.equal(request.url,'/api/launch');assert.equal(request.init.headers.Authorization,'Bearer test-token');
  assert.equal(request.init.cache,'no-store');assert.equal(request.init.redirect,'error');
  const body=JSON.parse(request.init.body);
  assert.equal(body.operation,'submit_review');assert.equal(body.sourceId,source.sourceId);assert.equal(body.jurisdiction,'OR');
  assert.equal(body.firsthandAttested,true);assert.equal(body.wouldBookAgain,false);assert.equal(body.relationship,'none');
  assert.equal('tripMonth' in body,false);assert.equal('userId' in body,false);assert.equal('status' in body,false);
});

test('optional trip details cannot be silently discarded by the draft backend',async()=>{
  let called=false;const client=createLaunchClient({enabled:true,getAccessToken:async()=> 'token',fetcher:async()=>{called=true;return response({})}});
  await assert.rejects(client.submitReview(source,{...draft,tripMonth:'2026-11'}),errorCode('optional_detail_unsupported'));
  assert.equal(called,false);
});

test('malformed success, unknown errors and wrong-owner status fail closed',async()=>{
  const create=data=>createLaunchClient({enabled:true,getAccessToken:async()=> 'token',fetcher:async()=>response(data)});
  await assert.rejects(create({status:'pending'}).submitReview(source,draft),errorCode('service_unavailable'));
  await assert.rejects(create({id:'20000000-0000-4000-8000-000000000002',status:'pending'}).ownStatus('review',id),errorCode('service_unavailable'));
  const client=createLaunchClient({enabled:true,getAccessToken:async()=> 'token',fetcher:async()=>response({error:'raw database error'},false)});
  await assert.rejects(client.session(),errorCode('service_unavailable'));
  const limited=createLaunchClient({enabled:true,getAccessToken:async()=> 'token',fetcher:async()=>response({error:'rate_limited'},false)});
  await assert.rejects(limited.session(),errorCode('rate_limited'));
});

test('own status preserves only states valid for that submission type',async()=>{
  for(const [kind,status] of [['review','removed'],['review','published'],['claim','denied'],['claim','approved']]) {
    const client=createLaunchClient({enabled:true,getAccessToken:async()=> 'token',fetcher:async()=>response({id,status})});
    const result=await client.ownStatus(kind,id);assert.equal(result.status,status);
  }
  const wrong=createLaunchClient({enabled:true,getAccessToken:async()=> 'token',fetcher:async()=>response({id,status:'approved'})});
  await assert.rejects(wrong.ownStatus('review',id),errorCode('service_unavailable'));
});

test('public results distinguish a valid empty set from an error and never attach auth',async()=>{
  let authRequested=false,headers;
  const client=createLaunchClient({enabled:true,getAccessToken:async()=>{authRequested=true;return 'token'},fetcher:async(_url,init)=>{headers=init.headers;return response({summary:{count:0,averageQuality:null},reviews:[]})}});
  const result=await client.publicReviews(source);
  assert.equal(result.count,0);assert.equal(result.averageQuality,null);assert.equal(result.reviews.length,0);
  assert.equal(authRequested,false);assert.equal(headers.Authorization,undefined);
  const missing=createLaunchClient({enabled:true,getAccessToken:async()=>null,fetcher:async()=>response({error:'not_found'},false)});
  await assert.rejects(missing.publicReviews(source),errorCode('not_found'));
  const invalid=createLaunchClient({enabled:true,getAccessToken:async()=>null,fetcher:async()=>response({summary:{count:1,averageQuality:5},reviews:[{id,quality:5,body:'a review',published_at:null}]})});
  await assert.rejects(invalid.publicReviews(source),errorCode('service_unavailable'));
});

test('public results retain the full aggregate and only accept a published dated record',async()=>{
  const review={id,quality:5,body:'A published account of a trip.',published_at:'2026-11-17T00:00:00Z'};
  const create=value=>createLaunchClient({enabled:true,getAccessToken:async()=>null,fetcher:async()=>response(value)});
  const good=await create({summary:{count:5,averageQuality:4.2},reviews:[review]}).publicReviews(source);
  assert.equal(good.count,5);assert.equal(good.averageQuality,4.2);assert.equal(good.reviews[0].id,id);
  for(const bad of [{...review,status:'pending'},{...review,published_at:'not-a-date'}]) {
    await assert.rejects(create({summary:{count:1,averageQuality:5},reviews:[bad]}).publicReviews(source),errorCode('service_unavailable'));
  }
});
