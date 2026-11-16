import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=p=>readFileSync(p,'utf8');
function load(path,dependencies={}){
 const exports={};
 const js=ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
 vm.runInNewContext(js,{exports,URL,URLSearchParams,Date,Set,Map,require:name=>{if(dependencies[name])return dependencies[name];throw Error(name)}});
 return exports;
}
const {approvedAttributes}=load('lib/guide-attributes.ts',{'./guide-evidence-holds.json':JSON.parse(read('lib/guide-evidence-holds.json'))});
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
 const emptyState={};
 vm.runInNewContext(ts.transpileModule(read('components/DirectoryEmptyState.tsx'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports:emptyState,require:name=>name==='@/lib/directory-recovery'?recovery:name.endsWith('.module.css')?{}:requireNode(name)});
 const exports={};
 const js=ts.transpileModule(read('components/UnifiedSearch.tsx'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(js,{exports,require:name=>name==='@/lib/directory-url'?url:name==='@/lib/directory-query'?query:name==='./DirectoryEmptyState'?emptyState:requireNode(name)});
 const base={id:'OG.0000047',name:'Example',business:null,states:['Oregon'],areas:[],advertisedWaters:[],searchAliases:[],href:'/guides/example',source:'Oregon registry'};
 const empty=renderToStaticMarkup(React.createElement(exports.default,{entries:[base]}));
 assert.doesNotMatch(empty,/Source-listed species|Source-listed fishing method/);
 const present=renderToStaticMarkup(React.createElement(exports.default,{entries:[{...base,advertisedSpecies:['Salmon'],advertisedMethods:['Fly fishing']}]}));
 assert.match(present,/Source-listed species/);assert.match(present,/Source-listed fishing method/);
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
