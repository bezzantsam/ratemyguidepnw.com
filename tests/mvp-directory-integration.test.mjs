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
