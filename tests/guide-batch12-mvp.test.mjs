import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=(path)=>readFileSync(path,'utf8');
const directory=JSON.parse(read('lib/oregon-guides.json'));
const enrichment=JSON.parse(read('lib/guide-enrichment.json'));
const prior=JSON.parse(read('docs/research/OREGON_NEXT_100_REVIEW_2026_11_15.json'));
const batch=JSON.parse(read('docs/research/OREGON_BATCH_12_100_REVIEW.json'));
test('Batch 12 never repeats already enriched or previous review assignments',()=>{
 assert.equal(batch.records.length,100);
 assert.equal(new Set(batch.records.map(r=>r.directory_id)).size,100);
 assert.equal(batch.selection.baseline_enriched_count,194);
 assert.equal(batch.counts.source_inspected,19);
 assert.equal(batch.counts.registry_only,81);
 assert.equal(Object.keys(enrichment).length,213);
 const existing=new Set(prior.records.map(x=>x.directory_id));
 const imported=new Map(directory.map(x=>[x.registration,x]));
 for(const r of batch.records){
  assert.ok(!existing.has(r.directory_id),'duplicate from Batch 11: '+r.directory_id);
  const source=imported.get(r.directory_id);
  assert.ok(source,'unknown imported ID '+r.directory_id);
  assert.equal(source.name,r.imported_person);
  assert.equal(source.business,r.imported_business);
  assert.equal(source.website,r.imported_website);
  assert.equal(source.activity,r.imported_activities);
  assert.equal(r.publication_status,'draft_review_only');
 }
});
test('Only 19 inspected business sources become enrichment entries; 81 URLs stay unpublished',()=>{
 let inspected=0,held=0,waters=0;
 for(const row of batch.records){
  const e=enrichment[row.directory_id];
  if(row.source_status==='registry_candidate_unverified'){
    held++;
    assert.equal(row.source_url,null);
    assert.equal(row.source_type,null);
    assert.equal(row.observed_on,null);
    assert.deepEqual(row.proposed_advertised_waters,[]);
    assert.equal(e,undefined,'Unverified registry URL leaked into source enrichment: '+row.directory_id);
  }else{
    inspected++;
    assert.equal(row.source_status,'inspected_public_source_pending_editorial');
    assert.equal(row.observed_on,'2026-11-15');
    assert.match(row.source_url,/^https:\/\//);
    assert.ok(['operator_site','third_party_directory'].includes(row.source_type));
    assert.ok(e,'Missing inspected source '+row.directory_id);
    assert.deepEqual(e.searchAliases,[],'Do not invent identity aliases');
    assert.equal(e.sourceLinks.length,1);
    assert.equal(e.sourceLinks[0].url,row.source_url);
    assert.equal(e.sourceLinks[0].sourceType,row.source_type);
    assert.equal(e.sourceLinks[0].observedOn,'2026-11-15');
    assert.deepEqual(e.advertisedWaters.map(x=>x.name),row.proposed_advertised_waters);
    assert.equal(new Set(e.advertisedWaters.map(x=>x.name)).size,e.advertisedWaters.length);
    for(const w of e.advertisedWaters){
      waters++;
      assert.equal(w.sourceUrl,row.source_url);
      assert.equal(w.sourceType,row.source_type);
      assert.equal(w.observedOn,'2026-11-15');
    }
  }
 }
 assert.equal(inspected,19);
 assert.equal(held,81);
 assert.equal(waters,35);
});
function loadFilter(){
 const js=ts.transpileModule(read('lib/directory-query.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const exports={};vm.runInNewContext(js,{exports});return exports.filterDirectoryEntries;
}
test('The source-only discovery toggle is opt-in and filters by true source evidence',()=>{
 const f=loadFilter();
 const entries=[
  {id:'OG.0000001',name:'A Captain',business:'A Outfitter',states:['Oregon'],areas:['Lower Columbia River'],advertisedWaters:[],searchAliases:[],hasPublicSource:true},
  {id:'OG.0000002',name:'B Captain',business:'B Outfitter',states:['Oregon'],areas:['Lower Columbia River'],advertisedWaters:[],searchAliases:[],hasPublicSource:false}
 ];
 const base={state:'All',sourceZone:'All areas',advertisedWater:'All advertised waters',query:''};
 assert.equal(f(entries,base).length,2);
 assert.equal(f(entries,{...base,sourceLinkedOnly:false}).length,2);
 assert.deepEqual(Array.from(f(entries,{...base,sourceLinkedOnly:true}),x=>x.id),['OG.0000001']);
 assert.equal(f(entries,{...base,sourceLinkedOnly:true,query:'B Captain'}).length,0);
 const ui=read('components/UnifiedSearch.tsx');
 assert.match(ui,/Only show source-linked guide profiles/);
 assert.match(ui,/setSourceLinkedOnly/);
 assert.match(ui,/setPage\(1\)/);
 assert.match(read('lib/directory.ts'),/guideEnrichmentFor\(g\.registration\)/);
});
