import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const file=path=>readFileSync(path,'utf8');
const code=ts.transpileModule(file('lib/guide-db-identity.ts'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
}).outputText;
const api={};
vm.runInNewContext(code,{exports:api});
const match=api.matchesPublicGuideIdentity;

test('matching directory name AND outfitter can safely resolve a backend guide',()=>{
 assert.equal(match({name:'John Petrisin-Connolly',business:'John Thomas Adventures'},
   {full_name:' John Petrisin-Connolly ',outfit_name:'John Thomas Adventures'}),true);
 assert.equal(match({name:'Joe Smith',business:null},
   {full_name:'JOE SMITH',outfit_name:''}),true);
 assert.equal(match({name:'Matt Chandler',business:'Get Hooked NW'},
   {full_name:'Matt Chandler',outfit_name:'Get Hooked NW'}),true);
});

test('matching historical Washington slug alone cannot match another person',()=>{
 assert.equal(match({name:'David Godfrey',business:'Salmon Seattle'},
   {full_name:'Darrell Johnson',outfit_name:'Far Corners Adventures'}),false);
 assert.equal(match({name:'Mark Coleman',business:'All Rivers & Saltwater Charters'},
   {full_name:'Kohl Baxter',outfit_name:null}),false);
 assert.equal(match({name:'Wayne Morris',business:'Renegade Fishing Charters'},null),false);
});

test('outfitter mismatch fails closed even for the same captain name',()=>{
 assert.equal(match({name:'Scott Cook',business:'Fly and Field Guide Services LLC'},
   {full_name:'Scott Cook',outfit_name:'Different Guide Service'}),false);
 assert.equal(match({name:'John Doe',business:null},
   {full_name:'John Doe',outfit_name:'Privately Held Outfitters'}),false);
 assert.equal(match({name:'John Doe',business:'Privately Held Outfitters'},
   {full_name:'John Doe',outfit_name:null}),false);
});

test('missing full name and corrupted identifiers do not match',()=>{
 assert.equal(match({name:'Sam Roe',business:null},{full_name:null,outfit_name:null}),false);
 assert.equal(match({name:'',business:'Guide Co'},{full_name:'',outfit_name:'Guide Co'}),false);
 assert.equal(match({name:'Sam Roe',business:null},undefined),false);
});

test('known Oregon ID suffixes remain exact and are not collapsed to base ID',()=>{
 const records=JSON.parse(file('lib/oregon-guides.json'));
 const specials=['OG.0000484.BRO','OG.0001225.F&F','OG.0001399.DJFL',
   'OG.0001583.SRA','OG.0003194.SG'];
 const slugs=records.map(r=>r.registration.toLowerCase()
   .replace(/[^a-z0-9]+/g,'-').replace(/-$/,''));
 for(const id of specials){
   const index=records.findIndex(r=>r.registration===id);
   assert.ok(index>=0,id);
   assert.ok(slugs[index].split('-').length>=3,id);
 }
 assert.equal(new Set(slugs).size,records.length);
});

test('every guide review read is protected by BOTH live identity fields',()=>{
 const source=file('components/CaptainReviews.tsx');
 assert.match(source,/matchesPublicGuideIdentity\(\{name:expectedName,business:expectedBusiness\},guide\)/);
 assert.match(source,/select\('id,full_name,outfit_name'\)/);
 assert.match(source,/setGuideId\(''\)/);
 assert.match(source,/setReviews\(\[\]\)/);
 assert.match(source,/return;\s*\}\s*setGuideId\(guide\.id\)/);
 for(const page of ['app/guides/[slug]/page.tsx','app/washington/[id]/page.tsx']){
   const component=file(page);
   assert.match(component,/expectedName=\{g\.name\}/);
   assert.match(component,/expectedBusiness=\{g\.business\}/);
 }
});

test('captain claim and seasonal offer screens protect ownership lookups from identity drift',()=>{
 const page=file('app/claim/[id]/page.tsx');
 assert.match(page,/expectedBusiness=\{g\.business\}/);
 assert.match(page,/business=\{g\.business\}/);
 for(const component of ['components/ClaimForm.tsx','components/CaptainFisheryEditor.tsx']){
   const source=file(component);
   if(component.includes('ClaimForm'))
     assert.match(source,/matchesPublicGuideIdentity\(\{name,business:expectedBusiness\},guide\)/);
   else assert.match(source,/matchesPublicGuideIdentity\(\{name,business\},guide\)/);
   assert.match(source,/select\('id,full_name,outfit_name'\)/);
 }
});
