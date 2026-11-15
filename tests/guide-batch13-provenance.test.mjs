import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=p=>readFileSync(p,'utf8');
const directory=JSON.parse(read('lib/oregon-guides.json'));
const enrichment=JSON.parse(read('lib/guide-enrichment.json'));
const batch=JSON.parse(read('docs/research/OREGON_BATCH_13_100_WEBSITE_AND_SPECIES.json'));
const old11=JSON.parse(read('docs/research/OREGON_NEXT_100_REVIEW_2026_11_15.json'));
const old12=JSON.parse(read('docs/research/OREGON_BATCH_12_100_REVIEW.json'));
const imported=new Map(directory.map(x=>[x.registration,x]));
const previouslyReviewed=new Set([...old11.records,...old12.records].map(x=>x.directory_id));
test('Batch 13 has exactly 100 new real Oregon registration IDs and 100 historical website provenance records',()=>{
 assert.equal(batch.records.length,100);
 assert.equal(new Set(batch.records.map(x=>x.registration)).size,100);
 assert.equal(batch.counts.new_registry_website_profiles,100);
 for(const row of batch.records){
  assert.ok(!previouslyReviewed.has(row.registration),'Repeated earlier review: '+row.registration);
  const r=imported.get(row.registration);assert.ok(r,'Unknown Oregon ID '+row.registration);
  assert.equal(r.name,row.imported_name);assert.equal(r.business,row.imported_business);
  assert.equal(r.website,row.imported_website);assert.equal(r.activity,row.reported_activity);
  assert.ok(r.activity.includes('Fishing'));
  assert.equal(row.verificationStatus,'unverified_registry_reference');
  const e=enrichment[row.registration];assert.ok(e,'missing registry website entry '+row.registration);
  assert.deepEqual(e.searchAliases,[]);
  assert.equal(e.registryWebsite.sourceType,'oregon_registry_import');
  assert.equal(e.registryWebsite.verificationStatus,'unverified_registry_reference');
  assert.equal(e.registryWebsite.importedValue,row.imported_website);
  assert.equal(e.registryWebsite.url,row.registry_website_url);
  const u=new URL(e.registryWebsite.url);assert.equal(u.protocol,'https:');
  assert.equal(u.username,'');assert.equal(u.password,'');
  if(!row.additional_public_evidence){
   assert.deepEqual(e.advertisedWaters,[]);
   assert.equal(e.sourceLinks,undefined,'Historical registry URL falsely promoted to operator evidence');
   assert.equal(e.advertisedSpecies,undefined,'Invented fish species for raw registry URL');
   assert.equal(e.advertisedTechniques,undefined,'Invented technique from raw registry URL');
  }
 }
});
test('Every promoted previously held source must have independently documented public evidence',()=>{
 const promoted=new Set(batch.promoted_held_ids);
 assert.equal(promoted.size,batch.counts.promoted_from_prior_held);
 const researched=new Map(batch.publicSourceResearch.map(x=>[x.registration,x]));
 assert.equal(researched.size,batch.counts.public_evidence_profiles);
 for(const id of promoted){
  assert.ok(previouslyReviewed.has(id),'promotion was not earlier held: '+id);
  assert.ok(researched.has(id),'promotion lacks independent audit source');
 }
 for(const [id,s] of researched){
  assert.ok(imported.has(id),'unrecognized source ID '+id);
  assert.match(s.sourceUrl,/^https:\/\//);
  assert.ok(['operator_site','third_party_directory'].includes(s.sourceType));
  assert.equal(s.reviewStatus,'editorial_confirmation_required');
  const e=enrichment[id];assert.ok(e);
  assert.ok(e.sourceLinks.some(l=>l.url===s.sourceUrl&&l.sourceType===s.sourceType));
  for(const [field,expected] of [['advertisedSpecies',s.species],['advertisedTechniques',s.techniques],['advertisedTripTypes',s.tripTypes]]){
   const values=e[field]||[];assert.deepEqual(values.map(x=>x.name),expected,'incorrect '+field+' for '+id);
   assert.equal(new Set(values.map(x=>x.name.toLowerCase())).size,values.length);
   for(const tag of values){assert.equal(tag.sourceUrl,s.sourceUrl);assert.equal(tag.sourceType,s.sourceType);assert.equal(tag.observedOn,'2026-11-15');}
  }
  for(const name of s.waters)assert.ok(e.advertisedWaters.some(w=>w.name===name&&e.sourceLinks.some(link=>link.url===w.sourceUrl)),'unsupported or missing cited waterway '+id+' '+name);
 }
});
function filter(){const js=ts.transpileModule(read('lib/directory-query.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;const exports={};vm.runInNewContext(js,{exports});return exports.filterDirectoryEntries;}
test('Species and fishing method filters combine with name or business text, but ignore raw registry-only sites',()=>{
 const f=filter();const base={states:['Oregon'],areas:['Pacific Ocean'],advertisedWaters:[],searchAliases:[],advertisedTripTypes:[],href:'/guides/test',source:'Oregon registry'};
 const a={...base,id:'OG.0000001',name:'Alice Captain',business:'Coho Charter',advertisedSpecies:['Coho Salmon','Chinook Salmon'],advertisedTechniques:['Trolling'],hasPublicSource:true,hasRegistryWebsite:false};
 const b={...base,id:'OG.0000002',name:'Bob Captain',business:'Steelhead Spey',advertisedSpecies:['Steelhead'],advertisedTechniques:['Fly fishing','Spey casting'],hasPublicSource:true,hasRegistryWebsite:false};
 const c={...base,id:'OG.0000003',name:'Carol Captain',business:'Registry Only',advertisedSpecies:[],advertisedTechniques:[],hasPublicSource:false,hasRegistryWebsite:true};
 const all={state:'All',sourceZone:'All areas',advertisedWater:'All advertised waters',query:''};
 assert.equal(f([a,b,c],all).length,3);
 assert.deepEqual(Array.from(f([a,b,c],{...all,advertisedSpecies:'Steelhead',advertisedTechnique:'Spey casting'}),x=>x.id),['OG.0000002']);
 assert.equal(f([a,b,c],{...all,advertisedSpecies:'Steelhead',advertisedTechnique:'Trolling'}).length,0);
 assert.deepEqual(Array.from(f([a,b,c],{...all,query:'coho trolling'}),x=>x.id),['OG.0000001']);
 assert.deepEqual(Array.from(f([a,b,c],{...all,sourceLinkedOnly:true}),x=>x.id),['OG.0000001','OG.0000002']);
 assert.equal(f([a,b,c],{...all,advertisedSpecies:'Salmon'}).length,0,'exact species filter should not infer generic salmon');
 const ui=read('components/UnifiedSearch.tsx'),panel=read('components/GuideEnrichmentPanel.tsx');
 assert.match(ui,/Target species \(publicly advertised\)/);
 assert.match(ui,/Fishing method \(publicly advertised\)/);
 assert.match(panel,/historical registry reference has not been independently verified/);
 assert.match(panel,/SourcedTags/);
});
