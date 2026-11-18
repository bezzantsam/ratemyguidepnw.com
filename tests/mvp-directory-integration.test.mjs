import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=p=>readFileSync(p,'utf8');
const exports={};
vm.runInNewContext(ts.transpileModule(read('lib/directory-query.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports});
const filter=exports.filterDirectoryEntries;
const all={state:'All',sourceZone:'All areas',advertisedWater:'All advertised waters',query:''};
const rows=[
 {id:'wa-001',name:'William Example',business:'River Outfit',states:['Washington'],areas:['Coastal'],advertisedWaters:['Columbia River'],searchAliases:['River Outfitters']},
 {id:'wa-002',name:'Robert Example',business:'Other Outfit',states:['Washington'],areas:['Inland'],advertisedWaters:[],searchAliases:[]},
 {id:'OG.0000010',name:'Oregon Guide',business:null,states:['Oregon'],areas:['Coastal'],advertisedWaters:[],searchAliases:[]},
];
const ids=(f)=>Array.from(filter(rows,{...all,...f}),x=>x.id);
test('directory introduction does not promise cross-state deduplication',()=>{
 const source=read('app/guides/page.tsx');
 assert.match(source,/Oregon and Washington guide listings/);
 assert.doesNotMatch(source,/shared captains appear once/i);
});
test('nickname, aliases and water searches select the intended guide',()=>{
 assert.deepEqual(ids({query:'billy example'}),['wa-001']);
 assert.deepEqual(ids({query:'River Outfitters'}),['wa-001']);
 assert.deepEqual(ids({advertisedWater:'Columbia River'}),['wa-001']);
});
test('state and historical location filters intersect; identifiers never fuzzy match',()=>{
 assert.deepEqual(ids({state:'Oregon',sourceZone:'Coastal'}),['OG.0000010']);
 assert.deepEqual(ids({query:'wa-003'}),[]);
 assert.deepEqual(ids({state:'Washington',sourceZone:'Inland'}),['wa-002']);
});
test('public water claims have dated HTTPS provenance and resolve to directory records',()=>{
 const data=JSON.parse(read('lib/guide-enrichment.json'));
 const ids=new Set([...JSON.parse(read('lib/oregon-guides.json')).map(r=>r.registration),...Object.values(JSON.parse(read('lib/washington-stable-ids.json')))]);
 assert.ok(Object.keys(data).length>0);
 for(const [id,entry] of Object.entries(data)){
  assert.ok(ids.has(id),id);
  assert.deepEqual(entry.searchAliases,[]);
  for(const water of entry.advertisedWaters){
   const url=new URL(water.sourceUrl);assert.equal(url.protocol,'https:');assert.equal(url.username,'');assert.equal(url.password,'');
   assert.match(water.observedOn,/^\d{4}-\d{2}-\d{2}$/);
   assert.ok(['operator_site','third_party_directory'].includes(water.sourceType));
  }
 }
});
test('the public data loader does not import research queues',()=>{
 const source=read('lib/guide-enrichment.ts');
 assert.doesNotMatch(source,/research|batch13|pendingEntities/i);
 assert.match(read('components/GuideEnrichmentPanel.tsx'),/sourceUrl/);
});

function loadUrl(){
 const exports={};
 const query={};
 vm.runInNewContext(ts.transpileModule(read('lib/directory-query.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:query});
 vm.runInNewContext(ts.transpileModule(read('lib/directory-url.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,URL,URLSearchParams,require:name=>{if(name==='./directory-query')return query;throw new Error(name)}});
 return exports;
}
test('directory URL state handles duplicates, obsolete filters and out of range pages',()=>{
 const {parseDirectoryState,directoryUrl}=loadUrl();
 const parsed=parseDirectoryState('?state=Washington&area=Coastal&water=Columbia+River&page=999&q=william',rows);
 assert.equal(parsed.page,1);assert.equal(parsed.area,'Coastal');assert.equal(parsed.waterway,'Columbia River');
 assert.match(directoryUrl(parsed),/^\/guides\?/);
 const invalid=parseDirectoryState('?state=Oregon&state=Washington&area=unknown&water=unknown&page=-4&q=a&q=b',rows);
 assert.equal(invalid.state,'All');assert.equal(invalid.query,'');assert.equal(invalid.area,'All areas');assert.equal(invalid.waterway,'All advertised waters');assert.equal(invalid.page,1);
 const incompatible=parseDirectoryState('?state=Oregon&water=Columbia+River',rows);
 assert.equal(incompatible.waterway,'All advertised waters');
 assert.equal(parseDirectoryState('?q='+('x'.repeat(2050)),rows).query,'');
});
test('return paths reject external, ambiguous and malformed URLs',()=>{
 const {safeDirectoryReturn}=loadUrl();
 assert.equal(safeDirectoryReturn('/guides?state=Oregon&page=2'),'/guides?state=Oregon&page=2');
 for(const value of ['//evil.test/guides','https://evil.test/guides','/guides/../admin','/guides?state=Oregon&state=Washington','/guides?next=https://evil.test','/guides#x','/guides\\evil'])assert.equal(safeDirectoryReturn(value),'/guides');
});

// Load the actual directory graph, including the production registry and corrections.
// A second instance with no corrections gives a before/after identity baseline.
function actualDirectory(withCorrections=true){
 const modules=new Map();
 const json=path=>JSON.parse(read(path));
 function load(path){
  if(modules.has(path))return modules.get(path).exports;
  if(path.endsWith('.json'))return path==='lib/editorial-guide-corrections.json'&&!withCorrections?[]:json(path);
  const module={exports:{}};modules.set(path,module);
  const js=ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
  vm.runInNewContext(js,{module,exports:module.exports,URL,URLSearchParams,Date,Set,Map,require:name=>{
   if(!name.startsWith('./'))throw new Error('unexpected dependency '+name);
   let next='lib/'+name.slice(2);
   if(!next.endsWith('.json'))next+='.ts';
   return load(next);
  }});
  return module.exports;
 }
 return {directory:load('lib/directory.ts'),editorial:load('lib/editorial-guide-corrections.ts'),url:load('lib/directory-url.ts')};
}
const plain=x=>JSON.parse(JSON.stringify(x));
test('Sam’s corrections find the existing Rowe, Menefee and Wolfe records',()=>{
 const {directory,url}=actualDirectory();
 const entries=directory.directoryEntries;
 const matches=options=>Array.from(filter(entries,{...all,...options}),x=>x.id);
 const walter=directory.getDirectoryEntry('OG.0003297');
 const dre=directory.getDirectoryEntry('OG.0003348');
 const scott=directory.getDirectoryEntry('OG.0000359');
 const toby=directory.getDirectoryEntry('OG.0001200');
 assert.equal(walter.name,'Walter Rowe');assert.equal(walter.business,'Reel Time Fishing Adventures');
 assert.equal(walter.href,'/guides/og-0003297');
 assert.equal(dre.name,'Keondre Menefee');assert.equal(dre.business,'Valley Coast Outdoors');
 assert.equal(dre.href,'/guides/og-0003348');
 assert.equal(scott.name,'Douglas Wolfe');assert.equal(scott.business,'Douglas Scott Wolfe LLC');
 assert.equal(scott.href,'/guides/og-0000359');
 assert.equal(toby.name,'Toby Wyatt');assert.equal(toby.business,'Reel Time Fishing LLC');
 for(const query of ['halibut','HALIBUT','HaLiBuT'])assert.equal(matches({query}).filter(id=>id===walter.id).length,1,query);
 for(const query of ['Dre','dre','DRE MENEFEE','Dre Menefee','Keondre','Keondre Menefee'])assert.equal(matches({query}).filter(id=>id===dre.id).length,1,query);
 for(const query of ['Scott','Scott Wolfe','Douglas Wolfe','Scott Coos','Scott Coquille','Scott Umpqua'])assert.equal(matches({query}).filter(id=>id===scott.id).length,1,query);
 for(const sourceZone of ['Coos-Coquille','Umpqua'])assert.equal(matches({query:'Scott Wolfe',state:'Oregon',sourceZone}).filter(id=>id===scott.id).length,1,sourceZone);
 assert.equal(matches({query:'Scott Wolfe',state:'Washington'}).includes(scott.id),false);
 assert.equal(matches({query:'Dre Menefee'}).includes(walter.id),false);
 assert.equal(matches({query:'Halibut',state:'Oregon'}).includes(toby.id),false);
 assert.equal(matches({species:'Halibut',state:'Oregon'}).filter(id=>id===walter.id).length,1);
 assert.equal(matches({species:'Halibut',state:'Oregon'}).includes(toby.id),false);
 assert.equal(matches({species:'Halibut',state:'Washington'}).includes(walter.id),false);
 assert.equal(url.parseDirectoryState('?state=Oregon&species=Halibut',entries).species,'Halibut');
 assert.equal(url.parseDirectoryState('?state=Washington&species=Halibut',entries).species,'All species');
});

test('editorial corrections preserve all original profiles, IDs, fields and unrelated attributes',()=>{
 const before=actualDirectory(false).directory.directoryEntries;
 const after=actualDirectory(true).directory.directoryEntries;
 assert.equal(after.length,before.length);
 assert.equal(new Set(Array.from(after,x=>x.id)).size,after.length);
 for(let i=0;i<before.length;i++){
  const original=plain(before[i]),updated=plain(after[i]);
  if(original.id==='OG.0003297'){
   assert.deepEqual(updated.advertisedSpecies,[...original.advertisedSpecies,'Halibut']);
   updated.advertisedSpecies=original.advertisedSpecies;
  }
  if(original.id==='OG.0003348'){
   assert.deepEqual(updated.searchAliases,[...original.searchAliases,'Dre Menefee']);
   assert.deepEqual(updated.editorialSearchAliases,[{value:'Dre Menefee',attributedTo:'Sam'}]);
   delete updated.editorialSearchAliases;
   updated.searchAliases=original.searchAliases;
  }
  if(original.id==='OG.0000359'){
   assert.deepEqual(updated.searchAliases,[...original.searchAliases,'Scott Wolfe']);
   assert.deepEqual(updated.editorialSearchAliases,[{value:'Scott Wolfe',attributedTo:'Sam'}]);
   delete updated.editorialSearchAliases;
   updated.searchAliases=original.searchAliases;
  }
  assert.deepEqual(updated,original,original.id);
 }
});

test('editorial attribution and exact identity binding fail closed',()=>{
 const {editorial,directory}=actualDirectory();
 const facts=JSON.parse(read('lib/editorial-guide-corrections.json'));
 assert.equal(facts.length,3);
 for(const fact of facts){
  assert.equal(fact.provenance.type,'user_editorial');assert.equal(fact.provenance.attributed_to,'Sam');
  assert.equal(fact.provenance.recorded_on,fact.guide_id==='OG.0000359'?'2026-11-18':'2026-11-17');
  assert.match(fact.provenance.reference,fact.guide_id==='OG.0000359'?/\/issues\/124$/:/docs\/editorial\/guide-search-corrections-20261117\.md$/);
  assert.equal('url' in fact.provenance,false,'no operator URL is invented');
  const guide=directory.getDirectoryEntry(fact.guide_id);
  assert.equal(editorial.editorialGuideCorrections(guide,[fact]).length,1);
  for(const changed of [
   {...fact,guide_id:'OG.9999999'}, {...fact,expected_name:'Another Person'},
   {...fact,expected_business:'Another Business'}, {...fact,status:'pending'},
   {...fact,kind:'method'}, {...fact,provenance:{...fact.provenance,type:'operator_site'}},
   {...fact,provenance:{...fact.provenance,attributed_to:''}},
   {...fact,provenance:{...fact.provenance,recorded_on:'2026-02-30'}},
   {...fact,provenance:{...fact.provenance,reference:'https://operator.example/'}},
  ])assert.equal(editorial.editorialGuideCorrections(guide,[changed]).length,0);
 }
 assert.equal(editorial.editorialGuideCorrections({id:'OG.0001200',name:'Toby Wyatt',business:'Reel Time Fishing LLC'},facts).length,0);
});
