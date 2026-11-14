import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read=path=>readFileSync(path,'utf8');
const imported=JSON.parse(read('lib/oregon-guides.json'));
const enriched=JSON.parse(read('lib/guide-enrichment.json'));
const known=new Set([...imported.map(row=>row.registration),...Object.values(JSON.parse(read('lib/washington-stable-ids.json')))]);

function loadQuery(){
 const source=read('lib/directory-query.ts');
 const js=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020
 }}).outputText;
 const exports={};
 vm.runInNewContext(js,{exports});
 return exports.filterDirectoryEntries;
}

test('all editorial enrichments match existing imported profiles',()=>{
 assert.ok(Object.keys(enriched).length > 0);
 for(const registration of Object.keys(enriched)){
  assert.ok(known.has(registration),'unknown registration '+registration);
  assert.match(registration,/^(OG\.\d{7}|wa-\d{3,})$/);
  assert.ok(Array.isArray(enriched[registration].searchAliases));
  assert.ok(enriched[registration].advertisedWaters.length > 0 || enriched[registration].searchAliases.length > 0);
 }
});

test('all advertised waters have HTTPS source citations and non-government source labels',()=>{
 for(const [registration,entry] of Object.entries(enriched)){
  assert.equal(new Set(entry.searchAliases.map(x=>x.toLowerCase())).size,entry.searchAliases.length,registration);
  assert.equal(new Set(entry.advertisedWaters.map(x=>x.name.toLowerCase())).size,entry.advertisedWaters.length,registration);
  for(const name of entry.searchAliases){
   assert.ok(name.trim().length>=3);
   assert.doesNotMatch(name,/verified|licensed|current/i);
  }
  for(const water of entry.advertisedWaters){
   assert.ok(water.name.trim().length>=4);
   const url=new URL(water.sourceUrl);
   assert.equal(url.protocol,'https:');
   assert.ok(['operator_site','third_party_directory'].includes(water.sourceType));
   assert.equal(url.username,'');
   assert.equal(url.password,'');
   assert.ok(url.hostname.length>5);
  }
 }
});

test('alias and independently linked waterways can be searched without mutating registration zones',()=>{
 const filter=loadQuery();
 const base={states:['Oregon'],areas:['Lower Columbia River','Pacific Ocean'],href:'/guides/og-0000093',source:'Oregon registry'};
 const records=[
  {...base,id:'OG.0000093',name:'Ryan Rosenbaum',business:'Rosenbaum Outfitters LLC',
   advertisedWaters:['Buoy 10','Clearwater River'],searchAliases:['R Outfitters']},
  {...base,id:'OG.0000294',name:'Barrett Ames',business:'Deschutes Scenic Adventures LLC',
   advertisedWaters:['Lower Deschutes River'],searchAliases:['Barrett Ames Fly Fishing']},
  {...base,id:'OG.0000315',name:'Marvin Henkel',business:"Marvin's Guide Service",
   advertisedWaters:['Buoy 10','Tillamook Bay'],searchAliases:['Fast Action Fishing']},
 ];
 const all={state:'All',sourceZone:'All areas',advertisedWater:'All advertised waters',query:''};
 assert.deepEqual(Array.from(filter(records,{...all,query:'r outfitters'}),x=>x.id),['OG.0000093']);
 assert.deepEqual(Array.from(filter(records,{...all,query:'barrett ames fly'}),x=>x.id),['OG.0000294']);
 assert.deepEqual(Array.from(filter(records,{...all,query:'fast action fishing'}),x=>x.id),['OG.0000315']);
 assert.deepEqual(Array.from(filter(records,{...all,advertisedWater:'Lower Deschutes River'}),x=>x.id),['OG.0000294']);
 assert.deepEqual(Array.from(filter(records,{...all,advertisedWater:'Buoy 10'}),x=>x.id),['OG.0000315','OG.0000093'].sort((a,b)=>{
  const names={'OG.0000315':'Marvin Henkel','OG.0000093':'Ryan Rosenbaum'};
  return names[a].localeCompare(names[b]);
 }));
 assert.equal(records[1].areas.includes('Lower Deschutes River'),false);
 assert.equal(records[1].areas.includes('Pacific Ocean'),true);
});

test('unknown records cannot inherit an advertised waterway from a broad registration zone',()=>{
 const f=loadQuery();
 const records=[{id:'unreviewed',name:'Other Guide',business:null,states:['Oregon'],areas:['Lower Columbia River'],
  advertisedWaters:[],searchAliases:[],href:'/guides/other',source:'Oregon registry'}];
 const filtered=f(records,{state:'All',sourceZone:'All areas',advertisedWater:'Buoy 10',query:''});
 assert.equal(filtered.length,0);
 assert.equal(records[0].advertisedWaters.length,0);
});

test('profile UI distinguishes public operating claims from historical licensing and has visible source links',()=>{
 const profile=read('app/guides/[slug]/page.tsx');
 const panel=read('components/GuideEnrichmentPanel.tsx');
 const search=read('components/UnifiedSearch.tsx');
 assert.match(profile,/Imported registration zones \(broad\)/);
 assert.match(profile,/GuideEnrichmentPanel registration=/);
 assert.match(panel,/not verified departure ports/);
 assert.match(panel,/sourceUrl/);
 assert.match(panel,/noopener noreferrer/);
 assert.match(search,/Imported source area \/ notes \(unverified\)/);
 assert.match(search,/Advertised fishing water \(pilot\)/);
 assert.match(search,/filterDirectoryEntries/);
 assert.doesNotMatch(search,/Verified current licensing/);
});

test('new business evidence has safe dated links and pending research never feeds public enrichment',()=>{
 for(const entry of Object.values(enriched)){
  for(const source of entry.sourceLinks??[]){
   const url=new URL(source.url);
   assert.equal(url.protocol,'https:');
   assert.equal(url.username,'');
   assert.equal(url.password,'');
   assert.match(source.observedOn,/^\d{4}-\d{2}-\d{2}$/);
   assert.ok(['operator_site','third_party_directory'].includes(source.sourceType));
   assert.ok(source.label.length>3);
  }
 }
 const queue=JSON.parse(read('docs/research/requested-launch-review.json'));
 for(const entity of queue.pendingEntities){
  assert.equal(entity.publicationStatus,'manual_review_required');
  assert.equal(entity.credentialStatus,'unknown');
 }
 assert.doesNotMatch(read('lib/guide-enrichment.ts'),/requested-launch-review/);
});
