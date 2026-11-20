import test from 'node:test';
import assert from 'node:assert/strict';
import {validate} from '../../lib/backend-launch/validation.mjs';
import {handleLaunch} from '../../lib/backend-launch/handler.mjs';

const id='00000000-0000-0000-0000-000000000001';
const env={NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'public-test',RMG_LAUNCH_ENABLED:'true'};
const report={operation:'report_review',jurisdiction:'OR',sourceId:'fixture-one',reviewId:id,reason:'not_firsthand'};
function request(value,token='token'){return new Request('https://example.invalid/api/launch',{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(value)})}
function client({admin=false,error=null,data={id,status:'submitted',existing:false}}={}){const calls=[];return {calls,factory:()=>({auth:{getUser:async()=>({data:{user:{email_confirmed_at:'yes',is_anonymous:false}},error:null})},rpc:async(name,params)=>{calls.push([name,params]);return name==='is_site_admin'?{data:admin,error:null}:{data:error?null:data,error}}})}}

test('report validation accepts only the exact target and supported categories',()=>{
 for(const reason of ['not_firsthand','harassment_or_private_info','other'])assert.equal(validate({...report,reason}),true);
 for(const change of [{reason:'spam'},{reason:''},{reviewId:'x'},{jurisdiction:'CA'},{reporterId:id},{comment:'private text'},{status:'resolved'}])assert.equal(validate({...report,...change}),false);
 assert.equal(validate({operation:'operator_queue',kind:'report',offset:0,limit:100}),true);
 assert.equal(validate({operation:'resolve_report',id}),true);
 assert.equal(validate({operation:'resolve_report',id,actor:id}),false);
});
test('report requires a session and only acknowledges the persisted RPC receipt',async()=>{
 let c=client(),r=await handleLaunch(request(report,null),c.factory,env);assert.equal(r.status,401);assert.equal(c.calls.length,0);
 c=client();r=await handleLaunch(request(report),c.factory,env);assert.equal(r.status,200);assert.deepEqual(await r.json(),{id,status:'submitted',existing:false});assert.deepEqual(c.calls[0],['rmg_report_review',{p_jurisdiction:'OR',p_source_id:'fixture-one',p_review_id:id,p_reason:'not_firsthand'}]);
 c=client({error:{code:'P0002',message:'private details'}});r=await handleLaunch(request(report),c.factory,env);assert.equal(r.status,404);assert.deepEqual(await r.json(),{error:'not_found'});
 c=client({error:{code:'XX000',message:'private details'}});r=await handleLaunch(request(report),c.factory,env);assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'service_unavailable'});
 for(const data of [null,{}, {id,status:'submitted'}, {id,status:'pending',existing:false}]){c=client({data});r=await handleLaunch(request(report),c.factory,env);assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'service_unavailable'});}
});
test('report queue and resolution require moderator authorization and preserve RPC response',async()=>{
 const queue={operation:'operator_queue',kind:'report',offset:0,limit:5};let c=client(),r=await handleLaunch(request(queue),c.factory,env);assert.equal(r.status,403);assert.equal(c.calls.length,1);
 c=client({admin:true,data:[{id,reason:'other'}]});r=await handleLaunch(request(queue),c.factory,env);assert.equal(r.status,200);assert.deepEqual(await r.json(),{items:[{id,reason:'other'}],offset:0,limit:5});assert.equal(c.calls.at(-1)[0],'rmg_report_queue');
 c=client({admin:true,data:{id,status:'resolved'}});r=await handleLaunch(request({operation:'resolve_report',id}),c.factory,env);assert.equal(r.status,200);assert.deepEqual(await r.json(),{id,status:'resolved'});assert.equal(c.calls.at(-1)[0],'rmg_resolve_report');
 c=client();r=await handleLaunch(request({operation:'resolve_report',id}),c.factory,env);assert.equal(r.status,403);assert.equal(c.calls.length,1);
});
test('only confirmed duplicate-review code gets a duplicate message',async()=>{
 const review={operation:'submit_review',jurisdiction:'OR',sourceId:'fixture-one',quality:5,body:'Good',firsthandAttested:true,relationship:'none'};
 for(const [code,expected] of [['P4091','duplicate_review'],['23505','conflict'],['P0001','conflict']]){const c=client({error:{code}}),r=await handleLaunch(request(review),c.factory,env);assert.equal(r.status,409);assert.deepEqual(await r.json(),{error:expected});}
});

test('flag decisions accept only keep or remove with bounded private notes',()=>{
 const decision={operation:'resolve_report',id,action:'keep',reason:''};
 assert.equal(validate(decision),true);
 assert.equal(validate({...decision,action:'remove',reason:'Not firsthand'}),true);
 assert.equal(validate({...decision,reason:'x'.repeat(500)}),true);
 for(const change of [{action:'approve'},{action:null},{action:'remove'},{action:'remove',reason:'   '},{reason:'x'.repeat(501)},{reason:null},{reviewId:id},{actor:id},{status:'removed'}]){
  assert.equal(validate({...decision,...change}),false,JSON.stringify(change));
 }
 assert.equal(validate({operation:'resolve_report',id,reason:'unbound note'}),false);
 assert.equal(validate({operation:'resolve_report',id,action:'keep'}),false);
});

test('explicit flag decisions require admin authorization and use the reported review target',async()=>{
 const reviewId='00000000-0000-0000-0000-000000000002';
 const decision={operation:'resolve_report',id,action:'remove',reason:'  Not firsthand  '};
 let c=client(),r=await handleLaunch(request(decision,null),c.factory,env);
 assert.equal(r.status,401);assert.deepEqual(c.calls,[]);
 c=client();r=await handleLaunch(request(decision),c.factory,env);
 assert.equal(r.status,403);assert.deepEqual(c.calls,[['is_site_admin',undefined]]);
 const receipt={id,status:'resolved',review_id:reviewId,review_status:'removed'};
 c=client({admin:true,data:receipt});r=await handleLaunch(request(decision),c.factory,env);
 assert.equal(r.status,200);assert.deepEqual(await r.json(),receipt);
 assert.deepEqual(c.calls.at(-1),['rmg_resolve_report_v2',{p_id:id,p_action:'remove',p_reason:'Not firsthand'}]);
 c=client({admin:true,data:{...receipt,review_status:'published'}});
 r=await handleLaunch(request({...decision,action:'keep',reason:''}),c.factory,env);
 assert.equal(r.status,200);
 assert.deepEqual(c.calls.at(-1),['rmg_resolve_report_v2',{p_id:id,p_action:'keep',p_reason:''}]);
 c=client({admin:true,data:receipt});r=await handleLaunch(request({...decision,action:'keep',reason:''}),c.factory,env);
 assert.equal(r.status,200);assert.equal((await r.json()).review_status,'removed','dismissing a later flag does not republish a removed review');
});

test('flag decisions fail closed when the persisted receipt is incomplete or inconsistent',async()=>{
 const reviewId='00000000-0000-0000-0000-000000000002';
 const decision={operation:'resolve_report',id,action:'remove',reason:'Not firsthand'};
 const receipt={id,status:'resolved',review_id:reviewId,review_status:'removed'};
 for(const data of [null,{}, {id,status:'resolved'}, {...receipt,id:reviewId}, {...receipt,status:'pending'}, {...receipt,review_id:'not-a-uuid'}, {...receipt,review_status:'published'}, {...receipt,review_status:'approved'}]){
  const c=client({admin:true,data}),r=await handleLaunch(request(decision),c.factory,env);
  assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'service_unavailable'});
 }
 for(const [code,status,error] of [['42501',403,'forbidden'],['P0002',404,'not_found'],['P0001',409,'conflict'],['P5030',503,'launch_unavailable']]){
  const c=client({admin:true,error:{code,message:'private details'}}),r=await handleLaunch(request(decision),c.factory,env);
  assert.equal(r.status,status);assert.deepEqual(await r.json(),{error});
 }
});
