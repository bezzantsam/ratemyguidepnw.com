import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read=path=>readFileSync(path,'utf8');
const js=ts.transpileModule(read('lib/captain-fisheries.ts'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
}).outputText;
const api={};
vm.runInNewContext(js,{exports:api});
const draft=()=>({
  offerings:[{waterway:'Buoy 10 / Columbia Estuary',launchArea:'Astoria',species:['Chinook','Coho'],months:[8,9]}],
  vessel:{type:'Sled / jet boat',covered:true,heated:true,maxAnglers:6,fishCare:['Bleeding','Icing']},
  bookingStyle:'per_seat',
});

test('captains may submit genuine seasonal fishery and vessel fields without license claims',()=>{
 const value=draft();
 assert.deepEqual(Array.from(api.validateCaptainFisheryDraft(value)),[]);
 const row=api.createCaptainProposalInsert(value,'guide-uuid','user-uuid');
 assert.equal(row.review_state,'pending');
 assert.equal(row.guide_id,'guide-uuid');
 assert.equal(row.submitted_by,'user-uuid');
 assert.equal(row.offerings.length,1);
 assert.deepEqual(Array.from(row.offerings[0].months),[8,9]);
 assert.equal(row.vessel.max_anglers,6);
 assert.equal(row.booking_style,'per_seat');
 for(const field of ['license_status','uscg_verified','trip_verified','is_published','payment_tier','approval_status'])
  assert.equal(field in row,false);
});

test('reject invalid months, duplicates and unsupported species',()=>{
 let d=draft();d.offerings[0].months=[0,13];
 assert.match(api.validateCaptainFisheryDraft(d).join(' '),/valid operating months/);
 d=draft();d.offerings[0].months=[8,8];
 assert.match(api.validateCaptainFisheryDraft(d).join(' '),/valid operating months/);
 d=draft();d.offerings[0].species=['Chinook','Unverified unicornfish'];
 assert.match(api.validateCaptainFisheryDraft(d).join(' '),/valid species/);
 d=draft();d.offerings[0].species=[];
 assert.match(api.validateCaptainFisheryDraft(d).join(' '),/valid species/);
 d=draft();d.offerings[0].species=['Chinook','Chinook'];
 assert.match(api.validateCaptainFisheryDraft(d).join(' '),/valid species/);
});

test('reject duplicate fisheries and excessive uncontrolled intake',()=>{
 const d=draft();
 d.offerings.push({...d.offerings[0],months:[10]});
 assert.match(api.validateCaptainFisheryDraft(d).join(' '),/duplicate waterways/);
 d.offerings=Array.from({length:9},(_,i)=>({...draft().offerings[0],waterway:'Waterway '+i}));
 assert.match(api.validateCaptainFisheryDraft(d).join(' '),/between one and eight/);
});

test('reject capacity outside safe bounds and accidental private contacts',()=>{
 const d=draft();d.vessel.maxAnglers=31;
 assert.match(api.validateCaptainFisheryDraft(d).join(' '),/capacity/);
 d.vessel.maxAnglers=1;
 d.offerings[0].launchArea='captain@example.com';
 assert.match(api.validateCaptainFisheryDraft(d).join(' '),/private contact details/);
 d.offerings[0].launchArea='';
 d.offerings[0].waterway='503-555-0199';
 assert.match(api.validateCaptainFisheryDraft(d).join(' '),/private contact details/);
 d.offerings[0].waterway='<script>bad</script>';
 assert.ok(api.validateCaptainFisheryDraft(d).length>0);
});

test('invalid vessel or booking claims never produce an insert payload',()=>{
 const d=draft();d.bookingStyle='paid_boost';
 assert.match(api.validateCaptainFisheryDraft(d).join(' '),/booking style/);
 assert.throws(()=>api.createCaptainProposalInsert(d,'a','b'),/invalid/);
 d.bookingStyle='private_boat';d.vessel.fishCare=['Promised trophy'];
 assert.match(api.validateCaptainFisheryDraft(d).join(' '),/fish-care/);
});

test('claim form is draft-first, with independently approved-owner permission gate',()=>{
 const view=read('components/CaptainFisheryEditor.tsx');
 const page=read('app/claim/[id]/page.tsx');
 assert.match(page,/<CaptainFisheryEditor listing=\{g\.id\}/);
 assert.match(view,/sessionStorage/);
 assert.match(view,/from\('guide_claims'\)/);
 assert.match(view,/approvedOwner/);
 assert.match(view,/createCaptainProposalInsert/);
 assert.match(view,/manual review/);
 assert.match(view,/Draft preview only/);
 assert.doesNotMatch(view,/setStatus\('approved'\)/);
 assert.doesNotMatch(view,/featured_ranking|paid_badge/);
});

test('proposed migration restricts insert to approved owner and pending-only, with no public read/publish',()=>{
 const sql=read('supabase/migrations/0003_pending_captain_fishery_proposals.sql');
 assert.doesNotMatch(sql,/create or replace function public\\.can_propose_guide_fisheries/);
 assert.match(sql,/c\.claimant_id = \(select auth\.uid\(\)\)/);
 assert.match(sql,/c\.status = 'approved'/);
 assert.match(sql,/enable row level security/i);
 assert.match(sql,/review_state = 'pending'/);
 assert.match(sql,/submitted_by = \(select auth\.uid\(\)\)/);
 assert.match(sql,/revoke all on table public\.guide_fishery_proposals from public,anon,authenticated/i);
 assert.match(sql,/grant select,insert on table public\.guide_fishery_proposals to authenticated/i);
 assert.doesNotMatch(sql,/create policy .* for update/i);
 assert.doesNotMatch(sql,/create policy .* for delete/i);
 assert.doesNotMatch(sql,/for select to anon/i);
 assert.doesNotMatch(sql,/grant .*update.* on table public\.guide_fishery_proposals to authenticated/i);
 assert.match(sql,/No auto-publication/);
});
