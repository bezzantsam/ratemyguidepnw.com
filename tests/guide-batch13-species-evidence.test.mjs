import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=p=>JSON.parse(readFileSync(p,'utf8'));
const r=load('lib/oregon-guides.json'),e=load('lib/guide-enrichment.json');
const old=[...load('docs/research/OREGON_NEXT_100_REVIEW_2026_11_15.json').records,...load('docs/research/OREGON_BATCH_12_100_REVIEW.json').records];
const batch=load('docs/research/OREGON_BATCH13_100_REVIEW.json');
test('100 new identities do not duplicate earlier research or registry IDs',()=>{
 assert.equal(batch.records.length,100);
 assert.equal(new Set(batch.records.map(x=>x.directory_id)).size,100);
 assert.equal(batch.source_baselines.enriched_before,213);
 const previous=new Set(old.map(x=>x.directory_id));
 const directory=new Map(r.map(x=>[x.registration,x]));
 for(const x of batch.records){
  assert.ok(!previous.has(x.directory_id),'duplicate '+x.directory_id);
  const imported=directory.get(x.directory_id);
  assert.ok(imported,'unknown '+x.directory_id);
  assert.equal(x.imported_name,imported.name);
  assert.equal(x.imported_business,imported.business);
  assert.equal(x.imported_website,imported.website);
  assert.equal(x.publication_status,'draft_research_pending_editorial');
 }
});
test('12 sourced, 88 held; sources remain auditable and no fabricated aliases',()=>{
 assert.ok(Object.keys(e).length>=225);
 let sourced=0,held=0,waters=0;
 for(const x of batch.records){
  if(x.review_status==='public_source_reviewed_pending_editorial'){
   sourced++;
   const entry=e[x.directory_id];assert.ok(entry);
   assert.match(x.public_source_url,/^https:\/\//);
   assert.ok(['operator_site','third_party_directory'].includes(x.public_source_type));
   assert.equal(x.observed_on,'2026-11-15');
   assert.deepEqual(entry.searchAliases,[]);
   assert.equal(entry.sourceLinks.length,1);
   assert.equal(entry.sourceLinks[0].url,x.public_source_url);
   assert.equal(entry.sourceLinks[0].sourceType,x.public_source_type);
   assert.deepEqual(entry.advertisedWaters.map(w=>w.name),x.advertised_waters);
   assert.equal(new Set(entry.advertisedWaters.map(w=>w.name)).size,entry.advertisedWaters.length);
   for(const w of entry.advertisedWaters){
    assert.equal(w.sourceUrl,x.public_source_url);
    assert.equal(w.sourceType,x.public_source_type);
    assert.equal(w.observedOn,'2026-11-15');
    waters++;
   }
  } else {
   held++;
   assert.equal(e[x.directory_id],undefined,'held listing promoted '+x.directory_id);
   assert.equal(x.public_source_url,null);
   assert.equal(x.public_source_type,null);
   assert.equal(x.observed_on,null);
   assert.deepEqual(x.advertised_waters,[]);
   assert.deepEqual(x.advertised_species_staging_only,[]);
   assert.deepEqual(x.advertised_techniques_staging_only,[]);
  }
  assert.deepEqual(x.captain_claimed_specialties,[]);
 }
 assert.equal(sourced,12);
 assert.equal(held,88);
 assert.equal(waters,37);
 assert.equal(batch.counts.new_waterway_claims,37);
});
test('species and techniques are research-only, not falsely published as expertise',()=>{
 assert.match(batch.policy,/staged research evidence only/);
 assert.equal(batch.records.filter(x=>x.captain_claimed_specialties.length>0).length,0);
 const ui=readFileSync('components/UnifiedSearch.tsx','utf8');
 assert.match(ui,/Only show source-linked guide profiles/);
 assert.doesNotMatch(ui,/Verified expertise/);
});
