import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read=path=>readFileSync(path,'utf8');
const code=ts.transpileModule(read('lib/founding-captain-offer.ts'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
}).outputText;
const exports={};
vm.runInNewContext(code,{exports,encodeURIComponent});
const {foundingCaptainInterestHref,FOUNDING_CAPTAIN_YEARLY_TEST_PRICE}=exports;

test('price-test email CTA includes guide ID and name but never represents payment as collected',()=>{
 const href=foundingCaptainInterestHref({
  choice:'founding-profile',guideId:'OG.0000469',guideName:'Shane Groshong'
 });
 assert.ok(href.startsWith('mailto:'));
 assert.match(href,/\?subject=/);
 const query=new URLSearchParams(href.split('?')[1]);
 assert.match(query.get('subject'),/Founding Captain pilot interest/);
 assert.match(query.get('body'),/Shane Groshong/);
 assert.match(query.get('body'),/OG\.0000469/);
 assert.match(query.get('body'),/not a purchase/);
 assert.equal(FOUNDING_CAPTAIN_YEARLY_TEST_PRICE,99);
});
test('free manual claim CTA is distinct from a paid interest signal',()=>{
 const href=foundingCaptainInterestHref({choice:'free-claim'});
 const query=new URLSearchParams(href.split('?')[1]);
 assert.match(query.get('subject'),/Free guide listing claim/);
 assert.match(query.get('body'),/free manual review/);
 assert.doesNotMatch(query.get('body'),/interested in the \$99/);
});
test('injected newlines in guide name cannot forge email subject or headers',()=>{
 const href=foundingCaptainInterestHref({
  choice:'free-claim',guideName:'Guide\r\nBCC:evil@example.com',
  guideId:'OG.0000470\nSubject:forged'
 });
 const [header,query]=href.split('?');
 assert.doesNotMatch(header,/[\r\n]/);
 const fields=new URLSearchParams(query);
 assert.equal(fields.get('subject'),'RateMyGuidePNW: Free guide listing claim');
 assert.ok(fields.get('body').includes('Guide  BCC:'));
 assert.ok(fields.get('body').includes('Public listing ID: OG.0000470 Subject:forged'));
});
test('founding pilot landing page has real visible acquisition path without claiming checkout',()=>{
 const page=read('app/for-guides/page.tsx');
 assert.match(page,/FOUNDING_CAPTAIN_YEARLY_TEST_PRICE/);
 assert.match(page,/href=\{paid\}/);
 assert.match(page,/href=\{free\}/);
 assert.match(page,/No payment is collected/);
 assert.match(page,/We cannot promise bookings/);
 assert.doesNotMatch(page,/We guarantee|Stripe is connected/);
 const home=read('app/page.tsx'),layout=read('app/layout.tsx');
 assert.match(home,/href="\/for-guides"/);
 assert.match(layout,/href="\/for-guides"/);
});
test('guide-specific manual claim and paid invitation are available while automated RPC stays disabled',()=>{
 const page=read('app/claim/[id]/page.tsx');
 assert.match(page,/choice:'free-claim',guideId:g.id,guideName:g.name/);
 assert.match(page,/choice:'founding-profile',guideId:g.id,guideName:g.name/);
 assert.match(page,/submitEnabled=\{backendWriteAvailability\(\)\.claims\}/);
 assert.match(page,/Automated claiming \(coming soon\)/);
});
test('batch-08 source-backed profiles and operator links are now in the public directory data',()=>{
 const enrich=JSON.parse(read('lib/guide-enrichment.json'));
 const added=[
 'OG.0000429','OG.0000430','OG.0000433','OG.0000436','OG.0000437',
 'OG.0000441','OG.0000443','OG.0000450','OG.0000460','OG.0000461',
 'OG.0000462','OG.0000468','OG.0000469'
 ];
 assert.ok(Object.keys(enrich).length>=72);
 let waters=0;
 for(const id of added){
  const row=enrich[id];
  assert.ok(row,id);
  assert.ok(Array.isArray(row.advertisedWaters));
  assert.ok(Array.isArray(row.sourceLinks) && row.sourceLinks.length);
  for(const s of row.sourceLinks)assert.match(s.url,/^https:\/\//);
  for(const w of row.advertisedWaters) {
   assert.match(w.sourceUrl,/^https:\/\//);
   assert.equal(w.observedOn,'2026-11-14');
   waters++;
  }
 }
 assert.equal(waters,87);
 for(const held of ['OG.0000868','OG.0000449'])assert.equal(enrich[held],undefined);
 assert.match(read('components/GuideEnrichmentPanel.tsx'),/Visit guide website/);
});

test('batch 09 adds 11 sourced profiles and preserves four non-published research holds',()=>{
 const enrich=JSON.parse(read('lib/guide-enrichment.json'));
 const added=[
 'OG.0000470','OG.0000476','OG.0000484.BRO','OG.0000485',
 'OG.0000495','OG.0000502','OG.0000508','OG.0000509',
 'OG.0000518','OG.0000520','OG.0000527'
 ];
 let claims=0;
 for(const id of added){
  const row=enrich[id];
  assert.ok(row, id);
  assert.ok(row.searchAliases.length||row.advertisedWaters.length);
  assert.ok(row.sourceLinks?.length);
  for(const source of row.sourceLinks) assert.match(source.url,/^https:\/\//);
  for(const water of row.advertisedWaters){
   assert.match(water.sourceUrl,/^https:\/\//);
   assert.equal(water.observedOn,'2026-11-14');
   claims++;
  }
 }
 assert.equal(claims,48);
 for(const held of ['OG.0000489','OG.0000511','OG.0000519','OG.0000525']){
  assert.equal(enrich[held],undefined);
 }
});

test('Batch 10 source-linked guide additions are searchable without merging identities',()=>{
 const enrich=JSON.parse(read('lib/guide-enrichment.json'));
 const ids=[
  'OG.0000528','OG.0000544','OG.0000545','OG.0000548','OG.0000549',
  'OG.0000550','OG.0000555','OG.0000561','OG.0000563','OG.0000567',
  'OG.0000571','OG.0000572','OG.0000575','OG.0000581','OG.0000585'
 ];
 const known=JSON.parse(read('lib/oregon-guides.json'));
 const knownIds=new Set(known.map(r=>r.registration));
 let waterCount=0,aliasCount=0;
 for(const id of ids){
  assert.ok(knownIds.has(id),'guide identity not in imported directory: '+id);
  const entry=enrich[id];
  assert.ok(entry,'new guide missing: '+id);
  assert.ok(entry.advertisedWaters.length+entry.searchAliases.length>0);
  assert.ok(entry.sourceLinks.length>0);
  for(const link of entry.sourceLinks)assert.match(link.url,/^https:\/\//);
  for(const water of entry.advertisedWaters){
   assert.match(water.sourceUrl,/^https:\/\//);
   assert.equal(water.observedOn,'2026-11-14');
   waterCount++;
  }
  aliasCount+=entry.searchAliases.length;
 }
 assert.equal(waterCount,50);
 assert.equal(aliasCount,22);
 assert.ok(enrich['OG.0000585'].searchAliases.includes('Wild Rivers Fishing'));
});
