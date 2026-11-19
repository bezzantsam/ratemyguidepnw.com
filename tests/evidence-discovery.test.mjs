import * as fishingCatalog from '../lib/captain-fishing/catalog.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=p=>readFileSync(p,'utf8');
function load(path,dependencies={}){
 const exports={};
 const js=ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
 vm.runInNewContext(js,{exports,URL,URLSearchParams,Date,Set,Map,process:{env:{}},require:name=>{if(dependencies[name])return dependencies[name];throw Error(name)}});
 return exports;
}
const evidence=load('lib/guide-attributes.ts',{'./guide-evidence-holds.json':JSON.parse(read('lib/guide-evidence-holds.json'))});
const {approvedAttributes}=evidence;
const query=load('lib/directory-query.ts',{'./captain-fishing/catalog.mjs':fishingCatalog});
const url=load('lib/directory-url.ts',{'./directory-query':query});
const fixture=JSON.parse(read('tests/fixtures/discovery-attributes.json'));
const known=new Set(['OG.0000047','OG.0000050','OG.0001116','OG.0000782','OG.0001224','OG.0001881']);
const clone=x=>JSON.parse(JSON.stringify(x));
test('only approved, attributed and uniquely identified facts pass',()=>{
 const approved=approvedAttributes(fixture,known);
 assert.equal(approved.length,6);
 assert.ok(approved.every(x=>x.editorial_status==='approved'&&x.publication_approved));
 for(const change of [x=>delete x.source.url,x=>delete x.source.locator,x=>x.source.reviewed_on='2026-02-30',x=>x.source.reviewed_on='2999-01-01',x=>x.guide_id='OG.9999999',x=>x.editorial_status='unknown',x=>x.publication_approved=false]){
  const record=clone(fixture[0]);change(record);assert.equal(approvedAttributes([record],known).length,0);
 }
 const duplicate=clone(fixture[0]);duplicate.editorial_status='rejected';duplicate.publication_approved=false;
 assert.equal(approvedAttributes([fixture[0],duplicate],known).length,0);
});
test('holds and explicit discontinued water fail closed even if marked approved',()=>{
 for(const id of ['OG.0000782','OG.0001224','OG.0001881']){
  const r=clone(fixture[0]);r.guide_id=id;assert.equal(approvedAttributes([r],known).length,0);
 }
 const burrell=clone(fixture[0]);burrell.guide_id='OG.0001116';burrell.relationship={species:'Salmon',waterway:'Grindstone Lakes'};
 assert.equal(approvedAttributes([burrell],known).length,0);
 delete burrell.relationship;burrell.value='Grindstone Lakes';assert.equal(approvedAttributes([burrell],known).length,0);
});
test('specific species do not match broad labels, and same business does not merge IDs',()=>{
 const shared={business:'Same Outfit',states:['Oregon'],areas:[],advertisedWaters:[],searchAliases:[],advertisedMethods:['Fly fishing']};
 const rows=[{...shared,id:'OG.0000047',name:'One',advertisedSpecies:['Salmon']},{...shared,id:'OG.0000050',name:'Two',advertisedSpecies:['Chinook Salmon']}];
 const f={state:'All',sourceZone:'All areas',advertisedWater:'All advertised waters',query:'',species:'Salmon',method:'Fly fishing'};
 assert.deepEqual(Array.from(query.filterDirectoryEntries(rows,f),x=>x.id),['OG.0000047']);
 assert.deepEqual(Array.from(query.filterDirectoryEntries(rows,{...f,species:'Chinook Salmon'}),x=>x.id),['OG.0000050']);
 assert.equal(query.filterDirectoryEntries(rows,{...f,species:'Coho Salmon'}).length,0);
 assert.equal(query.filterDirectoryEntries(rows,{...f,species:'All species',query:'Chinook'}).length,1);
 rows[0].advertisedTrips=['Overnight camp'];rows[0].searchAliases=['Source Listed Outfit'];
 const fresh=rows.map(r=>({...r}));
 assert.deepEqual(Array.from(query.filterDirectoryEntries(fresh,{...f,species:'All species',query:'Overnight camp'}),x=>x.id),['OG.0000047']);
 assert.deepEqual(Array.from(query.filterDirectoryEntries(fresh,{...f,species:'All species',query:'Source Listed Outfit'}),x=>x.id),['OG.0000047']);
 const state=url.parseDirectoryState('?state=Oregon&species=Salmon&method=Fly+fishing&page=3',rows);
 assert.equal(state.species,'Salmon');assert.equal(state.method,'Fly fishing');assert.equal(state.page,1);
 assert.equal(url.safeDirectoryReturn(url.directoryUrl(state)),url.directoryUrl(state));
 const invalid=url.parseDirectoryState('?state=Washington&species=Salmon&method=Fly+fishing',rows);
 assert.equal(invalid.species,'All species');assert.equal(invalid.method,'Fly fishing');
 assert.equal(url.parseDirectoryState('?species=Salmon&species=Chinook+Salmon',rows).species,'All species');
});
test('combined filters preserve flat callers and require one offering for structured entries',()=>{
 const listing={id:'OG.0000047',name:'Example Guide',business:null,states:['Oregon'],areas:[],searchAliases:[],
  advertisedSpecies:['Sturgeon','Lingcod'],advertisedMethods:['Bottom fishing','Trolling'],advertisedWaters:['Fixture Bay']};
 const sameTrip={kind:'species',value:'Lingcod',state:'OR',relationship:{species:'Lingcod',method:'Bottom fishing',waterway:'Fixture Bay'}};
 const separateFacts=[
  {kind:'species',value:'Sturgeon',state:'OR',relationship:{species:'Sturgeon',waterway:'Fixture Bay'}},
  {kind:'method',value:'Trolling',state:'OR',relationship:{method:'Trolling',waterway:'Fixture Bay'}},
 ];
 const structured={...listing,fisheryOfferings:[sameTrip,...separateFacts]};
 const filter={state:'Oregon',sourceZone:'All areas',advertisedWater:'All advertised waters',query:'',species:'Sturgeon',method:'Trolling'};
 const matches=(entry,overrides={})=>query.filterDirectoryEntries([entry],{...filter,...overrides}).length;
 assert.equal(matches(listing),1,'legacy flat facets');
 assert.equal(matches({...listing,fisheryOfferings:[]}),1,'empty structured projection');
 assert.equal(matches(structured),0,'separate standalone offerings do not establish a pair');
 const separateOnly={...listing,fisheryOfferings:separateFacts};
 assert.equal(matches(separateOnly),0,'structured entries with no complete pairing do not fall back to flat facets');
 assert.equal(matches({...listing,locatedOfferings:separateFacts}),0,'legacy source-scoped input still requires a pair');
 for(const water of ['All advertised waters','Fixture Bay']){
  assert.equal(matches(structured,{advertisedWater:water,species:'Lingcod',method:'Bottom fishing'}),1);
  assert.equal(matches(structured,{advertisedWater:water,species:'Lingcod',method:'Trolling'}),0);
 }
 assert.equal(matches(structured,{species:'All species',query:'Sturgeon'}),0,'typed species with method');
 assert.equal(matches(structured,{method:'All methods',query:'Trolling'}),0,'typed method with species');
});

test('only explicitly provided relationships survive; malformed relationships are rejected',()=>{
 const independent=approvedAttributes(fixture,known).find(x=>x.value==='Salmon');
 assert.equal(independent.relationship,undefined);
 const connected=approvedAttributes(fixture,known).find(x=>x.value==='Chinook Salmon');
 assert.equal(connected.relationship.waterway,'Fixture River');
 const bad=clone(connected);bad.relationship.species='Coho Salmon';
 assert.equal(approvedAttributes([bad],known).length,0);
 const another=clone(connected);another.relationship.waterway='Second Fixture River';
 assert.equal(approvedAttributes([connected,another],known).length,2);
 assert.equal(approvedAttributes([connected,clone(connected)],known).length,1);
 another.editorial_status='pending';another.publication_approved=false;
 assert.equal(approvedAttributes([connected,another],known).length,0);
 const denied=clone(fixture[1]);denied.guide_id=connected.guide_id;denied.value=connected.relationship.method;denied.editorial_status='rejected';denied.publication_approved=false;
 assert.equal(approvedAttributes([connected,denied],known).length,0,'a rejected component blocks the relationship');
});
test('saltwater aliases match sourced offerings and keep regional identities distinct',()=>{
 const base={business:'Shared Outfit',areas:[],advertisedWaters:[],searchAliases:[]};
 const rows=[
  {...base,id:'OG.0000047',name:'One',states:['Oregon'],advertisedSpecies:['Albacore tuna']},
  {...base,id:'wa-001',name:'Two',states:['Washington'],advertisedSpecies:['Tuna','Sablefish (black cod)'],advertisedMethods:['Bottom fishing']},
  {...base,id:'wa-002',name:'Black Cod',states:['Washington'],advertisedWaters:['Buoy 10'],advertisedSpecies:['Salmon']},
  {...base,id:'OG.0000050',name:'Four',states:['Oregon'],advertisedTrips:['Buoy 10 salmon']},
 ];
 const filters={state:'All',sourceZone:'All areas',advertisedWater:'All advertised waters'};
 const result=(text,scope={})=>Array.from(query.filterDirectoryEntries(rows,{...filters,...scope,query:text}),x=>x.id);
 assert.deepEqual(result('tuna'),['OG.0000047','wa-001']);
 assert.deepEqual(result('albacore'),['OG.0000047']);
 assert.deepEqual(result('',{species:'Tuna'}),['OG.0000047','wa-001']);
 assert.equal(url.parseDirectoryState('?state=Oregon&species=Tuna',rows).species,'Tuna');
 assert.deepEqual(result('black cod'),['wa-001']);
 assert.deepEqual(result('sablefish',{state:'Oregon'}),[]);
 assert.deepEqual(result('bottomfish',{state:'Washington',method:'Bottom fishing'}),['wa-001']);
 assert.deepEqual(result('Buoy 10 salmon'),['OG.0000050']);
});
test('operator team scope stays attached to its approved trip only',()=>{
 const item={...fixture[0],kind:'trip_type',value:'Buoy 10 salmon',relationship:undefined,offering_scope:'operator_business'};
 assert.equal(approvedAttributes([item],known)[0]?.offering_scope,'operator_business');
 assert.equal(approvedAttributes([{...item,kind:'species'}],known).length,0);
 assert.equal(approvedAttributes([{...item,offering_scope:'unknown'}],known).length,0);
});
test('coastal operators have one approved fact per exact departure and retain trip sources',()=>{
 const ids=new Set(['OG.0000989','wa-050']);
 const rows=approvedAttributes(JSON.parse(read('lib/approved-guide-attributes.json')),ids);
 const coastal=rows.filter(row=>row.offering_scope==='operator_business');
 const facts=Array.from(coastal,row=>[row.guide_id,row.location.state,row.location.city,row.kind,row.value].join('|').toLowerCase());
 assert.equal(facts.length,6);
 assert.equal(new Set(facts).size,6);
 assert.equal(rows.filter(row=>row.guide_id==='OG.0000989'&&row.value==='Buoy 10 salmon').length,1);
 const westport=coastal.filter(row=>row.guide_id==='wa-050');
 assert.ok(westport.every(row=>row.location.city==='Westport'&&row.location.state==='WA'&&row.source.url.includes('/westport-')));
 assert.ok(westport.every(row=>row.supporting_sources.length===1&&row.supporting_sources[0].url==='https://allriversguideservice.com/'));
 const fact=westport[0];
 assert.equal(approvedAttributes([{...fact,location:undefined}],ids).length,0);
 assert.equal(approvedAttributes([{...fact,supporting_sources:[{...fact.source,url:'http://example.com'}]}],ids).length,0);
});
test('charter evidence stays outside guide attribution and matches the same sourced offering by port and alias',()=>{
 const raw=JSON.parse(read('lib/approved-charter-offerings.json'));
 const {approvedCharterOfferings,charterOfferings}=load('lib/charter-offerings-server.ts',{
  './approved-charter-offerings.json':raw,'./guide-attributes':evidence
 });
 const {filterCharterOfferings}=load('lib/charter-offerings.ts',{'./directory-query':query});
 assert.equal(charterOfferings.length,34);
 assert.equal(approvedCharterOfferings([{...raw[0],guide_id:'wa-122'}]).length,0);
 assert.equal(approvedCharterOfferings([{...raw[0],publication_approved:false}]).length,0);
 assert.equal(approvedCharterOfferings([{...raw[0],source:{...raw[0].source,url:'http://example.com'}}]).length,0);
 assert.ok(charterOfferings.every(offer=>!('guide_id' in offer)&&!('named_skipper' in offer)));
 const filters=url.DEFAULT_DIRECTORY_STATE;
 const find=(term,patch={})=>Array.from(filterCharterOfferings(charterOfferings,{...filters,...patch,query:term}),offer=>offer.operator);
 assert.deepEqual(find('black cod'),find('sablefish'));
 assert.deepEqual(find('squid jigging',{state:'Washington'}),['Tengu Charters','Seattle Nautic']);
 assert.deepEqual(find('Edmonds squidding'),['Tengu Charters']);
 assert.deepEqual(find('',{state:'Washington',species:'Squid',method:'Squid jigging'}),['Seattle Nautic']);
 assert.deepEqual(find('Edmonds squidding',{state:'Washington',method:'Squid jigging'}),[]);
 assert.deepEqual(find('Seattle squid',{state:'Washington',method:'Squid jigging'}),['Seattle Nautic']);
 assert.deepEqual(find('squid',{method:'Jigging'}),[]);
 const squid=raw.find(row=>row.operator==='Seattle Nautic'&&row.kind==='species'&&row.value==='Squid');
 const tenguSquid=raw.find(row=>row.operator==='Tengu Charters'&&row.kind==='species'&&row.value==='Squid');
 const legacySquid=approvedCharterOfferings([tenguSquid]);
 for(const term of ['squid jigging','Edmonds squid jigging','Edmonds squidding']){
  assert.equal(filterCharterOfferings(legacySquid,{...filters,query:term}).length,1,term);
  assert.equal(filterCharterOfferings(legacySquid,{...filters,query:term,method:'Squid jigging'}).length,0,term);
 }
 assert.equal(filterCharterOfferings(legacySquid,{...filters,method:'Squid jigging'}).length,0);
 const selectedSquid=url.parseDirectoryState('?state=Washington&method=Squid+jigging',[],legacySquid);
 assert.equal(selectedSquid.method,'Squid jigging');
 assert.equal(url.directoryUrl(selectedSquid),'/guides?state=Washington&method=Squid+jigging');
 assert.equal(approvedCharterOfferings([{...squid,relationship:{species:'Flounder',method:'Squid jigging'}}]).length,0);
 assert.deepEqual(find('Seattle squid',{state:'Oregon'}),[]);
 assert.deepEqual(find('Newport black cod'),['Yaquina Bay Charters']);
 assert.deepEqual(find('black cod Newport'),['Yaquina Bay Charters']);
 assert.deepEqual(find('sablefish Westport'),['Mutineer Charters']);
 assert.deepEqual(find('Newport black cod',{state:'Washington'}),[]);
 assert.deepEqual(find('black cod',{method:'Bottom fishing'}),[]);
 assert.deepEqual(find('Buoy 10 salmon',{state:'Washington',species:'Salmon',waterway:'Buoy 10'}),['Roam Yacht Charters']);
 assert.deepEqual(find('Ilwaco Buoy 10 salmon',{state:'Oregon'}),[]);
 assert.equal(filterCharterOfferings(charterOfferings,{...filters,query:'Garibaldi Buoy 10 salmon'},['Garibaldi']).length,0);
 assert.equal(filterCharterOfferings(charterOfferings,{...filters,query:'Garibaldi Buoy 10'},['Garibaldi']).length,0);
 assert.equal(filterCharterOfferings(charterOfferings,{...filters,query:'Buoy 10 Garibaldi'},['Garibaldi']).length,0);
 assert.deepEqual(find('Ilwaco Buoy 10'),['Roam Yacht Charters']);
 assert.deepEqual(find('Depoe Bay albacore'),['Tradewinds Charters']);
 assert.deepEqual(find('Ilwaco bottom fishing',{state:'Washington',method:'Bottom fishing'}),['Sea Breeze Charters']);
 assert.deepEqual(find('Astoria bottom fishing'),[]);
 assert.deepEqual(find('Neah Bay halibut'),['Fish Neah Bay','Excel Fishing Charters']);
 assert.deepEqual(find('Makah Marina bottom fishing'),['Fish Neah Bay']);
 assert.deepEqual(find('bottom fishing La Push Marina',{state:'Washington',method:'Bottom fishing'}),['KYS Outdoor Adventures','Top Notch Ocean Charters']);
 assert.deepEqual(find('La Push halibut',{state:'Oregon'}),[]);
 for (const term of ['Bandon halibut','Bandon tuna','Bandon bottom fishing']) {
  assert.deepEqual(find(term),['Prowler Charters'],term);
 }
 for (const term of ['Bandon albacore','Port Orford halibut','Port Orford bottom fishing']) {
  assert.deepEqual(find(term),[],term);
 }
 assert.deepEqual(find('Bandon',{method:'Bottom fishing'}),['Prowler Charters']);
 assert.deepEqual(find('Bandon',{species:'Albacore tuna'}),[]);
 const prowler=raw.find(offer=>offer.business_id==='prowler-charters-bandon');
 assert.equal(charterOfferings.find(offer=>offer.businessId===prowler.business_id).sourceLabel,'Port authority listing');
 for (const patch of [{operator_source:undefined},{departure_source:undefined},{scope:'charter_operator_only'},{guide_id:'OG.0002422'}]) {
  assert.equal(approvedCharterOfferings([{...prowler,...patch}]).length,0);
 }
 for (const held of ['Sekiu bottom fishing','Neah Bay albacore','Neah Bay black cod','La Push albacore','La Push tuna']) {
  assert.deepEqual(find(held),[],held);
 }
 assert.equal(url.parseDirectoryState('?state=Washington&method=Bottom+fishing',[],charterOfferings).method,'Bottom fishing');
 assert.equal(url.parseDirectoryState('?state=Oregon&species=Tuna',[],charterOfferings).species,'Tuna');
 assert.equal(approvedCharterOfferings([{...raw.find(row=>row.scope==='operator_team'),departure_source:undefined}]).length,0);
 assert.equal(url.parseDirectoryState('?state=Washington&species=Salmon&water=Buoy+10',[],charterOfferings).waterway,'Buoy 10');
 assert.equal(url.parseDirectoryState('?state=Washington&species=Sablefish+(black+cod)',[],charterOfferings).species,'Sablefish (black cod)');
});
test('southern Oregon bottom fishing facts keep operator-team attribution and separate ports',()=>{
 const raw=JSON.parse(read('lib/approved-guide-attributes.json'));
 const ids=new Set(['OG.0003225','OG.0000544','OG.0002422']);
 const fishing=Array.from(approvedAttributes(raw,ids),fact=>[fact.guide_id,fact.location.city,fact.kind,fact.value,fact.offering_scope]);
 assert.deepEqual(fishing,[
  ['OG.0003225','Port Orford','method','Bottom fishing','operator_business'],
  ['OG.0002422','Bandon','method','Bottom fishing','operator_business'],
  ['OG.0000544','Port Orford','method','Bottom fishing','operator_business']
 ]);
 const entries=fishing.map(([id,city])=>({
  id,name:id,states:['Oregon'],areas:[],searchAliases:[],advertisedWaters:[],advertisedMethods:['Bottom fishing'],
  locatedOfferings:[{city,state:'OR',kind:'method',value:'Bottom fishing'}],
 }));
 const filters={state:'Oregon',sourceZone:'All areas',advertisedWater:'All advertised waters',query:'Port Orford',method:'Bottom fishing'};
 assert.deepEqual(Array.from(query.filterDirectoryEntries(entries,filters),entry=>entry.id),['OG.0000544','OG.0003225']);
 const lacey=raw.find(fact=>fact.guide_id==='OG.0000544');
 assert.equal(lacey.supporting_sources.find(source=>source.trip_label).url,'https://southcoasttours.net/tours/fish-forage-feast/');
 const rejected={...lacey,source:{...lacey.source,source_type:'port_authority'}};
 assert.equal(approvedAttributes([rejected],ids).length,0);
});
test('a port-qualified fishery search needs the location and target on the same guide fact',()=>{
 const base={states:['Oregon'],areas:['Garibaldi'],advertisedWaters:[],searchAliases:[],advertisedSpecies:['Albacore tuna']};
 const entries=[
  {...base,id:'OG.0000047',name:'One',advertisedSpecies:['Albacore tuna','Halibut'],locatedOfferings:[{city:'Garibaldi',state:'OR',kind:'species',value:'Albacore tuna'}]},
  {...base,id:'OG.0000050',name:'Two',locatedOfferings:[{city:'Garibaldi',state:'OR',kind:'species',value:'Halibut'}]},
 ];
 const filters={state:'All',sourceZone:'All areas',advertisedWater:'All advertised waters',query:'Garibaldi albacore'};
 assert.deepEqual(Array.from(query.filterDirectoryEntries(entries,filters),entry=>entry.id),['OG.0000047']);
 assert.deepEqual(Array.from(query.filterDirectoryEntries(entries,{...filters,query:'albacore Garibaldi',species:'Tuna'}),entry=>entry.id),['OG.0000047']);
 assert.equal(query.filterDirectoryEntries(entries,{...filters,species:'Halibut'}).length,0);
 assert.equal(query.filterDirectoryEntries(entries,{...filters,query:'Newport tuna'},['Newport']).length,0);
});
test('Charleston search aliases preserve Betty Kay’s generic tuna evidence and Mariner’s separate scope',()=>{
 const ids=new Set(['OG.0002615','OG.0002656']);
 const rows=approvedAttributes(JSON.parse(read('lib/approved-guide-attributes.json')),ids);
 const betty=rows.filter(row=>row.guide_id==='OG.0002615');
 const mariner=rows.filter(row=>row.guide_id==='OG.0002656');
 assert.equal(betty.length,3);
 assert.ok(betty.every(row=>row.offering_scope==='operator_business'&&row.location.city==='Charleston'&&row.location.aliases.includes('Coos Bay')));
 assert.equal(mariner.length,1);
 assert.equal(mariner[0].offering_scope,undefined);
 assert.equal(mariner[0].value,'Bottom fishing');
 const entry={id:'OG.0002615',name:'Kurt Smith',states:['Oregon'],areas:[],advertisedWaters:[],searchAliases:[],
  advertisedSpecies:['Tuna','Halibut'],advertisedMethods:['Bottom fishing'],
  locatedOfferings:betty.map(row=>({...row.location,kind:row.kind,value:row.value}))};
 const filters={state:'All',sourceZone:'All areas',advertisedWater:'All advertised waters'};
 assert.equal(query.filterDirectoryEntries([entry],{...filters,query:'Coos Bay tuna'}).length,1);
 assert.equal(query.filterDirectoryEntries([entry],{...filters,query:'tuna Charleston Harbor'}).length,1);
 assert.equal(query.filterDirectoryEntries([entry],{...filters,query:'Charleston albacore'}).length,0);
});
test('production dataset is separate from pending research',()=>{
 assert.ok(Array.isArray(JSON.parse(read('lib/approved-guide-attributes.json'))));
 for(const path of ['lib/guide-attributes-server.ts','lib/directory.ts','components/GuideEnrichmentPanel.tsx'])assert.doesNotMatch(read(path),/BATCH13_EXTENDED_PROPOSAL|BATCH13_SOURCE_REVIEW/);
});

test('method catalog stays selectable without coverage and approved fixtures populate species',async()=>{
 const React=(await import('react')).default;
 const {renderToStaticMarkup}=await import('react-dom/server');
 const {createRequire}=await import('node:module');
 const requireNode=createRequire(import.meta.url);
 const recovery=load('lib/directory-recovery.ts',{'./directory-query':query,'./directory-url':url});
 const charters=load('lib/charter-offerings.ts',{'./directory-query':query});
 const canonical=load('lib/canonical-share.ts');
 const emptyState={};
 vm.runInNewContext(ts.transpileModule(read('components/DirectoryEmptyState.tsx'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports:emptyState,require:name=>name==='@/lib/directory-recovery'?recovery:name.endsWith('.module.css')?{}:requireNode(name)});
 const exports={};
 const js=ts.transpileModule(read('components/UnifiedSearch.tsx'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(js,{exports,require:name=>name==='@/lib/directory-url'?url:name==='@/lib/directory-query'?query:name==='@/lib/charter-offerings'?charters:name==='@/lib/canonical-share'?canonical:name==='./DirectoryEmptyState'?emptyState:requireNode(name)});
 const base={id:'OG.0000047',name:'Example',business:null,states:['Oregon'],areas:[],advertisedWaters:[],searchAliases:[],href:'/guides/example',source:'Oregon registry'};
 const empty=renderToStaticMarkup(React.createElement(exports.default,{entries:[base]}));
 assert.doesNotMatch(empty,/>Species/);
 assert.match(empty,/<optgroup label="Methods">/);assert.match(empty,/<optgroup label="Gear">/);
 assert.match(empty,/>1 captain listing</);
 const present=renderToStaticMarkup(React.createElement(exports.default,{entries:[{...base,advertisedSpecies:['Salmon'],advertisedMethods:['Fly fishing']}]}));
 assert.match(present,/>Species/);assert.match(present,/Fishing methods/);
});

test('next-ten pending candidates never reach the public loader',()=>{
 const pending=JSON.parse(read('docs/research/BATCH13_NEXT10_PENDING_CANDIDATES.json'));
 const ids=new Set(pending.attributes.map(x=>x.guide_id));
 assert.equal(pending.attributes.length,44);
 assert.ok(pending.attributes.every(x=>x.editorial_status==='pending'&&x.publication_approved===false));
 assert.equal(approvedAttributes(pending.attributes,ids).length,0);
 const waters=JSON.parse(read('docs/research/BATCH13_NEXT10_PENDING_WATERS.json')).waters;
 assert.equal(waters.length,13);assert.ok(waters.every(x=>!('kind' in x)&&x.editorial_status==='pending'&&x.publication_approved===false));
 assert.equal(approvedAttributes(waters,ids).length,0);
});

test('freshwater aliases expand broad categories in one direction only',()=>{
 for(const [term,labels,expected] of [
  ['tiger muskellunge',['Tiger muskie'],true],['musky',['Tiger muskie'],true],
  ['stripers',['Striped bass'],true],['freshwater bass',['Smallmouth bass'],true],
  ['bass',['Striped bass'],false],['smallmouth',['Bass'],false],
  ['trout',['Cutthroat trout'],true],['trout',['Steelhead'],false],['brown trout',['Trout'],false],
  ['steelhead trout',['Steelhead'],true],
  ['crab fishing',['Crabbing'],true],['crabbing',['Bottom fishing'],false],
 ]){
  assert.equal(query.matchesFisherySearch(term,labels),expected,term);
 }
});

test('freshwater evidence keeps scoped waters, original identities and participant-only observations',()=>{
 const raw=JSON.parse(read('lib/approved-guide-attributes.json'));
 const ids=new Set(['OG.0002254','OG.0003452','OG.0002472','OG.0002193','OG.0000315','OG.0002459','OG.0003297','OG.0000607',
  'OG.0001035','OG.0003166','OG.0000581','OG.0000359','wa-152']);
 const rows=approvedAttributes(raw,ids);
 const participant=rows.find(r=>r.guide_id==='OG.0000607'&&r.evidence_scope==='participant_reports');
 assert.equal(approvedAttributes([{...participant,trip_note:undefined}],ids).length,0);
 assert.equal(approvedAttributes([{...participant,fishery_jurisdiction:'WA'}],ids).length,0);
 const muskie=rows.find(r=>r.guide_id==='OG.0001035'&&r.value==='Tiger muskie');
 assert.equal(approvedAttributes([{...muskie,fishery_jurisdiction:'BC'}],ids).length,0);

 for(const id of ids)assert.ok(rows.some(row=>row.guide_id===id),id);
 const has=(id,label,where)=>rows.some(r=>r.guide_id===id&&r.value===label&&(where===undefined||r.relationship?.waterway===where||r.location?.city===where));
 assert.ok(has('OG.0002254','Steelhead'));
 assert.ok(has('OG.0003452','Steelhead'));
 assert.ok(has('OG.0000315','Crabbing','Hammond'));
 assert.ok(has('OG.0002193','Crabbing','Garibaldi'));
 assert.ok(has('OG.0002459','Crabbing','Pacific City'));
 assert.ok(has('OG.0000581','Striped bass','Coquille River'));
 assert.ok(has('wa-152','Smallmouth bass','Banks Lake'));
 assert.ok(has('wa-152','Largemouth bass','Potholes Reservoir'));
 assert.ok(has('wa-152','Trout','Lake Lenore'));
 assert.equal(has('OG.0000359','Striped bass'),false);
 assert.equal(has('OG.0002472','Crabbing'),false);
 assert.ok(rows.some(r=>r.guide_id==='OG.0002472'&&r.kind==='method'&&/crab/i.test(r.trip_note??'')));
 assert.ok(rows.some(r=>r.guide_id==='OG.0000607'&&r.evidence_scope==='participant_reports'));
 assert.ok(rows.some(r=>r.guide_id==='OG.0003297'&&r.evidence_scope==='participant_reports'));

 const base={areas:[],searchAliases:[],advertisedMethods:[],advertisedTrips:[]};
 const entries=[['OG.0001035','Oregon'],['wa-152','Washington']].map(([id,state])=>{
  const facts=rows.filter(r=>r.guide_id===id&&r.kind==='species');
  return {...base,id,name:id,states:[state],advertisedSpecies:facts.map(r=>r.value),
   advertisedWaters:facts.flatMap(r=>r.relationship?.waterway?[r.relationship.waterway]:[]),
   fisheryOfferings:facts.map(r=>({state:r.fishery_jurisdiction,kind:r.kind,value:r.value,relationship:r.relationship}))};
 });
 const filters={state:'Washington',sourceZone:'All areas',advertisedWater:'All advertised waters',query:'musky'};
 const found=(patch={})=>Array.from(query.filterDirectoryEntries(entries,{...filters,...patch}),entry=>entry.id);
 assert.deepEqual(found(),['OG.0001035','wa-152']);
 assert.deepEqual(found({identityOnly:true}),['wa-152']);
 assert.deepEqual(found({state:'Oregon'}),[]);
 assert.deepEqual(found({query:'Evergreen Reservoir musky'}),['wa-152']);
 assert.deepEqual(found({query:'Evergreen Reservoir trout'}),[]);
 assert.deepEqual(found({query:'',advertisedWater:'Evergreen Reservoir',species:'Trout'}),[]);
 assert.deepEqual(found({query:'',advertisedWater:'Lake Lenore',species:'Trout'}),['wa-152']);
 assert.equal(url.parseDirectoryState('?state=Washington&species=Tiger+muskellunge',entries).species,'Tiger muskie');
});

test('Lost Creek has one charter-only muskie listing with named waters and a separate business base',()=>{
 const {charterOfferings}=load('lib/charter-offerings-server.ts',{
  './approved-charter-offerings.json':JSON.parse(read('lib/approved-charter-offerings.json')),'./guide-attributes':evidence
 });
 const {filterCharterOfferings}=load('lib/charter-offerings.ts',{'./directory-query':query});
 const find=term=>filterCharterOfferings(charterOfferings,{...url.DEFAULT_DIRECTORY_STATE,state:'Washington',query:term});
 for(const term of ['musky','Lake Mayfield tiger muskie','Lake Merwin muskellunge','Lake Tapps muskie']){
  const matches=find(term);
  assert.equal(matches.length,1,term);
  assert.equal(matches[0].namedGuide,'Mike Sturza');
  assert.equal(matches[0].operatorBaseOnly,true);
  assert.equal(matches[0].guideId,undefined);
 }
 assert.equal(find('Onalaska tiger muskie').length,0);
});

test('American shad is directly sourced without turning bait use or other fisheries into shad trips',()=>{
 const ids=new Set(['OG.0000785','OG.0001660','OG.0000315']);
 const raw=JSON.parse(read('lib/approved-guide-attributes.json'));
 const rows=approvedAttributes(raw,ids).filter(fact=>fact.value==='American shad');
 assert.equal(rows.length,3);
 assert.ok(rows.every(row=>row.evidence_scope==='operator_advertises'));
 assert.equal(query.matchesFisherySearch('shad',['American shad']),true);
 assert.equal(query.matchesFisherySearch('shad',['Sturgeon']),false);
 assert.equal(query.matchesFisherySearch('squid jigging',['Bottom fishing']),false);
});

test('method and gear catalog choices require a sourced method even when an alias matches a name or target',()=>{
 const base={business:null,states:['Oregon'],areas:[],advertisedWaters:[],searchAliases:[]};
 const guides=[
  {...base,id:'og-test-1',name:'Rigging Outfit',advertisedMethods:['Trolling','Jigging','Electric reels','Downrigger','Automatic pot puller','Spey casting']},
  {...base,id:'og-test-2',name:'Electric Reels',advertisedSpecies:['Squid'],advertisedTrips:['Jigging']},
  {...base,id:'og-test-3',name:'Crab Pots',advertisedMethods:['Crabbing','Squid jigging','Crab ring fishing']},
 ];
 const charters=load('lib/charter-offerings.ts',{'./directory-query':query});
 const offer={operator:'Fixture',state:'Oregon',city:'Newport',sourceUrl:'https://example.com/'};
 const charterRows=[{...offer,method:'Automatic pot puller'},{...offer,operator:'Electric pot pullers',species:'Crab'}];
 const filters={state:'All',sourceZone:'All areas',advertisedWater:'All advertised waters',query:''};
 const ids=rows=>Array.from(rows,row=>row.id);
 const groups=query.directoryMethodGroups(['Electric reels','Spey casting','Crabbing','Trolling']);
 assert.ok(groups.methods.includes('Spey casting')&&groups.methods.includes('Crabbing'));
 assert.equal(groups.methods.filter(x=>x==='Trolling').length,1);
 assert.ok(groups.gear.includes('Electric fishing reels')&&!groups.methods.includes('Electric reels'));
 for(const [alias,canonical] of [
  ['on the troll','Trolling'],['jig fishing','Jigging'],['power-assist reels','Electric fishing reels'],
  ['down rigger','Downriggers'],['automatic pot pullers','Electric pot pullers'],
 ]){
  assert.deepEqual(ids(query.filterDirectoryEntries(guides,{...filters,query:alias})),['og-test-1'],alias);
  const parsed=url.parseDirectoryState('?method='+encodeURIComponent(alias),guides);
  assert.equal(parsed.method,canonical);
  assert.equal(url.parseDirectoryState(url.directoryUrl(parsed).split('?')[1],guides).method,canonical);
  assert.deepEqual(ids(query.filterDirectoryEntries(guides,{...filters,method:parsed.method})),['og-test-1']);
 }
 for(const term of ['electric downrigger','crab pots','Crab rings']){
  const parsed=url.parseDirectoryState('?method='+encodeURIComponent(term),guides);
  assert.notEqual(parsed.method,'All methods');
  assert.equal(query.filterDirectoryEntries(guides,{...filters,method:parsed.method}).length,0);
  assert.equal(query.filterDirectoryEntries(guides,{...filters,query:term}).length,0);
 }
 const scopedGuide={...guides[0],advertisedWaters:['Fixture Lake','Fixture River','Other Lake'],fisheryOfferings:[
  {kind:'method',value:'Downrigger',state:'OR',relationship:{waterway:'Fixture Lake'}},
  {kind:'method',value:'Trolling',state:'OR',relationship:{waterway:'Fixture River'}},
 ]};
 for(const selection of [{query:'down rigger'},{method:'Downriggers'}]){
  assert.deepEqual(ids(query.filterDirectoryEntries([scopedGuide],{...filters,...selection,advertisedWater:'Fixture Lake'})),['og-test-1']);
  assert.equal(query.filterDirectoryEntries([scopedGuide],{...filters,...selection,advertisedWater:'Fixture River'}).length,0);
  assert.equal(query.filterDirectoryEntries([scopedGuide],{...filters,...selection,advertisedWater:'Other Lake'}).length,0);
 }
 assert.equal(url.parseDirectoryState('?method=unrecognized-gear',guides).method,'All methods');
 assert.equal(url.parseDirectoryState('?method=Spey+casting',guides).method,'Spey casting');
 const selected=url.parseDirectoryState('?method=electric+pot+puller',guides,charterRows);
 assert.equal(charters.filterCharterOfferings(charterRows,selected).length,1);
 assert.equal(charters.filterCharterOfferings(charterRows,{...url.DEFAULT_DIRECTORY_STATE,query:'automatic pot puller'})[0]?.method,'Automatic pot puller');
 const squid=[{...offer,operator:'Tengu Charters',city:'Edmonds',state:'Washington',species:'Squid'}];
 for(const query of ['squid jigging','Edmonds squid jigging','Edmonds squidding']){
  assert.equal(charters.filterCharterOfferings(squid,{...url.DEFAULT_DIRECTORY_STATE,query}).length,1,query);
  const selected=url.parseDirectoryState('?q='+encodeURIComponent(query)+'&method=Squid+jigging',[],squid);
  assert.equal(selected.method,'Squid jigging');
  assert.equal(charters.filterCharterOfferings(squid,selected).length,0,query);
 }
});

test('regional filter menu stays small and retains exact selections from existing URLs',()=>{
 const labels=query.directorySpeciesLabels(['Canary rockfish','Albacore tuna','Coho Salmon','White sturgeon','Burbot','Squid']);
 const menu=query.directorySpeciesMenu(labels,'Albacore tuna');
 const displayed=Array.from(menu.groups).flatMap(group=>Array.from(group.choices));
 assert.deepEqual(displayed,['Sturgeon','Tuna','Rockfish','Squid']);
 assert.equal(menu.selectedOnly,true);
 assert.equal(query.directorySpeciesMenu(labels,'Canary rockfish').selectedOnly,true);
 assert.equal(query.directorySpeciesMenu(labels,'American shad').selectedOnly,false);
 assert.equal(query.directorySpeciesMenu([], 'All species').groups.length,0);
 const entry={id:'wa-100',name:'Example',business:null,states:['Washington'],areas:[],advertisedWaters:[],searchAliases:[],
  advertisedSpecies:['Albacore tuna','Coho Salmon']};
 for(const [queryString,expected] of [['Albacore+tuna','Albacore tuna'],['Coho+Salmon','Coho Salmon']]){
  const selection=url.parseDirectoryState('?state=Washington&species='+queryString,[entry]);
  assert.equal(selection.species,expected);
  assert.match(url.directoryUrl(selection),new RegExp('species='+queryString.replace('+','\\+')));
 }
});

test('named regional targets never inherit broad claims, other targets or methods',()=>{
 for(const [term,labels,expected] of [
  ['rockfish',['Black rockfish'],true],['canary rockfish',['Rockfish'],false],
  ['rockfish',['Lingcod','Bottom fishing','Halibut'],false],['ling cod',['Rockfish'],false],
  ['groundfish',['Bottom fishing'],true],['bottom fishing',['Rockfish','Lingcod'],false],
  ['wiper',['Striped bass'],false],['lake whitefish',['Mountain whitefish'],false],
  ['razor clamming',['Clamming'],false],['spot prawns',['Shrimping'],false],
  ['shrimping',['Spot shrimp'],true],['black cod',['Pacific cod'],false],
  ['red-tailed surfperch',['Surfperch'],false],['Surf perch',['Redtail surfperch'],true],
  ['white sturgeon',['Sturgeon'],false],['sturgeon',['White sturgeon'],true],
  ['silver salmon',['Salmon'],false],['king salmon',['Chinook salmon'],true],
  ['kokanee',['Sockeye Salmon'],false],['squid jigging',['Flounder','Crabbing'],false],
 ]){
  assert.equal(query.matchesFisherySearch(term,labels),expected,term);
 }
});

test('the sourced EJ alias binds to the existing Big Energy profile without introducing a fishing fact',()=>{
 const raw=JSON.parse(read('lib/approved-guide-attributes.json'));
 const facts=approvedAttributes(raw,new Set(['OG.0004049']));
 assert.equal(facts.length,1);
 assert.equal(facts[0].kind,'person_name');
 assert.equal(facts[0].value,'EJ');
 assert.equal(facts[0].source.url,'https://bigenergy.fishing/meet-your-guide');
});
