import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=p=>readFileSync(p,'utf8');
const bundle=JSON.parse(read('docs/research/BATCH13_CONSOLIDATED_POPULATION.json'));
const exports={};
const compiled=ts.transpileModule(read('lib/guide-attributes.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
vm.runInNewContext(compiled,{exports,URL,Date,Set,Map,require:name=>{if(name==='./guide-evidence-holds.json')return JSON.parse(read('lib/guide-evidence-holds.json'));throw Error(name)}});
const approved=exports.approvedAttributes;
test('every real candidate is pending and rejected by the actual public loader',()=>{
 const known=new Set(bundle.index.map(x=>x.guide_id));
 assert.equal(bundle.attributes.length,332);
 assert.ok(bundle.attributes.every(x=>x.publication_approved===false&&x.editorial_status==='pending'));
 for(const x of bundle.attributes){
  for(const value of [x.guide_id,x.kind,x.value,x.evidence_scope,x.source.url,x.source.source_type,x.source.locator,x.source.reviewed_on]){
   assert.equal(typeof value,'string');assert.ok(value.trim().length>0&&value.length<=256&&!/[\u0000-\u001f\u007f]/.test(value));
  }
  const url=new URL(x.source.url);assert.equal(url.protocol,'https:');assert.equal(url.username,'');assert.equal(url.password,'');
  assert.match(x.source.reviewed_on,/^\d{4}-\d{2}-\d{2}$/);
 }

 assert.equal(approved(bundle.attributes,known).length,0);
 assert.ok(bundle.waters.every(x=>x.publication_approved===false&&x.editorial_status==='pending'));
});
test('each candidate shape passes the actual loader after replacement with entirely synthetic evidence',()=>{
 for(const item of bundle.attributes){
  const relationship=item.relationship&&Object.fromEntries(Object.keys(item.relationship).map(k=>[k,`Synthetic ${k}`]));
  const value=relationship?.[item.kind]??`Synthetic ${item.kind}`;
  const synthetic={guide_id:'OG.0000047',kind:item.kind,value,source:{url:'https://fixture.invalid/synthetic',source_type:item.source.source_type,reviewed_on:'2026-01-01',locator:'Synthetic contract fixture'},evidence_scope:item.evidence_scope,editorial_status:'approved',publication_approved:true};
  if(relationship)synthetic.relationship=relationship;
  assert.equal(approved([synthetic],new Set(['OG.0000047'])).length,1,JSON.stringify({kind:item.kind,scope:item.evidence_scope,type:item.source.source_type,relationship}));
 }
});
test('known held guides and excluded waters cannot appear in the candidate attributes',()=>{
 const held=new Set(bundle.holds.map(x=>x.guide_id));
 assert.ok(bundle.attributes.every(x=>!held.has(x.guide_id)));
 assert.ok(bundle.waters.every(x=>!held.has(x.guide_id)));
 assert.ok(bundle.waters.every(x=>x.guide_id!=='OG.0001116'||x.value!=='Grindstone Lakes'));
});
