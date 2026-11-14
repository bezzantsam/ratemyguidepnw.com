import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const rows=JSON.parse(readFileSync('lib/washington-raw.json','utf8'));
const allocations=JSON.parse(readFileSync('lib/washington-stable-ids.json','utf8'));
const excluded=new Set(['tony fisher','shane magnuson','casey weigel','marc bush','nicholas ney','daniel benowitz','jeffrey keightley sr.']);
const source=readFileSync('lib/washington.ts','utf8');
const compiled=ts.transpileModule(source,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true,resolveJsonModule:true}
}).outputText;

function load(assigned=allocations){
 const module={exports:{}};
 const require=path=>{
  if(path==='./washington-raw.json')return rows;
  if(path==='./washington-stable-ids.json')return assigned;
  if(path==='./washington-reconciled')return {reconciledWashingtonCaptains:[]};
  throw new Error('unexpected import '+path);
 };
 vm.runInNewContext(compiled,{module,exports:module.exports,require,Set,Error});
 return module.exports;
}

test('all preexisting WA guide URLs exactly match the old source-order IDs',()=>{
 const guides=load().washingtonGuides;
 const formerlyListed=rows.filter(row=>!excluded.has(row.name.toLowerCase()));
 assert.equal(formerlyListed.length,158);
 assert.equal(guides.length,formerlyListed.length);
 for(let i=0;i<formerlyListed.length;i++){
  assert.equal(guides[i].id,'wa-'+String(i).padStart(3,'0'));
  assert.equal(guides[i].name,formerlyListed[i].name);
  assert.equal(guides[i].business,formerlyListed[i].business);
 }
});

test('reordering and adding excluded cross-state sources never shifts known public URLs',()=>{
 const api=load();
 const original=Object.fromEntries(api.washingtonGuides.map(row=>[api.washingtonSourceKey(row),row.id]));
 const after=api.mapWashingtonGuides([...rows].reverse());
 const reordered=Object.fromEntries(after.map(row=>[api.washingtonSourceKey(row),row.id]));
 assert.deepEqual(reordered,original);
 const excludedSource={name:'Tony Fisher',business:'Different Import',source:'WDFW',notes:null};
 assert.equal(api.mapWashingtonGuides([excludedSource,...rows]).length,158);
});

test('new source identities must receive explicit reviewed ID before import',()=>{
 const api=load();
 assert.throws(()=>api.mapWashingtonGuides([...rows,{
  name:'New Captain',business:'New Outfit',source:'Unreviewed',notes:null
 }]),/needs a reviewed stable ID assignment/);
});

test('duplicate source identities never produce a public link',()=>{
 const api=load();
 const known=rows.find(row=>!excluded.has(row.name.toLowerCase()));
 assert.throws(()=>api.mapWashingtonGuides([...rows,known]),/Duplicate Washington source identity key/);
});

test('two distinct sources cannot share one public profile ID',()=>{
 const keys=Object.keys(allocations);
 const altered={...allocations,[keys[1]]:allocations[keys[0]]};
 assert.throws(()=>load(altered),/Washington public guide ID assigned twice/);
});

test('map covers every included imported source exactly once',()=>{
 const api=load();
 const ids=new Set();
 for(const row of api.washingtonGuides){
  const key=api.washingtonSourceKey(row);
  assert.equal(allocations[key],row.id);
  assert.equal(ids.has(row.id),false);
  ids.add(row.id);
 }
 assert.equal(ids.size,158);
});
