import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync('lib/guide-enrichment.ts','utf8');
const data=JSON.parse(readFileSync('lib/guide-enrichment.json','utf8'));
const exports={};
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
vm.runInNewContext(js,{exports,URL,require:name=>{if(name==='./guide-enrichment.json')return data;throw Error(name)}});
const {operatorSourceUrl,guideEnrichmentFor}=exports;
const water=(url,type='operator_site')=>({name:'Example water',sourceUrl:url,sourceType:type});
const record=(waters,links=[])=>({advertisedWaters:waters,sourceLinks:links,searchAliases:[]});

test('reviewed operator water source supplies the actual guide contact URL',()=>{
 assert.equal(operatorSourceUrl(guideEnrichmentFor('OG.0002254')),'https://fishingwithbeck.com/salmon-fishing/');
 assert.equal(operatorSourceUrl(null),null);
});
test('explicit operator links take priority, third party sources never become a primary contact',()=>{
 const sourceLinks=[{sourceType:'third_party_directory',url:'https://directory.example/guide'}, {sourceType:'operator_site',url:'https://operator.example/trips'}];
 assert.equal(operatorSourceUrl(record([water('https://water.example/')],sourceLinks)),'https://operator.example/trips');
 assert.equal(operatorSourceUrl(record([water('https://directory.example/','third_party_directory')])),null);
});
test('reject unsafe or malformed URLs and keep looking for a safe attributed operator page',()=>{
 for(const candidate of ['javascript:alert(1)','http://operator.example/','https://user:pass@example.com/','https://127.0.0.1/admin','https://a.local/','https://a.localhost/','not a URL']){
  assert.equal(operatorSourceUrl(record([water(candidate)])),null,candidate);
 }
 assert.equal(operatorSourceUrl(record([water('javascript:bad'),water('https://safe.example/trips')])),'https://safe.example/trips');
});
