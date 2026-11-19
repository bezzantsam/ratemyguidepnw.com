import test from 'node:test';
import assert from 'node:assert/strict';
import {handleLaunch} from '../../lib/backend-launch/handler.mjs';
const env={NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'public-test',RMG_LAUNCH_ENABLED:'true'};
const review={operation:'submit_review',jurisdiction:'OR',sourceId:'or-1',quality:5,intensity:3,wouldBookAgain:true,body:'x'.repeat(80),firsthandAttested:true,relationship:'none'};
function req(body,token){return new Request('https://example.invalid/api/launch',{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)})}
function backend({user={id:'u',email_confirmed_at:'2026-01-01',is_anonymous:false},admin=false,rpcError=null,rpcResult={id:'actual-id',status:'pending'}}={}){
 const calls=[];const client={auth:{getUser:async token=>{calls.push(['getUser',token]);return {data:{user},error:null}}},rpc:async(name,params)=>{calls.push([name,params]);if(name==='is_site_admin')return {data:admin,error:null};return rpcError?{data:null,error:rpcError}:{data:rpcResult,error:null}},from:()=>{throw new Error('unexpected table query')}};
 return {calls,factory:(_url,_key,opts)=>{calls.push(['headers',opts.global.headers]);return client}};
}
test('no session or unconfirmed session cannot submit',async()=>{
 let b=backend(),r=await handleLaunch(req(review),b.factory,env);assert.equal(r.status,401);assert.equal(b.calls.length,0);
 b=backend({user:{id:'u',email_confirmed_at:null}});r=await handleLaunch(req(review,'token'),b.factory,env);assert.equal(r.status,401);assert.equal(b.calls.some(c=>c[0]==='rmg_submit_review_v2'),false);
 b=backend({user:{id:'u',email_confirmed_at:'yes',is_anonymous:true}});r=await handleLaunch(req(review,'token'),b.factory,env);assert.equal(r.status,401);
});
test('Auth outages are not reported as invalid sign-ins',async()=>{
 const factory=status=>()=>({auth:{getUser:async()=>({data:{user:null},error:{status,message:'private provider detail'}})},rpc:()=>{throw Error('must not call')}});
 let r=await handleLaunch(req(review,'token'),factory(503),env);assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'service_unavailable'});
 r=await handleLaunch(req(review,'token'),factory(401),env);assert.equal(r.status,401);assert.deepEqual(await r.json(),{error:'sign_in_required'});
});
test('submission uses verified token and returns actual persisted response',async()=>{
 const b=backend(),r=await handleLaunch(req(review,'token'),b.factory,env);
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{id:'actual-id',status:'pending'});assert.deepEqual(b.calls[0],['headers',{Authorization:'Bearer token'}]);assert.equal(b.calls[1][0],'getUser');assert.equal(b.calls[2][0],'rmg_submit_review_v2');assert.equal(b.calls[2][1].p_firsthand,true);assert.equal(b.calls[2][1].p_relationship,'none');assert.equal(r.headers.get('cache-control'),'no-store');
});
test('forged role/status, oversized bodies, private DB errors fail safely',async()=>{
 const b=backend(),a=await handleLaunch(req({...review,status:'published'},'token'),b.factory,env);assert.equal(a.status,400);assert.equal(b.calls.length,0);
 const big=new Request('https://example.invalid/api/launch',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(17000)});assert.equal((await handleLaunch(big,b.factory,env)).status,400);
 const c=backend({rpcError:{code:'XX000',message:'sensitive database detail'}});const r=await handleLaunch(req(review,'token'),c.factory,env);assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'service_unavailable'});
});
test('moderation uses server-side membership and never invokes action for nonadmin',async()=>{
 const b=backend(),action={operation:'operator_decide',kind:'claim',id:'00000000-0000-0000-0000-000000000001',approve:true,reason:'Manual evidence was reviewed'};
 const r=await handleLaunch(req(action,'token'),b.factory,{...env,RMG_CLAIMS_ENABLED:'true'});assert.equal(r.status,403);assert.equal(b.calls.some(c=>c[0]==='rmg_decide_submission'),false);
});
test('review launch alone does not dispatch claim or owner mutations or the claim queue',async()=>{
 const id='00000000-0000-0000-0000-000000000001';
 const operations=[
  {operation:'submit_claim',jurisdiction:'OR',sourceId:'or-1',claimantName:'Test Name',businessName:'',evidence:'Independently checked ownership'},
  {operation:'edit_details',jurisdiction:'OR',sourceId:'or-1',boat:'',gear:'',yearsExperience:null,expertise:'',species:''},
  {operation:'operator_queue',kind:'claim',offset:0,limit:50},
  {operation:'operator_decide',kind:'claim',id,approve:true,reason:'Independently checked ownership'},
  {operation:'operator_decide',kind:'claim',id,approve:false,reason:'Insufficient evidence'}
 ];
 for(const input of operations){
  const b=backend({admin:true}),r=await handleLaunch(req(input,'token'),b.factory,env);
  assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'launch_unavailable'});assert.deepEqual(b.calls,[]);
 }
 const b=backend(),status=await handleLaunch(req({operation:'own_status',kind:'claim',id},'token'),b.factory,env);
 assert.equal(status.status,200);assert.equal(b.calls.at(-1)[0],'rmg_own_status');
});
test('Washington source writes and availability remain closed even with both flags enabled',async()=>{
 const id='00000000-0000-0000-0000-000000000001',source={jurisdiction:'WA',sourceId:'wa-1'};
 const b=backend({admin:true}),flags={...env,RMG_CLAIMS_ENABLED:'true'};
 const availability=await handleLaunch(req({operation:'review_write_availability',...source}),b.factory,flags);
 assert.deepEqual(await availability.json(),{available:false});
 for(const input of [
  {...review,...source},
  {operation:'report_review',...source,reviewId:id,reason:'other'},
  {operation:'submit_claim',...source,claimantName:'Test Name',businessName:'',evidence:'Independently checked ownership'},
  {operation:'edit_details',...source,boat:'',gear:'',yearsExperience:null,expertise:'',species:''}
 ]){
  const r=await handleLaunch(req(input,'token'),b.factory,flags);
  assert.equal(r.status,403);assert.deepEqual(await r.json(),{error:'forbidden'});
 }
 assert.deepEqual(b.calls,[]);
});
test('unavailable configuration fails closed',async()=>{const b=backend();const r=await handleLaunch(req(review,'token'),b.factory,{RMG_LAUNCH_ENABLED:'true'});assert.equal(r.status,503);assert.equal(b.calls.length,0)});
test('server flag defaults off for public, auth, write and safe-return operations',async()=>{
 for(const input of [{operation:'public_reviews',jurisdiction:'OR',sourceId:'or-1'},{operation:'session'},review,{operation:'safe_return',returnTo:'/admin'}]){
  const b=backend(),r=await handleLaunch(req(input,'token'),b.factory,{});assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'launch_unavailable'});assert.equal(b.calls.length,0);
 }
});
test('a basic review sends missing optional answers as null',async()=>{
 const {intensity,wouldBookAgain,...basic}=review,b=backend(),r=await handleLaunch(req({...basic,body:'Good'},'token'),b.factory,env);
 assert.equal(r.status,200);const call=b.calls.find(x=>x[0]==='rmg_submit_review_v2');assert.equal(call[1].p_intensity,null);assert.equal(call[1].p_rebook,null);assert.equal(call[1].p_trip_month,null);
});
test('authorized moderator receives the persisted database decision',async()=>{
 const id='00000000-0000-0000-0000-000000000001',b=backend({admin:true,rpcResult:{id,status:'approved'}});
 const r=await handleLaunch(req({operation:'operator_decide',kind:'claim',id,approve:true,reason:'Independently checked ownership'},'token'),b.factory,{...env,RMG_CLAIMS_ENABLED:'true'});
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{id,status:'approved'});assert.equal(b.calls.at(-1)[0],'rmg_decide_submission');
});
test('rate limits and ordinary database conflicts have distinct safe errors',async()=>{
 let b=backend({rpcError:{code:'P4290',message:'private internal text'}}),r=await handleLaunch(req(review,'token'),b.factory,env);assert.equal(r.status,429);assert.deepEqual(await r.json(),{error:'rate_limited'});
 b=backend({rpcError:{code:'P0001',message:'private internal text'}});r=await handleLaunch(req(review,'token'),b.factory,env);assert.equal(r.status,409);assert.deepEqual(await r.json(),{error:'conflict'});
 b=backend({rpcError:{code:'23514',message:'private constraint name'}});r=await handleLaunch(req(review,'token'),b.factory,env);assert.equal(r.status,400);assert.deepEqual(await r.json(),{error:'invalid_input'});
});
test('safe return rejects external destinations before configuration access',async()=>{
 let r=await handleLaunch(req({operation:'safe_return',returnTo:'/guides/og-123?intent=review#write-review'}),()=>{throw Error('must not call')},{RMG_LAUNCH_ENABLED:'true'});
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{returnTo:'/guides/og-123?intent=review#write-review'});
 r=await handleLaunch(req({operation:'safe_return',returnTo:'//evil.example/'}),()=>{throw Error('must not call')},{RMG_LAUNCH_ENABLED:'true'});assert.equal(r.status,400);
});
test('public review links bind a published review to the mapped guide',async()=>{
 const calls=[];const row={id:'00000000-0000-0000-0000-000000000001',body:'published'};
 const chain={select(v){calls.push(['select',v]);return this},eq(k,v){calls.push(['eq',k,v]);return this},async maybeSingle(){return {data:row,error:null}}};
 const factory=()=>({rpc:async(name,p)=>{calls.push([name,p]);return {data:'mapped-uuid',error:null}},from:name=>{calls.push(['from',name]);return chain}});
 const r=await handleLaunch(req({operation:'review_detail',jurisdiction:'OR',sourceId:'og-1',id:row.id}),factory,env);
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{review:row});assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='guide_id'&&c[2]==='mapped-uuid'));assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='id'&&c[2]===row.id));assert.ok(!calls.find(c=>c[0]==='select')[1].includes('author_id'));
});
test('captain profile readback uses provenance-filtered RPC',async()=>{
 const calls=[];const factory=()=>({rpc:async(name,p)=>{calls.push([name,p]);return {data:null,error:null}}});
 const r=await handleLaunch(req({operation:'profile_details',jurisdiction:'OR',sourceId:'og-1'}),factory,env);
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{details:null,attribution:'captain_declared'});assert.equal(calls[0][0],'rmg_profile_details');
});

test('sign-in check only verifies confirmed roles and reads queue availability without returning rows',async()=>{
 const flags={...env,RMG_LAUNCH_ENABLED:'false',NEXT_PUBLIC_RMG_AUTH_CHECK_ENABLED:'true',RMG_CLAIMS_ENABLED:'true'};
 const factory=({admin=false,confirmed=true,queueError=null}={})=>{
  const calls=[];
  return {calls,create:()=>({
   auth:{getUser:async()=>({data:{user:{email_confirmed_at:confirmed?'2026-11-19':null}},error:null})},
   rpc:async name=>{calls.push(name);assert.equal(name,'is_site_admin');return {data:admin,error:null}},
   from:table=>{calls.push(table);assert.equal(table,'admin_pending_reviews');return {select:(column,options)=>{
    assert.equal(column,'id');assert.deepEqual(options,{head:true});
    return {limit:async limit=>{assert.equal(limit,1);return {data:[{id:'private'}],error:queueError}}};
   }}}
  })};
 };
 const session={operation:'session'};
 const ordinary=factory();
 let response=await handleLaunch(req(session,'token'),ordinary.create,flags);
 assert.deepEqual(await response.json(),{authenticated:true,operator:false});
 assert.deepEqual(ordinary.calls,['is_site_admin']);
 const moderator=factory({admin:true});
 response=await handleLaunch(req(session,'token'),moderator.create,flags);
 assert.deepEqual(await response.json(),{authenticated:true,operator:true,reviewQueueReady:true});
 assert.deepEqual(moderator.calls,['is_site_admin','admin_pending_reviews']);
 const denied=factory({admin:true,queueError:{code:'42501'}});
 assert.equal((await handleLaunch(req(session,'token'),denied.create,flags)).status,403);
 assert.equal((await handleLaunch(req(session,'token'),factory({confirmed:false}).create,flags)).status,401);
 assert.equal((await handleLaunch(req(session),()=>assert.fail('anonymous client'),flags)).status,401);
 for(const candidate of [
  review,
  {...review,jurisdiction:'WA'},
  {operation:'review_write_availability',jurisdiction:'OR',sourceId:'or-1'},
  {operation:'operator_queue',kind:'review',offset:0,limit:1},
  {operation:'operator_queue',kind:'claim',offset:0,limit:1},
 ])assert.equal((await handleLaunch(req(candidate,'token'),()=>assert.fail('operation reached the database'),flags)).status,503);
});

test('Washington pilot requires an exact server source ID and defers review authority to the database',async()=>{
 const source={jurisdiction:'WA',sourceId:'wa-900001'};
 const flags={...env,RMG_WA_REVIEW_PILOT_SOURCE_ID:source.sourceId,RMG_CLAIMS_ENABLED:'true'};
 const availability={operation:'review_write_availability',...source};
 for(const [input,config] of [[availability,env],[{...availability,sourceId:'wa-900002'},flags]]){
  const b=backend(),r=await handleLaunch(req(input),b.factory,config);
  assert.deepEqual(await r.json(),{available:false});
  assert.deepEqual(b.calls,[]);
 }
 const b=backend({rpcResult:{available:true}});
 const r=await handleLaunch(req(availability),b.factory,flags);
 assert.deepEqual(await r.json(),{available:true});
 assert.deepEqual(b.calls.at(-1),['rmg_review_write_availability',{p_jurisdiction:'WA',p_source_id:source.sourceId}]);
 const closed=backend({rpcError:{code:'P5030'}});
 const pausedWrite=await handleLaunch(req({...review,...source},'token'),closed.factory,flags);
 assert.equal(pausedWrite.status,503);
 assert.equal(closed.calls.at(-1)[0],'rmg_submit_review_v2');
 const held=backend({rpcResult:{available:false}});
 const pausedRead=await handleLaunch(req({operation:'public_reviews',...source}),held.factory,flags);
 assert.equal(pausedRead.status,403);
 assert.equal(held.calls.at(-1)[0],'rmg_review_write_availability');
 const claims=backend();
 const forbidden=await handleLaunch(req({operation:'submit_claim',...source,claimantName:'Test Name',businessName:'',
  evidence:'Independently checked ownership'},'token'),claims.factory,flags);
 assert.equal(forbidden.status,403);
 assert.deepEqual(claims.calls,[]);
 const submit=backend(),accepted=await handleLaunch(req({...review,...source},'token'),submit.factory,flags);
 assert.equal(accepted.status,200);
 assert.equal(submit.calls.at(-1)[1].p_jurisdiction,'WA');
 assert.equal(submit.calls.at(-1)[1].p_source_id,source.sourceId);
});
