import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read=path=>readFileSync(path,'utf8');
function load(path,requireFn=()=>{throw new Error('Unexpected require')}){
 const module={exports:{}};
 const compiled=ts.transpileModule(read(path),{
   compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
 }).outputText;
 vm.runInNewContext(compiled,{exports:module.exports,module,require:requireFn,Map,Set,Error});
 return module.exports;
}
const captain=load('lib/captain-fisheries.ts');
const review=load('lib/moderation-review.ts',path=>{
 if(path==='./captain-fisheries')return captain;
 throw Error('Unexpected import '+path);
});
function base(){
 return {
  vessels:[{id:'v1',label:'28 foot river sled',type:'Sled / jet boat',
    covered:true,heated:false,maxAnglers:5,fishCare:['Icing','Bleeding']}],
  offerings:[{id:'p1',title:'Fall Chinook fishing',waterway:'Lower Columbia River',
    launchArea:'Astoria Marina',species:['Chinook','Coho'],months:[8,9],
    vesselId:'v1',bookingStyle:'per_seat',duration:'full_day'}],
 };
}
const copy=value=>JSON.parse(JSON.stringify(value));
const evaluate=(a,b,ownership='approved')=>review.reviewCaptainProposal(a,b,{ownership});

test('month and amenity corrections are lower queue priority, but still require human review',()=>{
 const original=base(),proposal=copy(original);
 proposal.offerings[0].months=[9,8,10];
 proposal.vessels[0].heated=true;
 const summary=evaluate(original,proposal);
 assert.equal(summary.risk,'low');
 assert.equal(summary.humanApprovalRequired,true);
 assert.equal(summary.hasChanges,true);
 assert.deepEqual(Array.from(summary.changes,x=>x.path).sort(),[
  'offerings.p1.months','vessels.v1.heated'
 ].sort());
 assert.equal(summary.warnings.some(x=>x.includes('Human approval')),true);
});

test('boating location, type and vessel reassignments are medium priority',()=>{
 const original=base(),proposal=copy(original);
 proposal.vessels.push({id:'v2',label:'North Coast drift boat',type:'Drift boat',
  covered:false,heated:false,maxAnglers:3,fishCare:['Bleeding']});
 proposal.offerings[0].vesselId='v2';
 proposal.offerings[0].waterway='North Coast River';
 const summary=evaluate(original,proposal);
 assert.equal(summary.risk,'medium');
 assert.equal(summary.changes.length,3);
 assert.ok(summary.changes.some(x=>x.kind==='added'&&x.path==='vessels.v2'));
 assert.ok(summary.warnings.some(x=>x.includes('assigned')));
 assert.ok(summary.warnings.some(x=>x.includes('Waterway')));
});

test('first submission, unapproved ownership or a missing baseline are high risk',()=>{
 const proposed=base();
 assert.equal(evaluate(null,proposed).risk,'high');
 assert.equal(evaluate(base(),copy(proposed),'unapproved').risk,'high');
 assert.ok(evaluate(base(),copy(proposed),'unapproved').warnings.some(x=>x.includes('verify profile authority')));
 assert.throws(()=>review.reviewCaptainProposal(base(),proposed,{ownership:'claimed_verified'}),/Invalid claim state/);
});

test('same data in different vessel, package, month and species order produces no changes',()=>{
 const before=base();
 before.vessels.push({id:'v2',label:'Drift boat backup',type:'Drift boat',covered:false,
  heated:false,maxAnglers:null,fishCare:['Bleeding']});
 before.offerings.push({id:'p2',title:'Winter steelhead',waterway:'Nehalem River',
  launchArea:'North Coast Oregon',species:['Steelhead'],months:[1,2,3],vesselId:'v2',
  bookingStyle:'private_boat',duration:'full_day'});
 const after=copy(before);
 after.offerings.reverse();
 after.vessels.reverse();
 after.offerings.find(v=>v.id==='p1').species.reverse();
 after.offerings.find(v=>v.id==='p1').months.reverse();
 after.vessels.find(v=>v.id==='v1').fishCare.reverse();
 const result=evaluate(before,after);
 assert.equal(result.hasChanges,false);
 assert.equal(result.changes.length,0);
 assert.equal(result.humanApprovalRequired,true);
});

test('changed keys produce minimal diff, not entire payload or unknown fields',()=>{
 const before=base(),after=copy(before);
 after.vessels[0].maxAnglers=6;
 const summary=evaluate(before,after);
 assert.equal(summary.changes.length,1);
 assert.equal(summary.changes[0].path,'vessels.v1.maxAnglers');
 assert.equal(summary.changes[0].before,'5');
 assert.equal(summary.changes[0].after,'6');
 assert.equal('guide_id' in summary,false);
 assert.equal('credentials' in summary,false);
});

test('invalid or forged fields cannot be triaged as valid changes',()=>{
 const before=base(),after=copy(before);
 after.offerings[0].vesselId='v999';
 assert.throws(()=>evaluate(before,after),/Invalid proposed captain details/);
 const forged=copy(before);
 forged.paid_ranking_override=100;
 assert.throws(()=>evaluate(before,forged),/Invalid proposed captain details/);
 const nullBaselines=copy(before);
 nullBaselines.offerings[0].months=[];
 assert.throws(()=>evaluate(nullBaselines,before),/Invalid published baseline/);
});

test('production /admin/inbox is hard disabled, and preview includes synthetic data only',()=>{
 const page=read('app/admin/inbox/page.tsx');
 const ui=read('components/ModeratorDiffPreview.tsx');
 assert.match(page,/process\.env\.NODE_ENV\s*!==\s*'development'/);
 assert.match(page,/notFound\(\)/);
 assert.match(page,/force-dynamic/);
 assert.match(page,/synthetic|fabricated/i);
 assert.doesNotMatch(page,/\.from\('guide_fishery_proposals'\)/);
 assert.doesNotMatch(page,/SERVICE_ROLE|service_role|supabaseAdmin|createClient/);
 assert.match(ui,/No moderation actions are connected/);
 assert.doesNotMatch(ui,/onClick=|<button|Approve & Publish/i);
 const css=read('app/globals.css');
 assert.match(css,/moderation-compare/);
 assert.match(css,/max-width:600px/);
});


test('new boats expose their complete submitted specs instead of only a label',()=>{
 const previous=base(),proposed=copy(previous);
 proposed.vessels.push({id:'v2',label:'18-foot drift boat',type:'Drift boat',
  covered:false,heated:false,maxAnglers:3,fishCare:['Bleeding']});
 const result=evaluate(previous,proposed);
 const added=result.changes.find(x=>x.path==='vessels.v2');
 assert.ok(added);
 assert.equal(added.kind,'added');
 for(const text of ['18-foot drift boat','Drift boat','Covered: No','Heated: No','Max anglers: 3','Bleeding']){
  assert.ok(added.after.includes(text),text);
 }
});

test('new and removed seasonal packages reveal species, months, fishery and assigned vessel',()=>{
 const old=base(),after=copy(old);
 after.vessels.push({id:'v2',label:'Winter drift boat',type:'Drift boat',
  covered:false,heated:false,maxAnglers:2,fishCare:[]});
 after.offerings.push({id:'p2',title:'Winter steelhead',waterway:'Nehalem River',
  launchArea:'Wheeler',species:['Steelhead'],months:[1,2,3],vesselId:'v2',
  bookingStyle:'private_boat',duration:'full_day'});
 const added=evaluate(old,after).changes.find(x=>x.path==='offerings.p2');
 assert.ok(added);
 for(const text of ['Winter steelhead','Nehalem River','Wheeler','Steelhead',
                    '1, 2, 3','Winter drift boat','(v2)','private_boat','full_day']){
  assert.ok(added.after.includes(text),text);
 }
 const removed=evaluate(after,old).changes.find(x=>x.path==='offerings.p2');
 assert.ok(removed);
 assert.equal(removed.kind,'removed');
 assert.ok(removed.before.includes('Nehalem River'));
 assert.ok(removed.before.includes('Winter drift boat'));
 assert.equal(removed.after,'Not listed');
});

test('credential and insurance wording is flagged on new submissions and changed titles',()=>{
 const initial=base();
 initial.vessels[0].label='Licensed and Insured Boat';
 initial.offerings[0].title='USCG 100-ton Master Salmon Charter';
 const first=evaluate(null,initial);
 assert.equal(first.risk,'high');
 assert.deepEqual(Array.from(first.flags,f=>f.path).sort(),[
  'vessels.v1.label','offerings.p1.title'
 ].sort());
 assert.ok(first.flags.every(f=>f.code==='credential_or_insurance_claim'&&f.priority==='high'));
 assert.ok(first.warnings.some(x=>x.includes('independent evidence')));

 const before=base(),proposed=copy(before);
 proposed.offerings[0].title='Coast Guard Certified Captain Charter';
 const changed=evaluate(before,proposed);
 assert.equal(changed.risk,'high');
 assert.equal(changed.flags.length,1);
 assert.equal(changed.flags[0].path,'offerings.p1.title');
});

test('already approved unchanged claims do not repeatedly trigger new flags, ordinary names remain neutral',()=>{
 const before=base();before.offerings[0].title='Licensed Columbia Salmon Charter';
 const same=evaluate(before,copy(before));
 assert.equal(same.hasChanges,false);
 assert.equal(same.flags.length,0);
 const original=base(),proposal=copy(original);
 proposal.offerings[0].title='Master Angler Salmon Trip';
 const result=evaluate(original,proposal);
 assert.equal(result.flags.length,0);
 assert.equal(result.risk,'medium');
});

test('capacity changes warrant additional human attention',()=>{
 const before=base(),after=copy(before);
 after.vessels[0].maxAnglers=12;
 const report=evaluate(before,after);
 assert.equal(report.risk,'medium');
 assert.ok(report.changes.some(x=>x.path==='vessels.v1.maxAnglers'));
 assert.equal(report.humanApprovalRequired,true);
});

test('moderator preview surfaces warning flags but never provides publishing actions',()=>{
 const ui=read('components/ModeratorDiffPreview.tsx');
 assert.match(ui,/Claims requiring independent evidence/);
 assert.match(ui,/summary\.flags/);
 assert.match(ui,/not findings of wrongdoing/);
 assert.doesNotMatch(ui,/<button|onClick|Approve & Publish/);
});
