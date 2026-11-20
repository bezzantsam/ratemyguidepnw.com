import test from 'node:test';
import assert from 'node:assert/strict';
import {handleLaunch} from '../../lib/backend-launch/handler.mjs';
const env={NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'public-test',RMG_LAUNCH_ENABLED:'true'};
const review={operation:'submit_review',jurisdiction:'OR',sourceId:'or-1',quality:5,intensity:3,wouldBookAgain:true,body:'x'.repeat(80),firsthandAttested:true,relationship:'none'};
function req(body,token){return new Request('https://example.invalid/api/launch',{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)})}
function backend({user={id:'u',email_confirmed_at:'2026-01-01',is_anonymous:false},admin=false,adminResult={data:admin,error:null},rpcError=null,rpcResult={id:'actual-id',status:'pending'}}={}){
 const calls=[];const client={auth:{getUser:async token=>{calls.push(['getUser',token]);return {data:{user},error:null}}},rpc:async(name,params)=>{calls.push([name,params]);if(name==='is_site_admin')return adminResult;return rpcError?{data:null,error:rpcError}:{data:rpcResult,error:null}},from:()=>{throw new Error('unexpected table query')}};
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
 const id='00000000-0000-0000-0000-000000000001',source={jurisdiction:'WA',sourceId:'wa-001'};
 const b=backend({admin:true}),flags={...env,RMG_CLAIMS_ENABLED:'true'};
 const availability=await handleLaunch(req({operation:'review_write_availability',...source}),b.factory,flags);
 assert.deepEqual(await availability.json(),{available:false});
 for(const input of [
  {...review,...source},
  {operation:'report_review',...source,reviewId:id,reason:'other'},
  {operation:'submit_claim',...source,claimantName:'Test Name',businessName:'',evidence:'Independently checked ownership'},
  {operation:'claim_status',...source}
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
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{id,status:'approved'});assert.equal(b.calls.at(-1)[0],'rmg_decide_claim_v1');
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

test('launch-on session returns the verified ordinary or moderator role without a queue probe',async()=>{
 for(const admin of [false,true]){
  const b=backend({admin});
  const response=await handleLaunch(req({operation:'session'},'token'),b.factory,env);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{authenticated:true,operator:admin});
  assert.deepEqual(b.calls.map(([operation])=>operation),['headers','getUser','is_site_admin']);
 }
});

test('launch-on session returns a retryable error when the role RPC fails',async()=>{
 const b=backend({adminResult:{data:false,error:{code:'42501',message:'private database detail'}}});
 const response=await handleLaunch(req({operation:'session'},'token'),b.factory,env);
 assert.equal(response.status,503);
 assert.deepEqual(await response.json(),{error:'service_unavailable'});
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.deepEqual(b.calls.map(([operation])=>operation),['headers','getUser','is_site_admin']);
});

test('launch-on session returns a retryable error for malformed role responses',async()=>{
 for(const adminResult of [{data:null,error:null},{data:'false',error:null},{data:[true],error:null},null]){
  const b=backend({adminResult});
  const response=await handleLaunch(req({operation:'session'},'token'),b.factory,env);
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{error:'service_unavailable'});
  assert.deepEqual(b.calls.map(([operation])=>operation),['headers','getUser','is_site_admin']);
 }
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
  {...review,jurisdiction:'WA',sourceId:'wa-001'},
  {operation:'review_write_availability',jurisdiction:'OR',sourceId:'or-1'},
  {operation:'operator_queue',kind:'review',offset:0,limit:1},
  {operation:'operator_queue',kind:'claim',offset:0,limit:1},
 ])assert.equal((await handleLaunch(req(candidate,'token'),()=>assert.fail('operation reached the database'),flags)).status,503);
});


test('claim workflow uses narrow RPCs and runs without the review launch flag',async()=>{
 const source={jurisdiction:'OR',sourceId:'OG.0001225.F&F'};
 const {RMG_LAUNCH_ENABLED,...rest}=env;
 const flags={...rest,RMG_CLAIMS_ENABLED:'true'};
 const b=backend({rpcResult:{available:true}});
 assert.deepEqual(await (await handleLaunch(req({operation:'claim_availability',...source}),b.factory,flags)).json(),{available:true});
 assert.deepEqual(b.calls.at(-1),['rmg_claim_availability_v1',{p_jurisdiction:'OR',p_source_id:source.sourceId}]);
 assert.equal((await handleLaunch(req({operation:'claim_status',...source}),b.factory,flags)).status,401);
 assert.equal((await handleLaunch(req({operation:'edit_details',...source,boat:'',gear:'',yearsExperience:null,expertise:'',species:''},'token'),b.factory,flags)).status,503);
 assert.equal((await handleLaunch(req({operation:'claim_availability',...source}),b.factory,env)).status,503);
 const queue=backend({admin:true,rpcResult:[]});
 assert.equal((await handleLaunch(req({operation:'operator_queue',kind:'claim',offset:0,limit:10},'token'),queue.factory,flags)).status,200);
 assert.equal(queue.calls.at(-1)[0],'rmg_claim_queue_v1');
});

const ratingsGuides=[
 {jurisdiction:'OR',sourceId:'OG.0001225.F&F'},
 {jurisdiction:'WA',sourceId:'wa-001'},
 {jurisdiction:'OR',sourceId:'OG.0000484.BRO'},
 {jurisdiction:'OR',sourceId:'OG.0001225.F&F'},
];
const ratingsBatch={operation:'public_review_summaries',guides:ratingsGuides};

test('public ratings use exactly one anonymous batch RPC and allow only public response fields',async()=>{
 const items=[
  {jurisdiction:'OR',sourceId:'OG.0001225.F&F',count:2,averageQuality:4.5},
  {jurisdiction:'OR',sourceId:'OG.0000484.BRO',count:0,averageQuality:null},
 ];
 const b=backend({rpcResult:{items:[{...items[0],private:'must not leave route'},items[1]]}});
 const response=await handleLaunch(req(ratingsBatch,'signed-in-token'),b.factory,env);
 assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.deepEqual(await response.json(),{items});
 assert.deepEqual(b.calls,[['headers',{}],['rmg_public_review_summaries_v1',{p_guides:[ratingsGuides[0],ratingsGuides[2]]}]]);
});

test('rating batches enforce their bounds and fail closed for mismatched identities and gates',async()=>{
 for(const guides of [
  Array(31).fill(ratingsGuides[0]), undefined, [null],
  [{jurisdiction:['OR'],sourceId:'OG.0001225.F&F'}],
  [{jurisdiction:'OR',sourceId:'OG.0001225.F&F\n'}],
  [{...ratingsGuides[0],guideId:'private'}],
 ]){
  const b=backend();
  assert.equal((await handleLaunch(req({...ratingsBatch,guides}),b.factory,env)).status,400);
  assert.deepEqual(b.calls,[]);
 }
 let b=backend();
 assert.equal((await handleLaunch(req(ratingsBatch),b.factory,{RMG_CLAIMS_ENABLED:'true'})).status,503);
 assert.deepEqual(b.calls,[]);
 b=backend({rpcError:{code:'P5030'}});
 assert.deepEqual(await (await handleLaunch(req(ratingsBatch),b.factory,env)).json(),{error:'launch_unavailable'});
 b=backend({rpcResult:{items:[{...ratingsGuides[1],count:1,averageQuality:5}]}});
 assert.deepEqual(await (await handleLaunch(req(ratingsBatch),b.factory,env)).json(),{error:'service_unavailable'});
 b=backend({rpcResult:{items:[]}});
 assert.deepEqual(await (await handleLaunch(req({...ratingsBatch,guides:[]}),b.factory,env)).json(),{items:[]});
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

test('existing WA review requests use the current server listing version and keep neighbors closed',async()=>{
 const source={jurisdiction:'WA',sourceId:'wa-001'};
 const config={...env,RMG_WA_LISTED_REVIEW_PILOT_SOURCE_ID:source.sourceId,RMG_CLAIMS_ENABLED:'true'};
 const digest='b'.repeat(64);
 const version=id=>id===source.sourceId?digest:undefined;
 const readiness={operation:'review_write_availability',...source};
 for(const [input,flags,sourceVersion] of [
  [{...readiness,sourceId:'wa-002'},config,version],
  [readiness,config,()=>undefined],
  [readiness,{...config,RMG_WA_REVIEW_PILOT_SOURCE_ID:'wa-900001'},version],
 ]){
  const b=backend(),r=await handleLaunch(req(input),b.factory,flags,sourceVersion);
  assert.deepEqual(await r.json(),{available:false});
  assert.deepEqual(b.calls,[]);
 }
 const forged=backend();
 assert.equal((await handleLaunch(req({...readiness,sourceId:source.sourceId+'@'+digest}),forged.factory,config,version)).status,400);
 assert.deepEqual(forged.calls,[]);
 const live=backend({rpcResult:{available:true}});
 const ready=await handleLaunch(req(readiness),live.factory,config,version);
 assert.deepEqual(await ready.json(),{available:true});
 assert.deepEqual(live.calls.at(-1),['rmg_review_write_availability',{p_jurisdiction:'WA',p_source_id:'wa-001@'+digest}]);
 const ordinary=backend();
 const posted=await handleLaunch(req({...review,...source},'token'),ordinary.factory,config,version);
 assert.equal(posted.status,200);
 assert.equal(ordinary.calls.at(-1)[1].p_source_id,'wa-001@'+digest);
 const paused=backend({rpcResult:{available:false}});
 assert.equal((await handleLaunch(req({operation:'public_reviews',...source}),paused.factory,config,version)).status,403);
 assert.equal(paused.calls.at(-1)[0],'rmg_review_write_availability');
 const neighbor=backend();
 assert.equal((await handleLaunch(req({operation:'own_review_for_guide',jurisdiction:'WA',sourceId:'wa-002'},'token'),neighbor.factory,config,version)).status,403);
 assert.deepEqual(neighbor.calls,[]);
 const claims=backend();
 assert.equal((await handleLaunch(req({operation:'submit_claim',...source,claimantName:'Fixture',
  businessName:'',evidence:'Synthetic ownership evidence'},'token'),claims.factory,config,version)).status,403);
 assert.deepEqual(claims.calls,[]);
});

test('public ratings bind only the exact configured Washington source and make one anonymous RPC',async()=>{
 const wa={jurisdiction:'WA',sourceId:'wa-001'};
 const neighbor={jurisdiction:'WA',sourceId:'wa-002'};
 const or={jurisdiction:'OR',sourceId:'OG.0001225.F&F'};
 const sourceVersion='b'.repeat(64);
 const flags={...env,RMG_WA_LISTED_REVIEW_PILOT_SOURCE_ID:wa.sourceId};
 const guides=[wa,or,neighbor,wa];
 const items=[{...wa,count:0,averageQuality:null},{...or,count:2,averageQuality:4.5}];
 const b=backend({rpcResult:{items}});
 const lookedUp=[];
 const response=await handleLaunch(req({operation:'public_review_summaries',guides},'ignored'),b.factory,flags,id=>{
  lookedUp.push(id);return sourceVersion;
 });
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{items});
 assert.deepEqual(lookedUp,['wa-001']);
 const versioned={...wa,sourceId:'wa-001@'+sourceVersion};
 assert.deepEqual(b.calls,[['headers',{}],['rmg_public_review_summaries_v1',{p_guides:[versioned,or]}]]);
 assert.equal(response.headers.get('cache-control'),'no-store');
 const spoof=backend();
 assert.equal((await handleLaunch(req({operation:'public_review_summaries',guides:[versioned]}),
  spoof.factory,flags,()=>sourceVersion)).status,400);
 assert.deepEqual(spoof.calls,[]);
});

test('public ratings omit WA when closed or version lookup fails and refuse unexpected WA output',async()=>{
 const wa={jurisdiction:'WA',sourceId:'wa-001'};
 const guides=[wa];
 const input={operation:'public_review_summaries',guides};
 const flags={...env,RMG_WA_LISTED_REVIEW_PILOT_SOURCE_ID:wa.sourceId};
 for(const [config,version] of [
  [env,()=>{throw Error('default closed')}],
  [{...flags,RMG_WA_REVIEW_PILOT_SOURCE_ID:'wa-900001'},()=>{throw Error('conflicting pilot')}],
  [flags,()=>undefined],
  [flags,()=> 'invalid'],
 ]){
  const b=backend({rpcResult:{items:[]}});
  const response=await handleLaunch(req(input),b.factory,config,version);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{items:[]});
  assert.deepEqual(b.calls,[['headers',{}],['rmg_public_review_summaries_v1',{p_guides:[]}]]);
 }
 const b=backend({rpcResult:{items:[{jurisdiction:'WA',sourceId:'wa-002',count:1,averageQuality:4}]}});
 assert.equal((await handleLaunch(req(input),b.factory,flags,()=> 'b'.repeat(64))).status,503);
});

const catalogFlags={...env,RMG_WA_CATALOG_REVIEWS_ENABLED:'true',RMG_CLAIMS_ENABLED:'true'};
const catalogA={jurisdiction:'WA',sourceId:'wa-001'};
const catalogB={jurisdiction:'WA',sourceId:'wa-002'};
const catalogHeld={jurisdiction:'WA',sourceId:'wa-003'};
const catalogVersions=new Map([
 [catalogA.sourceId,'a'.repeat(64)],[catalogB.sourceId,'b'.repeat(64)],[catalogHeld.sourceId,'c'.repeat(64)],
]);
const versionFor=(id,kind)=>kind==='catalog'?catalogVersions.get(id):undefined;
const catalogRef=id=>id+'@catalog:'+catalogVersions.get(id);

test('WA catalog admits separate versioned review targets without requiring claims or credentials',async()=>{
 for(const source of [catalogA,catalogB]){
  const read=backend({rpcResult:{available:true}});
  const ready=await handleLaunch(req({operation:'review_write_availability',...source}),read.factory,catalogFlags,versionFor);
  assert.deepEqual(await ready.json(),{available:true});
  assert.deepEqual(read.calls,[['headers',{}],['rmg_review_write_availability',{p_jurisdiction:'WA',p_source_id:catalogRef(source.sourceId)}]]);
  const pending={id:'10000000-0000-4000-8000-000000000010',status:'pending'};
  const write=backend({rpcResult:pending});
  const submitted=await handleLaunch(req({...review,...source},'ordinary-token'),write.factory,catalogFlags,versionFor);
  assert.equal(submitted.status,200);
  assert.deepEqual(await submitted.json(),pending);
  assert.equal(write.calls.at(-1)[0],'rmg_submit_review_v2');
  assert.equal(write.calls.at(-1)[1].p_source_id,catalogRef(source.sourceId));
  assert.deepEqual(write.calls.map(([name])=>name),['headers','getUser','rmg_submit_review_v2']);
 }
 for(const operation of ['claim_availability','claim_status','profile_details']){
  const forbidden=backend();
  const r=await handleLaunch(req({operation,...catalogA},'valid-token'),forbidden.factory,catalogFlags,versionFor);
  assert.deepEqual(await r.json(),operation==='claim_availability'?{available:false}:{error:'forbidden'});
  assert.deepEqual(forbidden.calls,[]);
 }
});

test('catalog misses, pauses, invalid browser versions and old-pilot collisions never use a legacy resolver',async()=>{
 const absent={jurisdiction:'WA',sourceId:'wa-999'};
 const availability=source=>({operation:'review_write_availability',...source});
 for(const [source,flags] of [[absent,catalogFlags],[catalogA,env]]){
  const b=backend(),r=await handleLaunch(req(availability(source)),b.factory,flags,versionFor);
  assert.deepEqual(await r.json(),{available:false});
  assert.deepEqual(b.calls,[]);
 }
 const forged=backend();
 assert.equal((await handleLaunch(req(availability({...catalogA,sourceId:catalogRef(catalogA.sourceId)})),
  forged.factory,catalogFlags,versionFor)).status,400);
 assert.deepEqual(forged.calls,[]);
 const conflict=backend(),flags={...catalogFlags,RMG_WA_LISTED_REVIEW_PILOT_SOURCE_ID:catalogA.sourceId};
 const conflicted=await handleLaunch(req(availability(catalogA)),conflict.factory,flags,versionFor);
 assert.deepEqual(await conflicted.json(),{available:false});
 assert.deepEqual(conflict.calls,[]);
 for(const operation of ['public_reviews','review_detail','own_review_for_guide']){
  const b=backend({rpcResult:{available:false}});
  const extra=operation==='review_detail'?{id:'10000000-0000-4000-8000-000000000010'}:{};
  const r=await handleLaunch(req({operation,...catalogHeld,...extra},'ordinary-token'),b.factory,catalogFlags,versionFor);
  assert.equal(r.status,403);
  assert.deepEqual(b.calls.slice(2),[['rmg_review_write_availability',{p_jurisdiction:'WA',p_source_id:catalogRef(catalogHeld.sourceId)}]]);
 }
 const pausedWrite=backend({rpcError:{code:'P5030'}});
 const paused=await handleLaunch(req({...review,...catalogA},'ordinary-token'),pausedWrite.factory,catalogFlags,versionFor);
 assert.equal(paused.status,503);
 assert.deepEqual(await paused.json(),{error:'launch_unavailable'});
});

test('catalog profile lookup and mixed summary use exact version keys with bare public IDs',async()=>{
 const guideId='10000000-0000-4000-8000-000000000021';
 const published={id:'10000000-0000-4000-8000-000000000010',quality:4,body:'Public fixture'};
 const summary={count:1,averageQuality:4};
 const calls=[];
 const factory=()=>({
  rpc:async(name,args)=>{
   calls.push([name,args.p_source_id]);
   if(name==='rmg_review_write_availability')return {data:{available:true}};
   if(name==='rmg_resolve_review_target_v1')return {data:guideId};
   if(name==='rmg_review_summary')return {data:summary};
   assert.fail('Unexpected resolver '+name);
  },
  from:table=>{
   assert.equal(table,'public_angler_reviews');
   const query={
    select:()=>query,eq:(key,value)=>{
     assert.equal(value,key==='guide_id'?guideId:published.id);
     return query;
    },order:()=>query,limit:async()=>({data:[published]}),maybeSingle:async()=>({data:published}),
   };
   return query;
  },
 });
 const profile=await handleLaunch(req({operation:'public_reviews',...catalogB}),factory,catalogFlags,versionFor);
 assert.deepEqual(await profile.json(),{summary,reviews:[published],limit:100});
 assert.deepEqual(calls,[
  ['rmg_review_write_availability',catalogRef(catalogB.sourceId)],
  ['rmg_resolve_review_target_v1',catalogRef(catalogB.sourceId)],
  ['rmg_review_summary',catalogRef(catalogB.sourceId)],
 ]);
 const detail=await handleLaunch(req({operation:'review_detail',...catalogB,id:published.id}),factory,catalogFlags,versionFor);
 assert.deepEqual(await detail.json(),{review:published});
 const or={jurisdiction:'OR',sourceId:'OG.0001225.F&F'};
 const unknown={jurisdiction:'WA',sourceId:'wa-999'};
 const items=[{...catalogA,count:0,averageQuality:null},{...catalogB,...summary},{...or,count:2,averageQuality:4.5}];
 const batch=backend({rpcResult:{items}});
 const input={operation:'public_review_summaries',guides:[catalogA,catalogB,catalogHeld,or,unknown,catalogA]};
 const response=await handleLaunch(req(input,'must-be-ignored'),batch.factory,catalogFlags,versionFor);
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{items});
 assert.deepEqual(batch.calls,[['headers',{}],['rmg_public_review_summaries_v1',{p_guides:[
  ...[catalogA,catalogB,catalogHeld].map(guide=>({...guide,sourceId:catalogRef(guide.sourceId)})),or,
 ]}]]);
});

test('operator queues resolve the catalog label and forward ownership without author identities',async()=>{
 const rows=[
  {id:'row-a',guide_name:'Internal catalog carrier',catalog_source_id:'wa-001',catalog_listing_sha256:'a'.repeat(64),
    is_own_submission:true,author_id:'private-author',review_author_id:'private-review-author',author_email:'private@example.invalid'},
  {id:'row-b',guide_name:'Internal catalog carrier',catalog_source_id:'wa-002',catalog_listing_sha256:'b'.repeat(64)},
  {id:'row-c',guide_name:'Stale carrier',catalog_source_id:'wa-002',catalog_listing_sha256:'a'.repeat(64),
    guide_profile_path:'https://invalid.example'},
  {id:'row-or',guide_name:'Oregon Guide',catalog_source_id:null,catalog_listing_sha256:null},
 ];
 const expected=[
  {id:'row-a',guide_name:'Washington Guide One',guide_profile_path:'/washington/wa-001',is_own_submission:true},
  {id:'row-b',guide_name:'Washington Guide Two',guide_profile_path:'/washington/wa-002'},
  {id:'row-c',guide_name:null},
  {id:'row-or',guide_name:'Oregon Guide'},
 ];
 for(const kind of ['review','revision','report']){
  const factory=()=>({
   auth:{getUser:async()=>({data:{user:{id:'operator',email_confirmed_at:'yes'}}})},
   rpc:async(name,pagination)=>{
    if(name==='is_site_admin')return {data:true};
    assert.equal(name,kind==='report'?'rmg_report_queue':'rmg_revision_queue');
    assert.deepEqual(pagination,{p_offset:0,p_limit:10});
    return {data:rows};
   },
   from:table=>{
    assert.equal(table,'admin_pending_reviews');
    const query={select:()=>query,order:()=>query,range:async()=>({data:rows})};
    return query;
   },
  });
  const lookup=(sourceId,version)=>version===catalogVersions.get(sourceId)?
   (sourceId==='wa-001'?'Washington Guide One':'Washington Guide Two'):undefined;
  const response=await handleLaunch(req({operation:'operator_queue',kind,offset:0,limit:10},'token'),
   factory,catalogFlags,versionFor,lookup);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{items:expected,offset:0,limit:10});
 }
 const ordinary=backend();
 const denied=await handleLaunch(req({operation:'operator_queue',kind:'review',offset:0,limit:10},'token'),
  ordinary.factory,catalogFlags,versionFor,()=>assert.fail('Ordinary session read a moderation listing'));
 assert.equal(denied.status,403);
 assert.equal(ordinary.calls.at(-1)[0],'is_site_admin');
});
