import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as catalog from '../lib/captain-fishing/catalog.mjs';

function load(path,dependencies={},globals={}) {
  const exports={};
  const {outputText}=ts.transpileModule(readFileSync(path,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
  });
  runInNewContext(outputText,{exports,URL,URLSearchParams,require:id=>dependencies[id],...globals});
  return exports;
}

const query=load('lib/directory-query.ts',{'./captain-fishing/catalog.mjs':catalog});
const url=load('lib/directory-url.ts',{'./directory-query':query});
const source={jurisdiction:'OR',sourceId:'OG.0002193'};
const secondSource={jurisdiction:'OR',sourceId:'OG.0000047'};
const estuary={
  id:'p1',title:'Fixture estuary sturgeon',jurisdiction:'OR',waterway:'Columbia River Estuary',
  launchArea:'Astoria',species:['Sturgeon'],months:[5],vesselId:null,
  bookingStyle:'call_to_confirm',duration:'half_day',methodIds:['plunking'],gearIds:['baitcasting-tackle'],
};
const nearshore={
  id:'p2',title:'Fixture nearshore bottomfish',jurisdiction:'WA',waterway:'Pacific Ocean',
  launchArea:'Ilwaco',species:['Lingcod','Rockfish'],months:[7],vesselId:null,
  bookingStyle:'per_seat',duration:'full_day',methodIds:['bottom-fishing'],gearIds:['electric-fishing-reels'],
};
const profile=({ ...source, publishedVersion:1, attribution:'captain_declared', vessels:[], offerings:[estuary,nearshore] });
const listing={
  id:source.sourceId,name:'Fixture Captain',business:'Shared Fixture Outfit',states:['Oregon'],
  areas:[],advertisedWaters:[],searchAliases:[],captainTrips:profile.offerings,
};
const otherListing={...listing,id:secondSource.sourceId,name:'Another Captain',captainTrips:[]};
const baseline={state:'All',sourceZone:'All areas',advertisedWater:'All advertised waters',query:''};

test('legacy clam gear still parses and matches old filters without appearing in gear menus',async()=>{
  const legacy=['clam-guns','clam-shovels','clam-rakes'];
  const trip={...nearshore,species:['Rockfish'],gearIds:legacy};
  const row={...listing,captainTrips:[trip]};
  const {client,signal}=projection(()=>({profile:{...profile,offerings:[trip]}}));
  assert.deepEqual(Array.from((await client.fetchCaptainTripsForProfile(source,signal)).offerings[0].gearIds),legacy);
  const menu=query.directoryMethodGroups(['Clam tube','Clam digging','Clamming']);
  assert.ok(menu.methods.includes('Clam digging'));
  assert.ok(menu.gear.includes('Crab pots'));
  for(const id of legacy){
    const label=query.directoryMethodLabel(id);
    assert.ok(!menu.gear.includes(label)&&!menu.methods.includes(label));
    const state=url.parseDirectoryState('?gear='+id+'&method='+encodeURIComponent(label),[row]);
    assert.equal(state.gear,id);
    assert.equal(state.method,label);
    assert.equal(query.matchingCaptainTrips(row,{...baseline,gear:id,method:label}).length,1);
    assert.equal(query.matchingCaptainTrips(listing,{...baseline,gear:id}).length,0);
  }
  assert.equal(url.parseDirectoryState('?method=clam+tube',[row]).method,'Clam guns');
});

test('captains can remove saved clam gear and cannot find it as a new editor choice',()=>{
  let search='',expanded=true,hook=0;
  const jsx=(type,props)=>({type,props});
  const {FishingChoices}=load('components/launch/CaptainFishingChoices.tsx',{
    react:{useState:()=>[hook++===0?search:expanded,()=>{}]},
    'react/jsx-runtime':{jsx,jsxs:jsx},
    '@/lib/captain-fishing/catalog.mjs':catalog,
  });
  function findAll(node,predicate){
    if(Array.isArray(node))return node.flatMap(child=>findAll(child,predicate));
    if(!node||typeof node!=='object')return [];
    return [...(predicate(node)?[node]:[]),...findAll(node.props?.children,predicate)];
  }
  let ids=['clam-guns','clam-shovels','clam-rakes','crab-pots'];
  const gear=()=>{
    hook=0;
    const view=FishingChoices({kind:'gear',ids,disabled:false,onToggle:(id,checked)=>{
      assert.equal(checked,false);
      ids=ids.filter(saved=>saved!==id);
    }});
    return findAll(view,node=>node.type==='label'&&node.props.children[0]?.props?.type==='checkbox');
  };
  const legacyLabels=['Clam guns','Clam shovels','Clam rakes'];
  for(const label of legacyLabels){
    const row=gear().find(node=>node.props.children[1]===label);
    assert.equal(row.props.children[0].props.checked,true);
    row.props.children[0].props.onChange({target:{checked:false}});
  }
  assert.deepEqual(ids,['crab-pots']);
  assert.ok(gear().every(node=>!legacyLabels.includes(node.props.children[1])));
  search='clam';
  assert.equal(gear().length,0);
});

test('two approved trips never combine location, state, species, method, gear or month',()=>{
  const ids=overrides=>Array.from(query.filterDirectoryEntries([listing,otherListing],{...baseline,...overrides}),entry=>entry.id);
  const estuarySearch={state:'Oregon',advertisedWater:'Astoria',species:'Sturgeon',method:'Plunking',gear:'baitcasting-tackle',month:5};
  const nearshoreSearch={state:'Washington',advertisedWater:'Pacific Ocean',species:'Rockfish',method:'Bottom fishing',gear:'electric-fishing-reels',month:7};
  assert.deepEqual(ids(estuarySearch),[listing.id]);
  assert.deepEqual(ids(nearshoreSearch),[listing.id]);
  assert.deepEqual(ids({query:'Astoria lingcod'}),[]);
  assert.deepEqual(ids({query:'Ilwaco rockfish'}),[listing.id]);
  for(const wrong of [
    {state:'Washington'},{advertisedWater:'Pacific Ocean'},{species:'Lingcod'},
    {method:'Bottom fishing'},{gear:'electric-fishing-reels'},{month:7},{query:'Rockfish'},
  ])assert.deepEqual(ids({...estuarySearch,...wrong}),[],JSON.stringify(wrong));
  assert.equal(query.matchingCaptainTrips({...listing,captainTrips:[{...estuary,months:[]}]},{...baseline,month:5}).length,0);
});

test('editorial facets stay independent and pending/removed trips are never inferred from them',()=>{
  const editorial={...listing,advertisedSpecies:['Coho Salmon'],advertisedMethods:['Fly fishing'],editorialFishing:[{value:'Coho Salmon',attributedTo:'Source'}]};
  const matches=filters=>query.filterDirectoryEntries([editorial],{...baseline,...filters}).length;
  assert.equal(matches({species:'Coho Salmon',method:'Fly fishing'}),1);
  assert.equal(matches({species:'Coho Salmon',method:'Plunking'}),0);
  assert.equal(matches({species:'Coho Salmon',gear:'baitcasting-tackle'}),0);
  assert.equal(query.filterDirectoryEntries([{...editorial,captainTrips:[]}],{...baseline,query:'Ilwaco rockfish'}).length,0);
  assert.equal(query.filterDirectoryEntries([{...editorial,captainTrips:[]}],{...baseline,species:'Coho Salmon'}).length,1);
});

test('existing URL fields and aliases coexist with trip-only filters',()=>{
  const state=url.parseDirectoryState('?state=Washington&water=Ilwaco&species=Rockfish&method=bottomfishing&gear=electric+reels&month=7',[listing]);
  assert.equal(state.waterway,'Ilwaco');
  assert.equal(state.method,'Bottom fishing');
  assert.equal(state.gear,'electric-fishing-reels');
  assert.equal(state.month,7);
  const share=url.directoryUrl(state);
  assert.equal(url.safeDirectoryReturn(share),share);
  assert.equal(url.parseDirectoryState(share.split('?')[1],[listing]).page,1);
  const legacy=url.parseDirectoryState('?method=automatic+pot+puller&page=2',[listing]);
  assert.equal(legacy.method,'Electric pot pullers');
  assert.equal(Object.hasOwn(legacy,'month'),false);
  assert.equal(Object.hasOwn(legacy,'gear'),false);
  assert.equal(url.parseDirectoryState('?month=7&month=8',[listing]).month,undefined);
});

function projection(respond) {
  const calls=[];
  const client=load('lib/public-captain-trips.ts',{'./captain-fishing/catalog.mjs':catalog},{
    fetch:async (path,options)=>{
      assert.equal(path,'/api/guide-offerings');
      assert.equal(options.method,'POST');
      assert.equal(options.mode,'same-origin');
      assert.equal(options.credentials,'same-origin');
      assert.equal(options.redirect,'error');
      assert.equal(options.cache,'no-store');
      assert.deepEqual(Object.entries(options.headers),[['Content-Type','application/json']]);
      const body=JSON.parse(options.body);
      calls.push(body);
      return {ok:true,json:async()=>respond(body)};
    },
  });
  return {calls,client,signal:new AbortController().signal};
}

test('directory uses batched cursor reads with guide isolation and no profile fan-out',async()=>{
  const {calls,client,signal}=projection(request=>request.afterSourceId
    ?{items:[{...profile,...secondSource,publishedVersion:2,offerings:[]}],nextCursor:null}
    :{items:[profile],nextCursor:source.sourceId});
  const rows=await client.fetchCaptainTripsForDirectory(signal);
  assert.deepEqual(calls,[
    {operation:'public_batch',afterSourceId:null,limit:100},
    {operation:'public_batch',afterSourceId:source.sourceId,limit:100},
  ]);
  assert.equal(rows.get(client.captainTripKey(source)).length,2);
  assert.equal(rows.get(client.captainTripKey(secondSource)).length,0);
  assert.equal(rows.has(client.captainTripKey({jurisdiction:'WA',sourceId:source.sourceId})),false);
});

test('profile projection binds exact identity and replaces approved versions including empty',async()=>{
  let publicVersion=profile;
  const {client,signal}=projection(()=>({profile:publicVersion}));
  const first=await client.fetchCaptainTripsForProfile(source,signal);
  assert.equal(first.publishedVersion,1);
  // A pending proposal never participates in the public read contract.
  publicVersion={...profile,pendingProposal:{offerings:[]}};
  assert.equal((await client.fetchCaptainTripsForProfile(source,signal)).offerings.length,2);
  publicVersion={...profile,publishedVersion:2,offerings:[]};
  assert.equal((await client.fetchCaptainTripsForProfile(source,signal)).offerings.length,0);
  publicVersion={...profile,...secondSource};
  await assert.rejects(client.fetchCaptainTripsForProfile(source,signal),/Mismatched/);
  publicVersion=null;
  assert.equal(await client.fetchCaptainTripsForProfile(source,signal),null);
});

test('malformed or ambiguous batch rows cannot erase another guide’s valid projection',async()=>{
  const suffix={jurisdiction:'OR',sourceId:'OG.0001225.F&F'};
  const {calls,client,signal}=projection(request=>!request.afterSourceId
    ?{items:[{...profile,...suffix},{...profile,sourceId:'bad-id'},{...profile,...secondSource,offerings:[{...estuary,months:[13]}]}],nextCursor:suffix.sourceId}
    :{items:[{...profile,...secondSource},{...profile,...secondSource,publishedVersion:2},profile],nextCursor:null});
  const rows=await client.fetchCaptainTripsForDirectory(signal);
  assert.equal(rows.get(client.captainTripKey(suffix)).length,2);
  assert.equal(rows.get(client.captainTripKey(source)).length,2);
  assert.equal(rows.has(client.captainTripKey(secondSource)),false);
  assert.equal(calls[1].afterSourceId,suffix.sourceId);
});

test('moderator parser keeps empty proposals and rejects malformed, duplicate or orphaned trips',()=>{
  const {client}=projection(()=>null);
  assert.equal(client.parseSubmittedTrips({vessels:[],offerings:[estuary,nearshore]}).offerings.length,2);
  assert.equal(client.parseSubmittedTrips({vessels:[],offerings:[]}).offerings.length,0);
  for(const bad of [[estuary,{...nearshore,months:[13]}],[estuary,estuary],[{...estuary,vesselId:'v1'}]]){
    assert.throws(()=>client.parseSubmittedTrips({vessels:[],offerings:bad}),/Invalid trip contents/);
  }
});

test('mixed fisheries match only supported broad targets and methods',async()=>{
  const mixed={...nearshore,title:'Nearshore trip',species:[],gearIds:[]};
  const crabbing={...nearshore,title:'Mixed crabbing',species:['Crabbing'],methodIds:[],gearIds:[]};
  const dungeness={...crabbing,species:['Dungeness crab']};
  const {client,signal}=projection(()=>({profile:{...profile,offerings:[mixed]}}));
  const approved=await client.fetchCaptainTripsForProfile(source,signal);
  assert.equal(approved.offerings[0].species.length,0);
  assert.throws(()=>client.parseSubmittedTrips({vessels:[],offerings:[{...mixed,methodIds:['jigging']}]}),/Invalid trip contents/);
  assert.equal(query.canonicalFisheryLabel('mixed groundfish'),'mixed groundfish');
  for(const [trip,filters,wanted] of [
    [mixed,{method:'Bottom fishing'},1],[mixed,{query:'mixed groundfish'},1],
    [mixed,{query:'mixed bottomfish Ilwaco'},1],
    [mixed,{species:'Rockfish'},0],[mixed,{query:'Lingcod'},0],
    [{...mixed,species:['Rockfish'],methodIds:['jigging']},{query:'mixed groundfish'},0],
    [{...mixed,species:['Bottom fishing'],methodIds:[]},{method:'Bottom fishing'},0],
    [crabbing,{species:'Crabbing'},1],[crabbing,{query:'crab'},1],
    [crabbing,{species:'Dungeness crab'},0],[crabbing,{method:'Crab ring fishing'},0],
    [crabbing,{method:'Pot fishing'},0],[crabbing,{gear:'crab-pots'},0],
    [crabbing,{query:'Ilwaco Dungeness crabbing'},0],[dungeness,{query:'Ilwaco Dungeness crabbing'},1],
    [dungeness,{query:'crab'},1],[dungeness,{species:'Crabbing'},1],[dungeness,{species:'Dungeness crab'},1],
    [dungeness,{method:'Crab ring fishing'},0],[dungeness,{method:'Pot fishing'},0],[dungeness,{gear:'crab-pots'},0],
  ])assert.equal(query.matchingCaptainTrips({...listing,captainTrips:[trip]},{...baseline,...filters}).length,wanted,JSON.stringify(filters));
  const dungenessOnly={...listing,captainTrips:[dungeness]};
  assert.deepEqual(Array.from(query.captainTripFacets(dungenessOnly,'All').species),['Dungeness crab']);
  assert.equal(url.parseDirectoryState('?species=Crabbing',[dungenessOnly]).species,'Crabbing');
  assert.equal(url.parseDirectoryState('?species=Dungeness+crab',[dungenessOnly]).species,'Dungeness crab');
});

test('only Oregon source listings publish, while individual trips may be in Washington',async()=>{
  const unexpected={...profile,jurisdiction:'WA',sourceId:'wa-144'};
  const {client,signal}=projection(request=>request.operation==='public_batch'
    ?{items:[unexpected,profile],nextCursor:null}
    :{profile:request.jurisdiction==='WA'?null:profile});
  const rows=await client.fetchCaptainTripsForDirectory(signal);
  assert.equal(rows.has(client.captainTripKey(unexpected)),false);
  assert.ok(rows.get(client.captainTripKey(source)).some(trip=>trip.jurisdiction==='WA'));
  assert.equal(await client.fetchCaptainTripsForProfile(unexpected,signal),null);
  const wrong=projection(()=>({profile:unexpected}));
  await assert.rejects(wrong.client.fetchCaptainTripsForProfile(unexpected,wrong.signal),/Invalid public trip projection/);
});
