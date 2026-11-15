import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isIP} from 'node:net';
import {test} from 'node:test';

const data = JSON.parse(readFileSync(new URL('../docs/research/BATCH13_NEXT30_SOURCE_REVIEW_20261115.json', import.meta.url), 'utf8'));
// Exact imported identities from the pinned manifest, not normalized operator names.
const baselineRows = `0047|John Hanson|Jack's Guide Service|www.jacksguideservice.net
0236|Kieron Wilde|First Nature LLC|www.firstnaturetours.com
0353|Herman Fleishman|Northwest Fishing Adventures LLC|www.fish-northwest.com
0359|Douglas Wolfe|Douglas Scott Wolfe LLC|wolfepackfishing.com
0364|William Gaither|NW Hawghunters|columbiafishing.net
0401|Damon Struble|Nomad's Fishing Adventures LLC|www.nomadsfishingadventures.com
0409|David Graham|Travois LLC|www.travoisllc.com
0412|Jon Payne|O2Fish Guide Service|www.o2fish.com
0414|Scott Amerman|Amermans Eggs and Guide Service|amermaneggs.com
0419|John Elder|John Elder Fishing Guide Service LLC|www.Northwest-fishing-guide.com
0519|Charles Ireland|Northwest Sportfishing LLC|northwestsportfishing.com
0597|Justin Crump|Frigate Adventure Travel, LLC|www.frigatetravel.com
0598|Kathryn Crump|Frigate Adventure Travel, LLC|www.frigatetravel.com
0625|William Inkrote||www.BillInkroteGuideService.com
0627|Albert Kutzkey|Kutzkeys Guide Service|www.kutzkeyfishing.com
0642|Bryan Jones|Take Down Guide Service|www.takedownfishingguideservice.com
0647|Jesse Sampson|Small Stream LLC|www.Smallstreamoutfitters.com
0665|Timothy Pickett|Southern Oregon Outfitters|cathunts.com
0691|Mark Lottis|Lottis Marine LLC|www.5starcharters.com
0703|Benjamin Bansen|Rogue Rafting Company LLC|www.RogueRaftingCompany.com
0707|Silas Stardance|Riverhawk Guide Service|www.riverhawkguideserviceonline.net
0729|Robert Grubb|AWA LLC|www.AirWaterArt.com
0815|Jeff Lottis|CEA Inc|www.lottisguideservice.com
0844|Bradley Hadfield|Guide Service Northwest|www.guideservicenorthwest.com
0853|Scott Nelson|Two Dudes Flyfishing|www.2dudesflyfishing.com
0854|John Bowles|JB & Water Sportfishing|www.JBandwater.com
0914|Raymond Herzman|1 Arm Bandit Guide Service|www.1armbanditfishingguide.com
0921|Craig Schuhmann|Guided Waters Fly Fishing|guidedwtersflyfishing.com
1014|Ryan McNulty|Fin N Fire LLC|www.finandfire.com
1067|Kristopher Belozer||belozerswhitewaterfishing.com`;
const identities = new Map(baselineRows.split('\n').map(line => {
  const [suffix, ...values] = line.split('|');
  return ['OG.000' + suffix, values];
}));
const priorIds = new Set('0137 0382 0387 0408 0415 0427 0617 0741 0782 1116 1224 1395 1881 2074 2329 2596 3696 3889 3968 3993'.split(' ').map(s => 'OG.000'+s));
const supported = 'source_supported_pending_editorial';
const expectedCounts = {name_variant_hold:3,source_supported_pending_editorial:13,retrieval_limited:6,category_review_hold:4,business_identity_hold:4};
const scopes = {operator_site:'operator_advertises',industry_directory:'industry_lists',tourism_directory:'tourism_lists'};
const fields = new Set(['advertised_waters','advertised_species','advertised_methods','advertised_trip_types','advertised_locations']);
const heldIds = {
  name_variant_hold: ['0047','0359','0598'],
  business_identity_hold: ['0691','0815','0844','1014'],
  category_review_hold: ['0409','0414','0665','0729'],
  retrieval_limited: ['0364','0412','0519','0647','0854','0914']
};
function exactKeys(value, keys) {assert.deepEqual(Object.keys(value).sort(), [...keys].sort());}
function safeUrl(value) {
  assert.equal(typeof value,'string');
  const u = new URL(value);
  assert.equal(u.protocol,'https:'); assert.equal(u.username,''); assert.equal(u.password,'');
  assert.ok(!isIP(u.hostname) && u.hostname.includes('.') && !u.hostname.startsWith('['));
  assert.ok(!/(^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname));
  assert.equal(u.port,'');
}
function validate(d) {
  exactKeys(d,['schema_version','batch_id','reviewed_on','status','baseline','scope','policy','sources','records']);
  assert.equal(d.schema_version,1); assert.equal(d.batch_id,'batch13-next30-20261115');
  assert.equal(d.reviewed_on,'2026-11-15'); assert.equal(d.status,'source_review_staged_not_for_publication');
  assert.equal(d.baseline.commit,'68ccf8c850af6b161ba46ca9659363a73b6eb493');
  assert.equal(d.baseline.manifest_blob_sha,'e39cadfad510d1f7407d79a6f124b1ad0981cc9e');
  assert.equal(d.baseline.manifest_path,'docs/research/BATCH13_DEDUPED_RESEARCH_MANIFEST_20261115.json');
  assert.equal(d.baseline.previous_review_path,'docs/research/BATCH13_SOURCE_REVIEW_20261115.json');
  exactKeys(d.policy,['publication_approved','owner_claims_verified','current_credentials_verified','reviews_copied','source_bytes_archived','notes']);
  for(const k of Object.keys(d.policy).filter(k=>k!=='notes')) assert.equal(d.policy[k],false,k);
  assert.ok(d.policy.notes.length>=6);
  assert.equal(d.records.length,30);
  assert.deepEqual(d.records.map(r=>r.registration_id),[...identities.keys()]);
  assert.equal(new Set(d.records.map(r=>r.registration_id)).size,30);
  assert.equal(Object.keys(d.sources).length,32);
  for(const s of Object.values(d.sources)) {
    exactKeys(s,['url','source_type','method','locator','content_date']); safeUrl(s.url);
    assert.ok(Object.hasOwn(scopes,s.source_type));
    assert.ok(['parsed_page','indexed_page_text'].includes(s.method));
    assert.ok(typeof s.locator==='string' && s.locator.length>20);
    assert.ok(s.content_date===null || /^\d{4}-\d{2}-\d{2}$/.test(s.content_date));
  }
  const referenced=new Set(),counts={};
  for(const r of d.records) {
    exactKeys(r,['registration_id','imported_name','imported_business','registry_website','review_status','identity','facts','held_observations','limitations','failed_or_limited_fetches','publication_approved','current_credentials_verified']);
    assert.ok(!priorIds.has(r.registration_id));
    assert.deepEqual([r.imported_name,r.imported_business,r.registry_website],identities.get(r.registration_id));
    assert.ok(Object.hasOwn(expectedCounts,r.review_status)); counts[r.review_status]=(counts[r.review_status]??0)+1;
    assert.equal(r.publication_approved,false); assert.equal(r.current_credentials_verified,false);
    exactKeys(r.identity,['assessment','source_ids','legal_identity_verified']);
    assert.equal(r.identity.legal_identity_verified,false);
    assert.ok(r.identity.assessment.length>25);
    for(const id of r.identity.source_ids) {assert.ok(d.sources[id],id);referenced.add(id);}
    assert.ok(r.limitations.length && r.limitations.every(x=>typeof x==='string' && x.length>20));
    assert.ok(Array.isArray(r.facts) && Array.isArray(r.held_observations));
    if(r.review_status===supported) {assert.ok(r.facts.length);assert.ok(r.identity.source_ids.length);assert.equal(r.held_observations.length,0);}
    else {assert.equal(r.facts.length,0,'held records cannot propose fishing attributes');}
    if(r.review_status==='retrieval_limited') assert.ok(r.failed_or_limited_fetches.length);
    for(const f of r.facts) {
      const s=d.sources[f.source_id];assert.ok(s,f.source_id);referenced.add(f.source_id);
      assert.equal(f.scope,scopes[s.source_type]);
      const keys=Object.keys(f).filter(k=>!['source_id','scope','relationship'].includes(k));assert.ok(keys.length);
      for(const k of keys) {assert.ok(fields.has(k),k);assert.ok(Array.isArray(f[k])&&f[k].length);assert.equal(new Set(f[k]).size,f[k].length);assert.ok(f[k].every(v=>typeof v==='string'&&v.length>0&&v===v.trim()));}
      if(Object.hasOwn(f,'relationship')) {assert.equal(f.relationship,'explicit_single_trip_section');assert.equal(r.registration_id,'OG.0000642');assert.equal(f.advertised_waters.length,1);assert.equal(f.advertised_species.length,1);}
    }
    for(const h of r.held_observations) {exactKeys(h,['source_id','note']);assert.ok(d.sources[h.source_id]);referenced.add(h.source_id);assert.ok(h.note.length>25);}
    for(const f of r.failed_or_limited_fetches) {exactKeys(f,['url','result']);safeUrl(f.url);assert.ok(['tool_unavailable','http_502','http_403','timeout','unrelated_title_no_operator_text'].includes(f.result));}
  }
  assert.deepEqual(counts,expectedCounts);assert.deepEqual(counts,d.scope.counts_by_status);
  assert.equal(referenced.size,Object.keys(d.sources).length,'every source must be used');
  assert.equal(d.scope.checked_records,30);assert.equal(d.scope.previously_checked,20);
  assert.equal(d.scope.cumulative_checked,50);assert.equal(d.scope.remaining_unchecked,61);assert.equal(d.scope.original_candidates,111);
  assert.equal(d.scope.records_with_readable_source_evidence,d.records.filter(r=>r.identity.source_ids.length).length);
  assert.equal(d.scope.records_without_readable_source_evidence,d.records.filter(r=>!r.identity.source_ids.length).length);
  const byId=Object.fromEntries(d.records.map(r=>[r.registration_id,r]));
  for(const [status,ids] of Object.entries(heldIds)) for(const id of ids) assert.equal(byId['OG.000'+id].review_status,status);
  assert.equal(d.sources['o2-archive'].content_date,'2011-02-14');assert.equal(d.sources['o2-archive'].method,'indexed_page_text');
  assert.equal(d.sources['riverhawk-sponsor'].source_type,'industry_directory');
  for(const id of ['jack-tourism','wolfe-tourism','nomad-tourism','guide-nw-tourism','twodudes-tourism','waters-tourism']) assert.equal(d.sources[id].source_type,'tourism_directory');
  const trips=byId['OG.0000642'].facts.map(f=>[f.advertised_waters[0],f.advertised_species[0]]);
  assert.deepEqual(trips,[['Columbia River','Walleye'],['Sacramento River','Striped Bass']]);
  const woods=byId['OG.0000921'];assert.ok(woods.facts.some(f=>f.advertised_waters?.includes('Woods River')));
  assert.ok(woods.failed_or_limited_fetches.some(f=>f.result==='unrelated_title_no_operator_text'));
  return d;
}
const copy = () => structuredClone(data);
const record = (d,id) => d.records.find(r=>r.registration_id==='OG.000'+id);
function rejects(name, mutate) {test(name,()=>{const d=copy();mutate(d);assert.throws(()=>validate(d));});}
test('next 30 preserve pinned identities, attributable evidence and all holds',()=>validate(data));
test('checked counts are not verified profiles or newly added guides',()=>{assert.deepEqual(data.scope.counts_by_status,expectedCounts);assert.equal(data.records.filter(r=>r.publication_approved).length,0);});
test('the 30 selections do not duplicate the previous 20',()=>assert.ok(data.records.every(r=>!priorIds.has(r.registration_id))));
rejects('publication cannot be escalated',d=>record(d,'0236').publication_approved=true);
rejects('source evidence cannot assert legal identity',d=>record(d,'0353').identity.legal_identity_verified=true);
rejects('credentials cannot be inferred',d=>record(d,'0419').current_credentials_verified=true);
rejects('unsupported attributes are rejected',d=>record(d,'0236').facts[0].verified_booking=['yes']);
rejects('unknown evidence pointers fail',d=>record(d,'0236').facts[0].source_id='fabricated');
rejects('unsafe URL schemes fail',d=>d.sources['elder'].url='javascript:alert(1)');
rejects('credentials inside source URLs fail',d=>d.sources['elder'].url='https://secret:token@example.com/');
rejects('private host destinations fail',d=>d.sources['elder'].url='https://127.0.0.1/');
rejects('duplicate registrations fail',d=>d.records[1]=structuredClone(d.records[0]));
rejects('registry people cannot be silently renamed',d=>record(d,'1014').imported_name='Ryan Smith');
rejects('Mark cannot inherit Jeff Lottis facts',d=>record(d,'0691').facts=[structuredClone(record(d,'0353').facts[0])]);
rejects('category-only sites cannot become fishing specialties',d=>record(d,'0414').facts=[structuredClone(record(d,'0353').facts[0])]);
rejects('unresolved name variants cannot be promoted',d=>record(d,'0598').review_status=supported);
rejects('failed fetches must retain their limitations',d=>record(d,'0647').failed_or_limited_fetches=[]);
rejects('historical O2 content cannot acquire a 2026 date',d=>d.sources['o2-archive'].content_date='2026-11-15');
rejects('source attribution cannot become operator advertising',d=>record(d,'0707').facts[0].scope='operator_advertises');
rejects('separate Columbia and Sacramento trips cannot cross-join',d=>record(d,'0642').facts[1].advertised_waters=['Columbia River']);
rejects('source geography cannot silently normalize',d=>record(d,'0921').facts[0].advertised_waters=['Williamson River','Wood River','Crystal Creek']);
rejects('registry typo must not silently become a verified URL',d=>record(d,'0921').registry_website='guidedwatersflyfishing.com');
rejects('checked totals cannot be inflated',d=>d.scope.cumulative_checked=100);
rejects('retrieval failures cannot be renamed business closure',d=>record(d,'0364').failed_or_limited_fetches[0].result='business_closed');
