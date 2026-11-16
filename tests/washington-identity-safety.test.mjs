import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=path=>readFileSync(path,'utf8');
const exports={};
vm.runInNewContext(ts.transpileModule(read('lib/guide-db-identity.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
const match=exports.matchesPublicGuideIdentity;
test('guide row requires the matching name and business',()=>{
 const expected={name:'Example Captain',business:'Example Outfit'};
 assert.equal(match(expected,{full_name:' example captain ',outfit_name:'Example Outfit'}),true);
 assert.equal(match(expected,{full_name:'Other Captain',outfit_name:'Example Outfit'}),false);
 assert.equal(match(expected,{full_name:'Example Captain',outfit_name:'Other Outfit'}),false);
 assert.equal(match(expected,null),false);
});
test('Washington review targets are closed until a database identity mapping is reviewed',()=>{
 const source=read('components/CaptainReviews.tsx');
 // With no reviewed WA database mapping, this candidate makes no review queries at all.
 assert.match(source,/Review data is unavailable/);
 assert.doesNotMatch(source,/createClient|\.from\(|\.maybeSingle\(|\.insert\(|\.upsert\(|\.rpc\(/);
});
test('claim targets cannot be submitted',()=>{
 assert.doesNotMatch(read('components/ClaimForm.tsx'),/\.insert\(|\.upsert\(|\.rpc\(/);
 assert.doesNotMatch(read('app/claim/[id]/page.tsx'),/<ClaimForm/);
});
test('Washington profiles do not load other slug-based database widgets',()=>{
 const page=read('app/washington/[id]/page.tsx');
 assert.doesNotMatch(page,/<CaptainDetails|<CaptainMedia/);
 assert.match(page,/expectedName=\{g.name\} expectedBusiness=\{g.business\}/);
});
