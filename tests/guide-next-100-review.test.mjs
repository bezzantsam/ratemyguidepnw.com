import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const directory=JSON.parse(readFileSync('lib/oregon-guides.json','utf8'));
const enrichment=JSON.parse(readFileSync('lib/guide-enrichment.json','utf8'));
const review=JSON.parse(readFileSync('docs/research/OREGON_NEXT_100_REVIEW_2026_11_15.json','utf8'));
const later=JSON.parse(readFileSync('docs/research/OREGON_BATCH_13_100_WEBSITE_AND_SPECIES.json','utf8'));
const allowedPromotions=new Set(later.promoted_held_ids);
const imported=new Map(directory.map(r=>[r.registration,r]));
test('new guide research batch has 100 unique exact imported identities',()=>{
 assert.equal(review.records.length,100);
 assert.equal(new Set(review.records.map(x=>x.directory_id)).size,100);
 assert.equal(review.source_baseline.prior_enriched_count,172);
 assert.equal(review.counts.selected,100);
 assert.equal(review.counts.source_reviewed,22);
 assert.equal(review.counts.registry_website_candidate_only,78);
 for(const row of review.records){
  const r=imported.get(row.directory_id);
  assert.ok(r,'unknown Oregon registration '+row.directory_id);
  assert.equal(r.name,row.imported_person);
  assert.equal(r.business||null,row.imported_business);
  assert.equal(r.website,row.candidate_website);
  assert.equal(r.activity,row.imported_activity);
  assert.equal(row.publication_status,'review_only');
 }
});
test('only the 22 inspected sources are in the incremental public enrichment data',()=>{
 assert.ok(Object.keys(enrichment).length>=194,'A later batch must not remove earlier enriched profiles');
 let checked=0,held=0,waters=0;
 for(const row of review.records){
  if(row.status==='registry_candidate_unverified'){
   assert.equal(row.source_url,null);
   assert.equal(row.observed_on,null);
   assert.equal(row.source_type,null);
   assert.deepEqual(row.proposed_waterways,[]);
   const promoted=enrichment[row.directory_id];
   if(promoted){
    assert.ok(allowedPromotions.has(row.directory_id),'Unreviewed guide promoted without later evidence '+row.directory_id);
    const source=later.publicSourceResearch.find(x=>x.registration===row.directory_id);
    assert.ok(source,'Promoted ID lacks public source audit');
    assert.ok(promoted.sourceLinks?.some(link=>link.url===source.sourceUrl),'Promotion missing later independent citation');
   }
   held++;
   continue;
  }
  assert.equal(row.status,'source_reviewed_pending_editorial');
  assert.equal(row.observed_on,'2026-11-15');
  assert.ok(['operator_site','third_party_directory'].includes(row.source_type));
  assert.match(row.source_url,/^https:\/\/[^\s]+$/);
  const record=enrichment[row.directory_id];
  assert.ok(record,'source-reviewed row missing from public draft');
  assert.deepEqual(record.searchAliases,[],'no inferred alias identities');
  const originalSource=record.sourceLinks.find(x=>x.url===row.source_url);
  assert.ok(originalSource,'Original source must remain after additions');
  assert.equal(originalSource.sourceType,row.source_type);
  assert.equal(originalSource.observedOn,row.observed_on);
  for(const name of row.proposed_waterways)assert.ok(record.advertisedWaters.some(x=>x.name===name),'Original waterway lost: '+name);
  const unique=new Set();
  for(const water of record.advertisedWaters){
   assert.ok(!unique.has(water.name),'duplicate named waterway '+row.directory_id);
   unique.add(water.name);
   if(row.proposed_waterways.includes(water.name)){
    assert.equal(water.sourceUrl,row.source_url);
    assert.equal(water.sourceType,row.source_type);
    assert.equal(water.observedOn,'2026-11-15');
    waters++;
   }
  }
  checked++;
 }
 assert.equal(checked,22);
 assert.equal(held,78);
 assert.equal(waters,66);
});
