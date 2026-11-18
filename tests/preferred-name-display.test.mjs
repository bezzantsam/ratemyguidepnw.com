import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports});return exports}
const {preferredDisplayName,applyPreferredNames,loadPreferredNames}=load('lib/preferred-name.ts');
const {guideSearchScore}=load('lib/directory-query.ts');
test('preferred display is a reversible overlay on the same source record',()=>{
 const source={id:'OG.0000359',name:'Douglas Wolfe',business:'Douglas Scott Wolfe LLC',states:['Oregon'],areas:['Coos-Coquille'],advertisedWaters:[],searchAliases:['Scott Wolfe'],href:'/guides/og-0000359',source:'Oregon registry'};
 assert.equal(preferredDisplayName(source.name,'Scott'),'Douglas “Scott” Wolfe');
 assert.equal(preferredDisplayName(source.name,'Scott Wolfe'),'Scott Wolfe');
 assert.equal(preferredDisplayName(source.name,null),source.name);
 assert.equal(guideSearchScore(source,'李明'),null);
 const [updated]=applyPreferredNames([source],[{jurisdiction:'OR',sourceId:source.id,name:'李明',provenance:'captain'}]);
 assert.notEqual(updated,source);assert.equal(updated.name,source.name);assert.equal(updated.id,source.id);assert.equal(updated.href,source.href);
 assert.notEqual(guideSearchScore(updated,'李明'),null);assert.equal(guideSearchScore(source,'李明'),null);
 assert.ok(updated.searchAliases.includes('Scott Wolfe'));
});
test('complete directory name projection uses bounded jurisdiction batches and stops on initial failure',async()=>{
 const entries=[...Array.from({length:205},(_,i)=>({id:`OG.${i}`,name:'A',searchAliases:[]})),...Array.from({length:101},(_,i)=>({id:`wa-${i}`,name:'B',searchAliases:[]}))];
 const calls=[];await loadPreferredNames(entries,async(jurisdiction,ids)=>{calls.push({jurisdiction,ids});return []});
 assert.equal(calls.length,5);assert.ok(calls.every(call=>call.ids.length<=100));assert.equal(calls.reduce((n,call)=>n+call.ids.length,0),306);
 let failedCalls=0;await assert.rejects(loadPreferredNames(entries,async()=>{failedCalls++;throw Error('unavailable')}));assert.equal(failedCalls,1);
});
