import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read=(path)=>readFileSync(path,'utf8');
const js=ts.transpileModule(read('lib/captain-fisheries.ts'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
}).outputText;
const api={};
vm.runInNewContext(js,{exports:api});
const base=()=>({
 vessels:[
  {id:'v1',label:'28 ft covered Willie sled',type:'Sled / jet boat',covered:true,heated:true,maxAnglers:6,fishCare:['Icing','Bleeding']},
  {id:'v2',label:'17 ft drift boat',type:'Drift boat',covered:false,heated:false,maxAnglers:3,fishCare:['Bleeding']},
 ],
 offerings:[
  {id:'p1',title:'Buoy 10 Fall Salmon',waterway:'Buoy 10 / Columbia Estuary',
   launchArea:'Hammond',species:['Chinook','Coho'],months:[9,8],
   vesselId:'v1',bookingStyle:'per_seat',duration:'full_day'},
  {id:'p2',title:'Winter Steelhead Drift Trip',waterway:'Nehalem Bay',
   launchArea:'Wheeler',species:['Steelhead'],months:[1,2,3],
   vesselId:'v2',bookingStyle:'private_boat',duration:'full_day'},
 ]
});

test('a single profile can offer genuinely distinct vessels and seasonal trips',()=>{
 const draft=base();
 assert.deepEqual(Array.from(api.validateCaptainFisheryDraft(draft)),[]);
 const row=api.createCaptainProposalInsert(draft,'guide-uuid','user-uuid');
 assert.equal('review_state' in row,false); // DB default is pending
 assert.equal(row.guide_id,'guide-uuid');
 assert.equal(row.submitted_by,'user-uuid');
 assert.equal(row.vessels.length,2);
 assert.equal(row.vessels[0].heated,true);
 assert.equal(row.vessels[1].heated,false);
 assert.equal(row.vessels[0].max_anglers,6);
 assert.equal(row.vessels[1].max_anglers,3);
 assert.equal(row.offerings[0].vessel_id,'v1');
 assert.equal(row.offerings[1].vessel_id,'v2');
 assert.equal(row.offerings[0].booking_style,'per_seat');
 assert.equal(row.offerings[1].booking_style,'private_boat');
 assert.deepEqual(Array.from(row.offerings[0].months),[8,9]);
 for(const field of ['vessel','booking_style','license_status','uscg_verified','trip_verified',
                      'is_published','payment_tier','approved_at','public_profile'])
  assert.equal(field in row,false);
});

test('referential integrity: a trip may only name a vessel in the same profile',()=>{
 const draft=base();
 draft.offerings[1].vesselId='v999';
 assert.match(api.validateCaptainFisheryDraft(draft).join(' '),/assign an existing vessel/);
 assert.throws(()=>api.createCaptainProposalInsert(draft,'g','u'),/invalid/);
});

test('reject duplicate vessel IDs, package IDs and duplicate title plus waterway',()=>{
 const d=base();
 d.vessels[1].id='v1';
 assert.match(api.validateCaptainFisheryDraft(d).join(' '),/duplicate vessel ID/);
 let e=base();e.offerings[1].id='p1';
 assert.match(api.validateCaptainFisheryDraft(e).join(' '),/duplicate package ID/);
 e=base();e.offerings[1].title=e.offerings[0].title;
 e.offerings[1].waterway=e.offerings[0].waterway;
 assert.match(api.validateCaptainFisheryDraft(e).join(' '),/duplicate trip name\/waterway/);
 // Same waterway with a genuinely different named package is allowed.
 e.offerings[1].title='Buoy 10 Sturgeon Trip';
 assert.equal(api.validateCaptainFisheryDraft(e).length,0);
});

test('reject malformed months, duplicate species, unsupported booking and vessel capacity',()=>{
 let d=base();d.offerings[0].months=[0,13];
 assert.match(api.validateCaptainFisheryDraft(d).join(' '),/valid operating months/);
 d=base();d.offerings[0].months=[8,8];
 assert.match(api.validateCaptainFisheryDraft(d).join(' '),/valid operating months/);
 d=base();d.offerings[0].species=['Chinook','Chinook'];
 assert.match(api.validateCaptainFisheryDraft(d).join(' '),/valid species/);
 d=base();d.offerings[0].bookingStyle='paid_boost';
 assert.match(api.validateCaptainFisheryDraft(d).join(' '),/booking style/);
 d=base();d.offerings[1].duration='unknown_90_day';
 assert.match(api.validateCaptainFisheryDraft(d).join(' '),/duration/);
 d=base();d.vessels[0].maxAnglers=31;
 assert.match(api.validateCaptainFisheryDraft(d).join(' '),/angler capacity/);
 d=base();d.vessels[0].maxAnglers=3.5;
 assert.match(api.validateCaptainFisheryDraft(d).join(' '),/angler capacity/);
});

test('invalid or injected personal contacts cannot enter public claims',()=>{
 const d=base();d.vessels[0].label='captain@example.com';
 assert.match(api.validateCaptainFisheryDraft(d).join(' '),/no contact details/);
 d.vessels[0].label='29 ft comfortable sled';
 d.offerings[0].launchArea='503-555-0199';
 assert.match(api.validateCaptainFisheryDraft(d).join(' '),/private contact details/);
 d.offerings[0].launchArea='Hammond';
 d.offerings[0].waterway='<script>evil</script>';
 assert.ok(api.validateCaptainFisheryDraft(d).length>0);
});

test('unknown keys and forged license/review fields fail closed',()=>{
 const d=base();d.paid_boost=true;
 assert.match(api.validateCaptainFisheryDraft(d).join(' '),/Invalid captain draft structure/);
 delete d.paid_boost;
 d.vessels[0].verified_by_uscg=true;
 assert.match(api.validateCaptainFisheryDraft(d).join(' '),/invalid boat fields/);
 delete d.vessels[0].verified_by_uscg;
 d.offerings[0].rank_override=100;
 assert.match(api.validateCaptainFisheryDraft(d).join(' '),/invalid trip-package fields/);
});

test('bounded draft restore accepts incomplete legitimate work and rejects corrupt storage',()=>{
 const pending=api.makeEmptyCaptainDraft();
 assert.equal(api.isSafeCaptainDraft(pending),true);
 assert.ok(api.validateCaptainFisheryDraft(pending).length>0);
 assert.equal(api.isSafeCaptainDraft({...pending,unexpected:true}),false);
 const oversized=api.makeEmptyCaptainDraft();
 oversized.offerings[0].title='A'.repeat(81);
 assert.equal(api.isSafeCaptainDraft(oversized),false);
 const wrongRef=api.makeEmptyCaptainDraft();
 wrongRef.offerings[0].vesselId='v2';
 assert.equal(api.isSafeCaptainDraft(wrongRef),false);
 assert.equal(api.isSafeCaptainDraft(null),false);
 assert.equal(api.isSafeCaptainDraft({offerings:[{waterway:'x'}],vessels:[]}),false);
});

test('new local stable IDs do not reassign existing boats or packages',()=>{
 assert.equal(api.nextDraftId([{id:'v1'},{id:'v3'}],'v'),'v4');
 assert.equal(api.nextDraftId([{id:'p1'},{id:'p3'}],'p'),'p4');
 assert.equal(api.nextDraftId([{id:'v1'}],'v'),'v2');
});

test('up to four boats and eight packages, but no unbounded intake',()=>{
 let d=base();
 d.vessels=Array.from({length:5},(_,i)=>({...base().vessels[0],id:'v'+(i+1)}));
 assert.match(api.validateCaptainFisheryDraft(d).join(' '),/between one and four vessels/);
 d=base();d.offerings=Array.from({length:9},(_,i)=>({...base().offerings[0],id:'p'+(i+1),
  title:'Unique '+i}));
 assert.match(api.validateCaptainFisheryDraft(d).join(' '),/between one and eight/);
});

test('the editor retains manual moderation and blocks removing an assigned boat',()=>{
 const view=read('components/CaptainFisheryEditor.tsx');
 const page=read('app/claim/[id]/page.tsx');
 assert.match(page,/<CaptainFisheryEditor listing=\{g\.id\}/);
 assert.match(view,/sessionStorage\.getItem/);
 assert.match(view,/isSafeCaptainDraft/);
 assert.match(view,/from\('guide_claims'\)/);
 assert.match(view,/approvedOwner/);
 assert.match(view,/createCaptainProposalInsert/);
 assert.match(view,/Reassign each trip before removing it/);
 assert.match(view,/Boat style/);
 assert.match(view,/Which boat runs this trip/);
 assert.match(view,/Submit details for manual review/);
 assert.match(view,/Draft preview only/);
 assert.doesNotMatch(view,/featured_ranking|paid_badge|status:\s*'published'/);
});

test('unapplied SQL enforces approved owner + private pending-only fleet proposals',()=>{
 const sql=read('supabase/migrations/0003_pending_captain_fishery_proposals.sql');
 assert.match(sql,/PROPOSED UNAPPLIED SCHEMA/);
 assert.match(sql,/valid_captain_fleet_proposal\(offerings,vessels\)/);
 assert.match(sql,/jsonb_array_length\(p_vessels\) not between 1 and 4/);
 assert.match(sql,/jsonb_array_length\(p_offerings\) not between 1 and 8/);
 assert.match(sql,/vessel_ids/);
 assert.match(sql,/trip->>'vessel_id'/);
 assert.match(sql,/package_signatures/);
 assert.match(sql,/c\.claimant_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/c\.status='approved'/);
 assert.match(sql,/review_state='pending'/);
 assert.match(sql,/force row level security/);
 assert.match(sql,/grant select,insert on table public\.guide_fishery_proposals to authenticated/i);
 assert.doesNotMatch(sql,/create policy .* for update/i);
 assert.doesNotMatch(sql,/create policy .* for delete/i);
 assert.doesNotMatch(sql,/for select to anon/i);
 assert.doesNotMatch(sql,/security definer/i);
 assert.match(sql,/No auto-publication/);
});
