import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read=path=>readFileSync(path,'utf8');
function evaluate(path){
  const js=ts.transpileModule(read(path),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
  }).outputText;
  const exports={};
  vm.runInNewContext(js,{exports});
  return exports;
}
const identity=evaluate('lib/guide-identity.ts');
const provenance=evaluate('lib/washington-provenance.ts');
const oregon=JSON.parse(read('lib/oregon-guides.json'));
const washington=JSON.parse(read('lib/washington-raw.json'));
const ids=JSON.parse(read('lib/washington-stable-ids.json'));
const normalize=s=>s.trim().normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
const publicId=(row)=>ids[JSON.stringify([normalize(row.name),normalize(row.business||''),normalize(row.source)])];
const known=new Set(oregon.map(r=>r.registration));
for(const row of washington){
  const id=publicId(row);
  if(id)known.add(id);
}

test('all negative identity pairs are resolvable and never block their own exact ID',()=>{
 const entries=identity.DO_NOT_MERGE_PAIRS;
 assert.ok(entries.length>=10);
 const seen=new Set();
 for(const [a,b] of entries){
  assert.ok(known.has(a),'unknown public identity '+a);
  assert.ok(known.has(b),'unknown public identity '+b);
  assert.notEqual(a,b);
  const key=[a,b].sort().join('|');
  assert.equal(seen.has(key),false,'duplicate blocked pair '+key);
  seen.add(key);
  assert.equal(identity.isExplicitlyDistinctCaptain(a,b),true,key);
  assert.equal(identity.isExplicitlyDistinctCaptain(b,a),true,key);
  assert.equal(identity.isExplicitlyDistinctCaptain(a,a),false);
 }
});

test('Seattle Fast Action Fishing and Oregon Marvin Henkel are separate',()=>{
 const paul=washington.find(w=>w.name==='Paul Lewis');
 assert.equal(publicId(paul),'wa-141');
 assert.equal(oregon.find(o=>o.registration==='OG.0000315').name,'Marvin Henkel');
 assert.equal(identity.isExplicitlyDistinctCaptain('wa-141','OG.0000315'),true);
 assert.equal(identity.isExplicitlyDistinctCaptain('wa-141','OG.0000989'),false);
});

test('Fisher names and shared outfitters never collapse individual captain identities',()=>{
 for(const id of ['OG.0000050','OG.0000989','OG.0003043','OG.0003998'])assert.ok(known.has(id));
 assert.equal(identity.isExplicitlyDistinctCaptain('OG.0003043','OG.0003998'),true);
 const fishers=identity.relatedOutfitterGroup('OG.0003043');
 assert.equal(fishers.id,'fishers-catch');
 assert.equal(fishers.profileIds.includes('OG.0003998'),true);
 assert.notEqual(fishers.profileIds[0],fishers.profileIds[1]);
});

test('River Dog and All Rivers shared business affiliation preserves two WA profiles each',()=>{
 const expected=[
  ['river-dog-outfitters','Andy Lockey','Neils Humphries'],
  ['all-rivers-saltwater','Mark Coleman','Mitchell Coleman'],
 ];
 for(const [groupId,a,b] of expected){
  const members=washington.filter(w=>w.name===a||w.name===b);
  assert.equal(members.length,2);
  const urls=members.map(publicId);
  assert.equal(new Set(urls).size,2);
  const group=identity.relatedOutfitterGroup(urls[0]);
  assert.equal(group.id,groupId);
  assert.equal(group.profileIds.length,2);
  assert.equal(group.profileIds.includes(urls[1]),true);
  assert.equal(identity.isExplicitlyDistinctCaptain(urls[0],urls[1]),true);
 }
});

test('outfitter groups only reference known distinct public IDs',()=>{
 const assigned=new Set();
 for(const group of identity.OUTFITTER_GROUPS){
  assert.ok(group.displayName.length>3);
  assert.ok(['public_operator_roster','matching_imported_business'].includes(group.basis));
  assert.equal(group.profileIds.length>=2,true);
  for(const id of group.profileIds){
   assert.ok(known.has(id),'outfitter group has missing profile '+id);
   assert.equal(assigned.has(id),false,'captain belongs to multiple public groups');
   assigned.add(id);
  }
 }
 assert.equal(identity.relatedOutfitterGroup('wa-9999'),null);
});

test('cross-border suggestions remain manual review, never silently merged',()=>{
 const candidates=identity.PENDING_CROSS_STATE_REVIEW;
 for(const item of candidates){
  assert.ok(known.has(item.washingtonId));
  assert.ok(known.has(item.oregonRegistration));
  assert.equal(item.state,'manual_review_required');
  assert.ok(item.reason.length>=30);
 }
 const page=read('app/guides/[slug]/page.tsx');
 assert.match(page,/matching hypothesis has not been independently verified/);
 assert.doesNotMatch(page,/We maintain a single captain profile/);
});

test('each imported Washington source is explicitly third-party, never an official WDFW license check',()=>{
 for(const row of washington){
  const category=provenance.classifyWashingtonSource(row.source);
  assert.equal(category.officialLicenseRecord,false);
  assert.ok(category.label.length>=10);
  assert.ok(['association_directory','charter_directory','other_directory','web_listing'].includes(category.type));
 }
 const unknown=provenance.classifyWashingtonSource('NEW_OTHER_SOURCE');
 assert.equal(unknown.officialLicenseRecord,false);
 assert.match(unknown.label,/not classified/);
});

test('two public pages display accurate source descriptions and separate outfitter captains',()=>{
 const wa=read('app/washington/[id]/page.tsx');
 const or=read('app/guides/[slug]/page.tsx');
 const panel=read('components/RelatedOutfitterCaptains.tsx');
 assert.match(wa,/classifyWashingtonSource/);
 assert.match(wa,/Source category:/);
 assert.match(wa,/<RelatedOutfitterCaptains publicId=\{g\.id\}/);
 assert.match(or,/<RelatedOutfitterCaptains publicId=\{g\.registration\}/);
 assert.match(panel,/Ratings and captain claims stay separate/);
 assert.match(panel,/relatedOutfitterGroup/);
 assert.doesNotMatch(panel,/verified business ownership|government confirmed/i);
});
