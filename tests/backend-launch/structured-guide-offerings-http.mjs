import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {basename,join} from 'node:path';
import {Readable} from 'node:stream';
import {promisify} from 'node:util';
import {handleGuideOfferings} from '../../lib/guide-offerings/handler.mjs';

const socket=process.argv[2];
assert.ok(socket&&basename(socket).startsWith('rmg-guide-offerings.')&&existsSync(join(socket,'data/PG_VERSION')));
assert.equal(readFileSync(join(socket,'data/PG_VERSION'),'utf8').trim(),'17');
const run=promisify(execFile);
const actors={owner:'00000000-0000-0000-0000-000000000005',
 moderator:'00000000-0000-0000-0000-000000000004',angler:'00000000-0000-0000-0000-000000000003'};
const sqlLiteral=value=>"'"+value.replaceAll("'","''")+"'";
function fixtureClient(_url,_key,options){
 const role=options.global.headers.Authorization?.slice(7);
 return {
  auth:{async getUser(token){
   return {data:{user:Object.hasOwn(actors,token)?{email_confirmed_at:'2026-11-19',is_anonymous:false}:null}};
  }},
  async rpc(name,{p_operation,p_input}){
   assert.match(name,/^rmg_guide_offerings_(authorized|public)_v1$/);
   const actor=Object.hasOwn(actors,role)?actors[role]:null;
   const setup=actor?`SET ROLE authenticated; SET request.jwt.claim.sub='${actor}';`:'SET ROLE anon;';
   const sql=setup+`SELECT public.${name}(${sqlLiteral(p_operation)},${sqlLiteral(JSON.stringify(p_input))}::jsonb);`;
   try{
    const result=await run('psql',['-XAtq','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-h',socket,
     '-U','audit_owner','-d','postgres','-c',sql],{timeout:8000});
    return {data:JSON.parse(result.stdout)};
   }catch(error){
    const code=String(error.stderr).match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1];
    if(!code)throw error;
    return {error:{code}};
   }
  },
 };
}
const flags={RMG_GUIDE_OFFERINGS_ENABLED:'true',NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',
 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic'};
const server=createServer(async(incoming,outgoing)=>{
 try{
  assert.equal(incoming.url,'/api/guide-offerings');
  assert.equal(incoming.method,'POST');
  const response=await handleGuideOfferings(new Request(`http://127.0.0.1${incoming.url}`,{
   method:incoming.method,headers:incoming.headers,body:Readable.toWeb(incoming),duplex:'half',
  }),fixtureClient,flags);
  outgoing.writeHead(response.status,Object.fromEntries(response.headers));
  outgoing.end(await response.text());
 }catch(error){
  outgoing.writeHead(500);
  outgoing.end(String(error));
 }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
 const url=`http://127.0.0.1:${server.address().port}/api/guide-offerings`;
 async function call(value,token,status=200){
  const answer=await fetch(url,{method:'POST',headers:{'content-type':'application/json',
   ...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(value)});
  const body=await answer.json();
  assert.equal(answer.status,status,JSON.stringify(body));
  assert.equal(answer.headers.get('cache-control'),'no-store');
  return body;
 }
 const source={jurisdiction:'OR',sourceId:'OG.0000001'};
 const owner={operation:'owner_get',...source};
 assert.deepEqual(await call(owner,'angler',403),{error:'forbidden'});
 const baseline=await call(owner,'owner');
 const revision=baseline.draft.revision;
 const draft={vessels:[],offerings:[{id:'p1',title:'Synthetic river trip',jurisdiction:'OR',
  waterway:'Columbia Estuary',launchArea:'Astoria',species:['Sturgeon'],months:[7],vesselId:null,
  bookingStyle:'call_to_confirm',duration:'half_day',methodIds:['plunking'],gearIds:[]}]};
 const saved=await call({operation:'owner_save',...source,expectedRevision:revision,draft},'owner');
 assert.equal(saved.draft.revision,revision+1);
 const submitted=await call({operation:'owner_submit',...source,expectedRevision:saved.draft.revision},'owner');
 const profile={operation:'public_profile',...source};
 assert.equal((await call(profile)).profile.offerings.length,0);
 assert.equal((await call({operation:'moderator_list',offset:0,limit:10},'moderator')).items[0].id,submitted.proposal.id);
 await call({operation:'moderator_decide',proposalId:submitted.proposal.id,approve:true,
  reason:'Verified synthetic loopback proposal'},'moderator');
 assert.deepEqual((await call(profile)).profile.offerings,draft.offerings);
 const batch=await call({operation:'public_batch',afterSourceId:'OG.0000001',limit:1});
 assert.equal(batch.items[0].sourceId,'OG.0001225.F&F');
 console.log('PASS loopback HTTP with synthetic Auth and real PG owner-save/submit, pending privacy, moderator publish and exact suffix batch');
}finally{
 await new Promise(resolve=>server.close(resolve));
}
