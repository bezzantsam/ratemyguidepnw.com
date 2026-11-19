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
const query=load('lib/directory-query.ts');
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
 assert.equal(invalid.species,'All species');assert.equal(invalid.method,'All methods');
 assert.equal(url.parseDirectoryState('?species=Salmon&species=Chinook+Salmon',rows).species,'All species');
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
 assert.equal(charterOfferings.length,19);
 assert.equal(approvedCharterOfferings([{...raw[0],guide_id:'wa-122'}]).length,0);
 assert.equal(approvedCharterOfferings([{...raw[0],publication_approved:false}]).length,0);
 assert.equal(approvedCharterOfferings([{...raw[0],source:{...raw[0].source,url:'http://example.com'}}]).length,0);
 assert.ok(charterOfferings.every(offer=>!('guide_id' in offer)&&!('named_skipper' in offer)));
 const filters=url.DEFAULT_DIRECTORY_STATE;
 const find=(term,patch={})=>Array.from(filterCharterOfferings(charterOfferings,{...filters,...patch,query:term}),offer=>offer.operator);
 assert.deepEqual(find('black cod'),find('sablefish'));
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
 for (const held of ['Sekiu bottom fishing','Neah Bay albacore','Neah Bay black cod','La Push albacore','La Push tuna']) {
  assert.deepEqual(find(held),[],held);
 }
 assert.equal(url.parseDirectoryState('?state=Washington&method=Bottom+fishing',[],charterOfferings).method,'Bottom fishing');
 assert.equal(url.parseDirectoryState('?state=Oregon&species=Tuna',[],charterOfferings).species,'Tuna');
 assert.equal(approvedCharterOfferings([{...raw.find(row=>row.scope==='operator_team'),departure_source:undefined}]).length,0);
 assert.equal(url.parseDirectoryState('?state=Washington&species=Salmon&water=Buoy+10',[],charterOfferings).waterway,'Buoy 10');
 assert.equal(url.parseDirectoryState('?state=Washington&species=Sablefish+(black+cod)',[],charterOfferings).species,'Sablefish (black cod)');
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

test('empty approved coverage hides controls while approved fixtures render them',async()=>{
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
 assert.doesNotMatch(empty,/>Species|Fishing methods/);
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
