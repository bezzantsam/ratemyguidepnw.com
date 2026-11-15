import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const data = JSON.parse(readFileSync(new URL('../docs/research/BATCH13_SOURCE_REVIEW_20261115.json', import.meta.url), 'utf8'));
// Pinned selection from the 20 source-bearing leads in PR #99's immutable baseline.
const names = {
 'OG.0000137':'Jesse Zalonis','OG.0000382':'Kevin Hawkins','OG.0000387':'Vernon Grieve',
 'OG.0000408':'Alan Borges','OG.0000415':'Timothy Barnett','OG.0000427':'Ethan Nickel',
 'OG.0000617':'Jonathan Geyer','OG.0000741':'Robert Rees','OG.0000782':'Drake Radditz',
 'OG.0001116':'Neal Burrell','OG.0001224':'Jeremy Toman','OG.0001395':'Thomas Hyde',
 'OG.0001881':'Daniel Chambers','OG.0002074':'John Klar','OG.0002329':'John Plughoff',
 'OG.0002596':'Benjamin Stephenson','OG.0003696':'Jason Rounsaville','OG.0003889':'Gregory Hitchcock',
 'OG.0003968':'Steven Balodis','OG.0003993':'Jon Ferguson'
};
const statuses = new Set(['source_supported_pending_editorial','historical_listing_only','retrieval_limited_pending_editorial','business_identity_hold']);
const kinds = new Set(['operator_site','industry_directory','agency_directory']);
const methods = new Set(['parsed_page','indexed_page_text','pdf_text_and_page_images']);
const fields = new Set(['display_names','business_names','advertised_waters','advertised_locations','advertised_species','advertised_methods','advertised_trip_types','advertised_accessibility','listed_business_names','historical_directory_area']);
const values = (r, field) => r.facts.flatMap(f => f[field] ?? []);
function url(value) {
 const u = new URL(value);
 assert.equal(u.protocol,'https:');
 assert.equal(u.username,''); assert.equal(u.password,'');
 assert.ok(u.hostname.includes('.'));
}
function validate(d) {
 assert.equal(d.schema_version,1);
 assert.equal(d.reviewed_on,'2026-11-15');
 assert.equal(d.status,'source_review_staged_not_for_publication');
 assert.equal(d.baseline.commit,'2125731de0355f4c57fa883b0fd99fed4f50d1af');
 assert.equal(d.baseline.manifest_blob_sha,'e39cadfad510d1f7407d79a6f124b1ad0981cc9e');
 for (const key of ['publication_approved','owner_claims_verified','current_credentials_verified','reviews_copied','source_bytes_archived']) assert.equal(d.policy[key],false,key);
 assert.equal(d.records.length,20);
 assert.deepEqual(d.records.map(r=>r.registration_id).sort(),Object.keys(names).sort());
 assert.equal(new Set(d.records.map(r=>r.registration_id)).size,20);
 for (const [id,s] of Object.entries(d.sources)) {
  url(s.url); assert.ok(kinds.has(s.source_type),id); assert.ok(methods.has(s.method),id);
  assert.ok(typeof s.locator==='string' && s.locator.length>15,id);
  assert.ok(s.content_date===null || /^\d{4}-\d{2}(?:-\d{2})?$/.test(s.content_date),id);
 }
 const counts={};
 for (const r of d.records) {
  assert.equal(r.imported_name,names[r.registration_id]);
  assert.ok(statuses.has(r.review_status));
  counts[r.review_status]=(counts[r.review_status]??0)+1;
  url(r.original_lead_url);
  assert.equal(r.publication_approved,false); assert.equal(r.current_credentials_verified,false);
  assert.equal(r.identity.legal_identity_verified,false);
  assert.ok(r.identity.assessment.length>25 && r.identity.source_ids.length>0);
  for (const id of r.identity.source_ids) assert.ok(d.sources[id],id);
  assert.ok(r.facts.length>0);
  for (const f of r.facts) {
   const s=d.sources[f.source_id]; assert.ok(s, f.source_id);
   const scope={operator_site:'operator_advertises',industry_directory:'industry_lists',agency_directory:'historical_listing'}[s.source_type];
   assert.equal(f.scope,scope);
   const keys=Object.keys(f).filter(k=>!['source_id','scope'].includes(k)); assert.ok(keys.length);
   for (const key of keys) {
    assert.ok(fields.has(key),key); assert.ok(Array.isArray(f[key]) && f[key].length>0,key);
    assert.equal(new Set(f[key]).size,f[key].length,key);
    assert.ok(f[key].every(v=>typeof v==='string' && v.trim()===v && v.length>0));
    if (f.scope==='historical_listing') assert.ok(['listed_business_names','historical_directory_area'].includes(key));
   }
   if (s.method==='indexed_page_text') assert.equal(r.review_status,'retrieval_limited_pending_editorial');
  }
  for (const x of r.exclusions) {
   assert.ok(fields.has(x.field)); assert.ok(d.sources[x.source_id]);
   assert.ok(x.reason.length>20); assert.ok(!values(r,x.field).includes(x.value));
  }
  for (const f of r.failed_or_limited_fetches) {url(f.url);assert.ok(d.sources[f.fallback_source_id]);assert.ok(f.result);}
 }
 assert.deepEqual(counts,d.scope.counts_by_status);
 assert.equal(d.scope.reviewed_records,d.records.length);
 assert.equal(d.scope.original_distinct_candidates,111);
 assert.equal(d.scope.untouched_candidates,91);
 const byId=Object.fromEntries(d.records.map(r=>[r.registration_id,r]));
 assert.equal(byId['OG.0001881'].review_status,'business_identity_hold');
 assert.equal(byId['OG.0000782'].review_status,'historical_listing_only');
 assert.equal(d.sources['radditz-blm'].content_date,'2025-05');
 assert.equal(d.sources['radditz-blm'].method,'pdf_text_and_page_images');
 const closed=byId['OG.0001116'];
 assert.ok(values(closed,'advertised_waters').includes('Deschutes River'));
 assert.ok(!values(closed,'advertised_waters').includes('Grindstone Lakes'));
 assert.ok(closed.exclusions.some(x=>x.value==='Grindstone Lakes' && x.effective_from_year===2024));
 assert.equal(byId['OG.0001224'].review_status,'retrieval_limited_pending_editorial');
 assert.ok(byId['OG.0003968'].failed_or_limited_fetches.some(x=>x.result==='no_readable_text'));
 return d;
}
const mutate = fn => {const copy=structuredClone(data);fn(copy);return copy;};
test('20-source review passes structural, identity, scope and provenance checks',()=>validate(data));
test('counts distinguish supported, limited, unmatched and historical evidence',()=>{
 assert.deepEqual(data.scope.counts_by_status,{source_supported_pending_editorial:17,historical_listing_only:1,retrieval_limited_pending_editorial:1,business_identity_hold:1});
});
function rejects(name, fn) { test(name, () => assert.throws(() => validate(mutate(fn)))); }
rejects('publication approval cannot be inferred from source review',d=>{d.records[0].publication_approved=true;});
rejects('source presence cannot become current credential verification',d=>{d.records[0].current_credentials_verified=true;});
rejects('source presence cannot become legal identity verification',d=>{d.records[0].identity.legal_identity_verified=true;});
rejects('unknown source references are rejected',d=>{d.records[0].facts[0].source_id='invented';});
rejects('unsafe source protocols are rejected',d=>{d.sources.hawkins.url='javascript:alert(1)';});
rejects('embedded credentials in URLs are rejected',d=>{d.sources.hawkins.url='https://secret:password@www.khfishing.com/';});
rejects('duplicate guide IDs are rejected',d=>{d.records[1]=structuredClone(d.records[0]);});
rejects('a different captain cannot inherit an existing guide ID',d=>{d.records[0].imported_name='Different Captain';});
rejects('uncited or unknown claim fields are rejected',d=>{d.records[0].facts[0].verified_license=['yes'];});
rejects('closed Grindstone trips cannot be reintroduced as current advertised water',d=>{d.records.find(r=>r.registration_id==='OG.0001116').facts[0].advertised_waters.push('Grindstone Lakes');});
rejects('business-only identity hold cannot silently be promoted',d=>{d.records.find(r=>r.registration_id==='OG.0001881').review_status='source_supported_pending_editorial';});
rejects('historical agency list cannot be relabeled as operator advertising',d=>{d.records.find(r=>r.registration_id==='OG.0000782').facts[0].scope='operator_advertises';});
rejects('indexed content keeps its retrieval limitation',d=>{d.records.find(r=>r.registration_id==='OG.0001224').review_status='source_supported_pending_editorial';});
rejects('sponsor directory claims retain sponsor attribution',d=>{d.records[0].facts[0].scope='operator_advertises';});
