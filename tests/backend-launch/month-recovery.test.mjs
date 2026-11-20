import test from 'node:test';
import assert from 'node:assert/strict';
import {validate} from '../../lib/backend-launch/validation.mjs';
import {handleLaunch} from '../../lib/backend-launch/handler.mjs';
const env={NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'public-test',RMG_LAUNCH_ENABLED:'true'};
const id='00000000-0000-0000-0000-000000000001';
const review={operation:'submit_review',jurisdiction:'OR',sourceId:'fixture-1',quality:5,body:'Good',firsthandAttested:true,relationship:'none'};
const revision={operation:'submit_revision',reviewId:id,quality:4,body:'Changed',firsthandAttested:true,relationship:'none'};
function req(x,token='token'){return new Request('https://example.invalid/api/launch',{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(x)})}
function backend(data,error=null){const calls=[];return {calls,factory:()=>({auth:{getUser:async()=>({data:{user:{email_confirmed_at:'yes',is_anonymous:false}},error:null})},rpc:async(name,p)=>{calls.push([name,p]);return {data,error}}})}}
test('trip month is optional and validates only complete calendar months',()=>{
 for(const input of [review,revision]){
  for(const value of [null,'0001-01','2026-11','9999-12'])assert.equal(validate({...input,tripMonth:value}),true);
  for(const value of ['0000-01','2026-00','2026-13','2026-1','2026-11-01',' 2026-11','unknown',0])assert.equal(validate({...input,tripMonth:value}),false);
  assert.equal(validate(input),true);
 }
});
test('submission forwards month and revision distinguishes omit from clear',async()=>{
 let b=backend({id,status:'pending'}),r=await handleLaunch(req({...review,tripMonth:'2026-05'}),b.factory,env);
 assert.equal(r.status,200);assert.equal(b.calls[0][0],'rmg_submit_review_v2');assert.equal(b.calls[0][1].p_trip_month,'2026-05');
 for(const [input,specified,value] of [[revision,false,null],[{...revision,tripMonth:null},true,null],[{...revision,tripMonth:'2025-12'},true,'2025-12']]){
  b=backend({id,status:'pending'});r=await handleLaunch(req(input),b.factory,env);assert.equal(r.status,200);assert.equal(b.calls[0][0],'rmg_submit_revision_v2');assert.equal(b.calls[0][1].p_trip_month_specified,specified);assert.equal(b.calls[0][1].p_trip_month,value);
 }
});
test('guide-specific recovery requires auth and never returns extra fields',async()=>{
 const input={operation:'own_review_for_guide',jurisdiction:'WA',sourceId:'wa-1'};
 let b=backend({id,status:'published',body:'private'}),r=await handleLaunch(req(input,null),b.factory,env);assert.equal(r.status,401);assert.equal(b.calls.length,0);
 r=await handleLaunch(req(input),b.factory,env);assert.deepEqual(await r.json(),{review:{id,status:'published'}});assert.equal(b.calls[0][0],'rmg_own_review_for_guide');
 b=backend(null);r=await handleLaunch(req(input),b.factory,env);assert.deepEqual(await r.json(),{review:null});
 b=backend({id,status:'unrecognized'});r=await handleLaunch(req(input),b.factory,env);assert.equal(r.status,503);
});
test('write readiness is independent of reads and fails closed on unavailable or malformed responses',async()=>{
 const input={operation:'review_write_availability',jurisdiction:'OR',sourceId:'fixture-1'};
 let b=backend({available:true}),r=await handleLaunch(req(input,null),b.factory,env);assert.equal(r.status,200);assert.deepEqual(await r.json(),{available:true});assert.equal(b.calls[0][0],'rmg_review_write_availability');
 b=backend({available:false});r=await handleLaunch(req(input,null),b.factory,env);assert.deepEqual(await r.json(),{available:false});
 b=backend(null,{code:'P5030'});r=await handleLaunch(req(input,null),b.factory,env);assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'launch_unavailable'});
 b=backend(null,{code:'P0002'});r=await handleLaunch(req(input,null),b.factory,env);assert.equal(r.status,404);
 b=backend({available:'yes'});r=await handleLaunch(req(input,null),b.factory,env);assert.equal(r.status,503);
 r=await handleLaunch(req(input,null),b.factory,{});assert.equal(r.status,503);
});
