import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read=(path)=>readFileSync(path,'utf8');
const source=read('lib/intent-events.ts');
const compiled=ts.transpileModule(source,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true
}}).outputText;
const exposed={};
vm.runInNewContext(compiled,{
 exports:exposed,
 require:(path)=>{
  if(path==='../research/market-adapters.json')return JSON.parse(read('research/market-adapters.json'));
  throw Error('Unexpected event-contract import '+path);
 }
});
const validate=exposed.validateIntentEventShape;

test('analytics collection remains disabled and cannot be activated by payload',()=>{
 assert.equal(exposed.EVENT_COLLECTION_ENABLED,false);
 assert.deepEqual(Array.from(exposed.INTENT_EVENT_TYPES),[
  'directory_filter_applied','guide_profile_viewed','booking_referral_clicked'
 ]);
 assert.equal(existsSync('app/api/events/route.ts'),false);
 assert.equal(existsSync('app/api/intent-events/route.ts'),false);
 assert.doesNotMatch(source,/fetch\(|navigator\.|document\.cookie|localStorage|sendBeacon|createClient\(/);
});

test('accepts only coarse, allowlisted search intent without free text or session identifiers',()=>{
 const row=validate({
  version:1,market_id:'pnw',event_type:'directory_filter_applied',
  filter_kind:'species',species_slug:'spring-chinook',target_month:5,
  corridor_slug:'columbia-estuary'
 });
 assert.equal(row.event_type,'directory_filter_applied');
 assert.equal(row.species_slug,'spring-chinook');
 assert.equal(row.target_month,5);
 assert.equal('session_hash' in row,false);
 assert.equal('occurred_at' in row,false);
 assert.equal('raw_query' in row,false);
});

test('guide ID syntax preserves historical suffixed Oregon registration and stable Washington IDs',()=>{
 const ids=['OG.0000315','OG.0001225.F&F','wa-005','wa-062'];
 for(const guide_id of ids){
  const row=validate({version:1,market_id:'pnw',
   event_type:'guide_profile_viewed',guide_id});
  assert.equal(row.guide_id,guide_id);
 }
});

test('outbound event is a booking click only, not a confirmed booking or revenue',()=>{
 for(const outbound_type of ['website','booking_page','telephone']){
  const row=validate({version:1,market_id:'pnw',
   event_type:'booking_referral_clicked',guide_id:'wa-005',outbound_type,
   waterway_slug:'buoy-10'});
  assert.equal(row.outbound_type,outbound_type);
  assert.equal(row.event_type,'booking_referral_clicked');
  assert.equal('booking_completed' in row,false);
  assert.equal('revenue' in row,false);
 }
});

test('rejects personal data, fingerprinting, ad identifiers and admin/status privileges',()=>{
 const base={version:1,market_id:'pnw',event_type:'guide_profile_viewed',guide_id:'wa-005'};
 const bad={
  email:'angler@example.com',phone:'+15035551234',
  ip:'192.0.2.3',latitude:45.5,longitude:-123.5,
  lat:45.5,lon:-123.5,
  user_id:'uuid',session_hash:'salted-ua',device_fingerprint:'abc',
  raw_query:'where are the best fishing spots near my house',
  referrer_url:'https://private.example/?token=123',
  review_body:'private evidence',booking_completed:true,
  revenue:2000,occurred_at:'2026-11-14T05:00:00Z',
  license_verified:true,moderator_role:'admin',
  publish_state:'approved',paid_rank:1,
 };
 for(const [key,value] of Object.entries(bad)){
  assert.throws(()=>validate({...base,[key]:value}),/Unapproved event field/,key);
 }
});

test('rejects spoofed, unconfigured or injected event names and markets',()=>{
 const base={version:1,market_id:'pnw',event_type:'guide_profile_viewed',guide_id:'wa-005'};
 for(const bad of [
  {...base,version:2},
  {...base,market_id:'national'},
  {...base,market_id:'__proto__'},
  {...base,event_type:'guide_booking_confirmed'},
  {...base,event_type:'review_approved'},
  {...base,event_type:'captain_claim_verified'},
  {...base,guide_id:'UNKNOWN-USER-001'},
  {...base,guide_id:'OG.0000123; DROP TABLE'},
  {...base,guide_id:'OG.0000012.'},
  {...base,guide_id:'wa-01'},
 ]){
  assert.throws(()=>validate(bad),/Unsupported|Unknown|Unapproved|Invalid/,JSON.stringify(bad));
 }
});

test('rejects free-form filter values, precise location strings and months outside 1–12',()=>{
 const base={version:1,market_id:'pnw',event_type:'directory_filter_applied',
  filter_kind:'waterway',waterway_slug:'buoy-10'};
 for(const extra of [
  {waterway_slug:'45.4231,-123.9087'},
  {waterway_slug:'my secret spot'},
  {waterway_slug:'a'.repeat(65)},
  {species_slug:'spring chinook'},
  {corridor_slug:'north/river'},
  {target_month:0},
  {target_month:13},
  {target_month:4.5},
  {target_month:'8'},
  {filter_kind:'query'},
  {filter_kind:'waterway',waterway_slug:undefined},
 ]){
  assert.throws(()=>validate({...base,...extra}),/Invalid|Unrecognized|Filter value/,JSON.stringify(extra));
 }
 assert.throws(()=>validate({...base,guide_id:'wa-005'}),/Directory filters/);
 assert.throws(()=>validate({...base,outbound_type:'website'}),/Directory filters/);
 assert.throws(()=>validate({...base,filter_kind:'species'}),/Filter value/);
});

test('referral and profile events require a guide ID and do not accept unrelated event semantics',()=>{
 const b={version:1,market_id:'pnw'};
 for(const bad of [
  {...b,event_type:'guide_profile_viewed'},
  {...b,event_type:'booking_referral_clicked',guide_id:'wa-005'},
  {...b,event_type:'booking_referral_clicked',guide_id:'wa-005',outbound_type:'paypal'},
  {...b,event_type:'guide_profile_viewed',guide_id:'wa-005',filter_kind:'waterway'},
  {...b,event_type:'guide_profile_viewed',guide_id:'wa-005',outbound_type:'website'},
  {...b,event_type:'booking_referral_clicked',guide_id:'wa-005',
   outbound_type:'website',filter_kind:'month',target_month:8},
 ]){
  assert.throws(()=>validate(bad),/require|Unrecognized/,JSON.stringify(bad));
 }
});

test('rejects non-record payloads and uncontrolled bulk records',()=>{
 for(const value of [null,[],[{}],'',2,true]){
  assert.throws(()=>validate(value),/Expected one event object/);
 }
 const valid={version:1,market_id:'pnw',event_type:'guide_profile_viewed',guide_id:'wa-005'};
 assert.throws(()=>validate({...valid,
  corridor_slug:'columbia-estuary',waterway_slug:'buoy-10',species_slug:'chinook',
  filter_kind:'species',outbound_type:'website',target_month:8,unknown_key:'no'}),
  /Unapproved|too large/);
});

test('no PII collection, database writes or fake uniqueness may be inferred from event validators',()=>{
 assert.doesNotMatch(source,/ip_address|rough_ua|user_agent|sha256\s*\(/i);
 assert.doesNotMatch(source,/\bsupabase\b|insert\(|document\.cookie|deviceFingerprint/i);
 const contract=read('docs/INTENT_EVENTS_READINESS.md');
 assert.match(contract,/no live endpoint/i);
 assert.match(contract,/not verified bookings/i);
 assert.match(contract,/retention/i);
 assert.match(contract,/privacy notice/i);
 assert.match(contract,/bot/i);
});
