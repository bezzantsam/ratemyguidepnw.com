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
 assert.equal(summary.warnings.some(x=>x.includes('Human approval')),false);
 assert.equal(summary.warnings.some(x=>x.includes('Human')),true);
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
