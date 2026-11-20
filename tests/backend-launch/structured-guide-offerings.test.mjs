import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {fishingOptions} from '../../lib/captain-fishing/catalog.mjs';
import {handleGuideOfferings} from '../../lib/guide-offerings/handler.mjs';

const env={RMG_GUIDE_OFFERINGS_ENABLED:'true',NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic'};
const source={jurisdiction:'OR',sourceId:'OG.0001225.F&F'};
const input={operation:'owner_get',...source};
function req(value,token){
 return new Request('http://127.0.0.1/api/guide-offerings',{method:'POST',headers:{
  'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{}),
 },body:JSON.stringify(value)});
}
function mock({user={email_confirmed_at:'2026-11-19',is_anonymous:false},error,data={draft:{revision:1,vessels:[],offerings:[]},proposal:null,publishedVersion:null}}={}){
 const calls=[];
 return {calls,factory:(_url,_key,options)=>{
  calls.push(options.global.headers);
  return {auth:{getUser:async token=>{calls.push(token);return {data:{user}}}},rpc:async(...params)=>{calls.push(params);return {data,error}}};
 }};
}

test('offering defaults are closed and public WA stays empty without a backend call',async()=>{
 const m=mock();
 for(const [request,flags,output,status] of [
  [input,{}, {error:'launch_unavailable'},503],
  [{operation:'public_profile',...source},{},{profile:null},200],
  [{operation:'public_batch',afterSourceId:null,limit:1},{},{items:[],nextCursor:null},200],
  [{operation:'public_profile',jurisdiction:'WA',sourceId:'wa-001'},env,{profile:null},200],
 ]){
  const res=await handleGuideOfferings(req(request),m.factory,flags);
  assert.equal(res.status,status);
  assert.deepEqual(await res.json(),output);
  assert.equal(res.headers.get('cache-control'),'no-store');
 }
 assert.deepEqual(m.calls,[]);
});

test('authenticated requests forward exact suffix and reject owner spoofing, absent identity and stale save',async()=>{
 const m=mock();
 const save={operation:'owner_save',...source,expectedRevision:0,draft:{vessels:[],offerings:[]}};
 assert.equal((await handleGuideOfferings(req(save),m.factory,env)).status,401);
 assert.equal((await handleGuideOfferings(req({...save,ownerId:'synthetic'},'token'),m.factory,env)).status,400);
 assert.equal((await handleGuideOfferings(req({...save,jurisdiction:'WA',sourceId:'wa-001'},'token'),m.factory,env)).status,400);
 const noProof=mock({user:{email_confirmed_at:null}});
 assert.equal((await handleGuideOfferings(req(save,'token'),noProof.factory,env)).status,401);
 assert.equal(noProof.calls.length,2);
 const res=await handleGuideOfferings(req(save,'token'),m.factory,env);
 assert.equal(res.status,200);
 assert.deepEqual(m.calls.at(-1),['rmg_guide_offerings_authorized_v1',{p_operation:'owner_save',
  p_input:{...source,expectedRevision:0,draft:save.draft}}]);
 const stale=mock({error:{code:'P0001',message:'never leaked'}});
 assert.deepEqual(await (await handleGuideOfferings(req(save,'token'),stale.factory,env)).json(),{error:'conflict'});
});

test('anonymous batch sends one bounded RPC and an exact suffix cursor with no caller token',async()=>{
 const m=mock({data:{items:[],nextCursor:null}});
 const response=await handleGuideOfferings(req({operation:'public_batch',afterSourceId:source.sourceId,limit:100},'ignore'),m.factory,env);
 assert.equal(response.status,200);
 assert.deepEqual(m.calls,[{},['rmg_guide_offerings_public_v1',{p_operation:'public_batch',p_input:{afterSourceId:source.sourceId,limit:100}}]]);
 const bad=await handleGuideOfferings(req({operation:'public_batch',afterSourceId:null,limit:101}),m.factory,env);
 assert.equal(bad.status,400);
});

test('SQL validates exactly the method, gear and grouped target choices exposed to consumers',()=>{
 const sql=readFileSync('supabase/review-candidates/structured-guide-offerings-v1.sql','utf8');
 const choices=key=>sql.match(new RegExp("offering_choices_v1\\(trip->'"+key+"',ARRAY\\[([^\\]]+)\\]"))[1].split(',').map(value=>value.slice(1,-1));
 assert.deepEqual(choices('methodIds'),fishingOptions.filter(option=>option.kind==='method').map(option=>option.id));
 assert.deepEqual(choices('gearIds'),fishingOptions.filter(option=>option.kind==='gear').map(option=>option.id));
 assert.deepEqual(choices('species'),JSON.parse(readFileSync('lib/guide-offerings/species.json','utf8')));
});
