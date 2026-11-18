import test from 'node:test';
import assert from 'node:assert/strict';
import {handleLaunch} from '../../lib/backend-launch/handler.mjs';
const env={NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'public-test'};
const review={operation:'submit_review',jurisdiction:'OR',sourceId:'or-1',quality:5,intensity:3,wouldBookAgain:true,body:'x'.repeat(80),firsthandAttested:true,relationship:'none'};
function req(body,token){return new Request('https://example.invalid/api/launch',{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)})}
function backend({user={id:'u',email_confirmed_at:'2026-01-01',is_anonymous:false},admin=false,rpcError=null}={}){
 const calls=[];const client={auth:{getUser:async token=>{calls.push(['getUser',token]);return {data:{user},error:null}}},rpc:async(name,params)=>{calls.push([name,params]);if(name==='is_site_admin')return {data:admin,error:null};return rpcError?{data:null,error:rpcError}:{data:{id:'actual-id',status:'pending'},error:null}},from:()=>{throw new Error('unexpected table query')}};
 return {calls,factory:(_url,_key,opts)=>{calls.push(['headers',opts.global.headers]);return client}};
}
test('no session or unconfirmed session cannot submit',async()=>{
 let b=backend(),r=await handleLaunch(req(review),b.factory,env);assert.equal(r.status,401);assert.equal(b.calls.length,0);
 b=backend({user:{id:'u',email_confirmed_at:null}});r=await handleLaunch(req(review,'token'),b.factory,env);assert.equal(r.status,401);assert.equal(b.calls.some(c=>c[0]==='rmg_submit_review'),false);
 b=backend({user:{id:'u',email_confirmed_at:'yes',is_anonymous:true}});r=await handleLaunch(req(review,'token'),b.factory,env);assert.equal(r.status,401);
});
test('submission uses verified token and returns actual persisted response',async()=>{
 const b=backend(),r=await handleLaunch(req(review,'token'),b.factory,env);
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{id:'actual-id',status:'pending'});assert.deepEqual(b.calls[0],['headers',{Authorization:'Bearer token'}]);assert.equal(b.calls[1][0],'getUser');assert.equal(b.calls[2][0],'rmg_submit_review');assert.equal(b.calls[2][1].p_firsthand,true);assert.equal(b.calls[2][1].p_relationship,'none');assert.equal(r.headers.get('cache-control'),'no-store');
});
test('forged role/status, oversized bodies, private DB errors fail safely',async()=>{
 const b=backend(),a=await handleLaunch(req({...review,status:'published'},'token'),b.factory,env);assert.equal(a.status,400);assert.equal(b.calls.length,0);
 const big=new Request('https://example.invalid/api/launch',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(17000)});assert.equal((await handleLaunch(big,b.factory,env)).status,400);
 const c=backend({rpcError:{code:'XX000',message:'sensitive database detail'}});const r=await handleLaunch(req(review,'token'),c.factory,env);assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'service_unavailable'});
});
test('moderation uses server-side membership and never invokes action for nonadmin',async()=>{
 const b=backend(),action={operation:'operator_decide',kind:'claim',id:'00000000-0000-0000-0000-000000000001',approve:true,reason:'Manual evidence was reviewed'};
 const r=await handleLaunch(req(action,'token'),b.factory,env);assert.equal(r.status,403);assert.equal(b.calls.some(c=>c[0]==='admin_decide_claim'),false);
});
test('unavailable configuration fails closed',async()=>{const b=backend();const r=await handleLaunch(req(review,'token'),b.factory,{});assert.equal(r.status,503);assert.equal(b.calls.length,0)});
test('rate limits and ordinary database conflicts have distinct safe errors',async()=>{
 let b=backend({rpcError:{code:'P4290',message:'private internal text'}}),r=await handleLaunch(req(review,'token'),b.factory,env);assert.equal(r.status,429);assert.deepEqual(await r.json(),{error:'rate_limited'});
 b=backend({rpcError:{code:'P0001',message:'private internal text'}});r=await handleLaunch(req(review,'token'),b.factory,env);assert.equal(r.status,409);assert.deepEqual(await r.json(),{error:'conflict'});
});
test('safe return rejects external destinations before configuration access',async()=>{
 let r=await handleLaunch(req({operation:'safe_return',returnTo:'/guides/og-123?intent=review#write-review'}),()=>{throw Error('must not call')},{});
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{returnTo:'/guides/og-123?intent=review#write-review'});
 r=await handleLaunch(req({operation:'safe_return',returnTo:'//evil.example/'}),()=>{throw Error('must not call')},{});assert.equal(r.status,400);
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
