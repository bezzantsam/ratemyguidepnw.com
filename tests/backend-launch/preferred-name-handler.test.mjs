import test from 'node:test';
import assert from 'node:assert/strict';
import {handleLaunch} from '../../lib/backend-launch/handler.mjs';

const env={NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test',RMG_LAUNCH_ENABLED:'true',RMG_PREFERRED_NAMES_ENABLED:'true'};
const req=(body,token)=>new Request('https://example.invalid/api/launch',{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
function backend(data,{admin=false,user={id:'fixture',email_confirmed_at:'yes',is_anonymous:false},error=null}={}){
 const calls=[];return {calls,factory:()=>({auth:{getUser:async()=>({data:{user},error:null})},rpc:async(name,args)=>{calls.push([name,args]);return name==='is_site_admin'?{data:admin,error:null}:{data,error}}})};
}
test('public batch is bounded, strips unneeded fields and rejects unexpected IDs',async()=>{
 const input={operation:'profile_names_v1',jurisdiction:'OR',sourceIds:['OG.0000359']};
 let b=backend([{jurisdiction:'OR',source_id:'OG.0000359',preferred_name:'Scott',provenance:'admin',actor_id:'private'}]);
 let r=await handleLaunch(req(input),b.factory,env);assert.equal(r.status,200);assert.deepEqual(await r.json(),{names:[{jurisdiction:'OR',source_id:'OG.0000359',preferred_name:'Scott',provenance:'admin'}]});
 b=backend([{jurisdiction:'OR',source_id:'unrequested',preferred_name:'Scott',provenance:'admin'}]);r=await handleLaunch(req(input),b.factory,env);assert.equal(r.status,503);
 b=backend([]);r=await handleLaunch(req({...input,sourceIds:Array(101).fill('x')}),b.factory,env);assert.equal(r.status,400);assert.equal(b.calls.length,0);
});
test('owner and moderator edits require genuine authentication and moderator membership',async()=>{
 const owner={operation:'set_profile_name_v1',jurisdiction:'OR',sourceId:'OG.0000359',name:'李明'};
 let b=backend({status:'saved'}),r=await handleLaunch(req(owner),b.factory,env);assert.equal(r.status,401);assert.equal(b.calls.length,0);
 b=backend({status:'saved'});r=await handleLaunch(req(owner,'token'),b.factory,env);assert.equal(r.status,200);assert.equal(b.calls.at(-1)[0],'rmg_set_profile_name_v1');
 const admin={...owner,operation:'admin_set_profile_name_v1',reason:'Editorial correction'};
 b=backend({status:'saved'});r=await handleLaunch(req(admin,'token'),b.factory,env);assert.equal(r.status,403);assert.equal(b.calls.some(x=>x[0]==='rmg_admin_set_profile_name_v1'),false);
 b=backend({status:'saved'},{admin:true});r=await handleLaunch(req({...admin,name:null},'token'),b.factory,env);assert.equal(r.status,200);assert.equal(b.calls.at(-1)[1].p_name,null);
});
test('invalid names fail before backend and the closed launch gate refuses all name operations',async()=>{
 for(const name of ['<script>', 'a'.repeat(81),'bad\u0001name']){const b=backend(null),r=await handleLaunch(req({operation:'set_profile_name_v1',jurisdiction:'OR',sourceId:'OG.0000359',name},'token'),b.factory,env);assert.equal(r.status,400);assert.equal(b.calls.length,0)}
 const b=backend([]),r=await handleLaunch(req({operation:'profile_names_v1',jurisdiction:'OR',sourceIds:['OG.0000359']}),b.factory,{});assert.equal(r.status,503);assert.equal(b.calls.length,0);
 const absent=backend([]),closed=await handleLaunch(req({operation:'profile_names_v1',jurisdiction:'OR',sourceIds:['OG.0000359']}),absent.factory,{...env,RMG_PREFERRED_NAMES_ENABLED:undefined});assert.equal(closed.status,503);assert.equal(absent.calls.length,0);
});
test('moderator review strips private identifiers',async()=>{
 const b=backend({captain_name:'Scott',captain_name_active:true,admin_name:null,actor_id:'private',history:[{origin:'captain',old_name:null,new_name:'Scott',reason:null,created_at:'2026-11-18',actor_id:'private'}]},{admin:true});
 const r=await handleLaunch(req({operation:'profile_name_review_v1',jurisdiction:'OR',sourceId:'OG.0000359'},'token'),b.factory,env);assert.equal(r.status,200);const data=await r.json();assert.equal(JSON.stringify(data).includes('private'),false);assert.equal(data.review.history[0].new_name,'Scott');
});
test('owner name read requires authentication and strips private fields',async()=>{
 const input={operation:'own_profile_name_v1',jurisdiction:'OR',sourceId:'OG.0000359'};
 let b=backend({name:'Scott',overridden:true,actor_id:'private'}),r=await handleLaunch(req(input),b.factory,env);assert.equal(r.status,401);assert.equal(b.calls.length,0);
 b=backend({name:'Scott',overridden:true,actor_id:'private'});r=await handleLaunch(req(input,'token'),b.factory,env);assert.equal(r.status,200);assert.deepEqual(await r.json(),{name:'Scott',overridden:true});assert.equal(b.calls.at(-1)[0],'rmg_own_profile_name_v1');
 b=backend({name:'<bad>',overridden:true});r=await handleLaunch(req(input,'token'),b.factory,env);assert.equal(r.status,503);
 b=backend(null,{error:{code:'42501'}});r=await handleLaunch(req(input,'token'),b.factory,env);assert.notEqual(r.status,200);
});
