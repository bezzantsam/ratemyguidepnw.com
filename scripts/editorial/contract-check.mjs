import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const input=JSON.parse(readFileSync(0,'utf8'));
const exports={};const js=ts.transpileModule(readFileSync('lib/guide-attributes.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
vm.runInNewContext(js,{exports,URL,Date,Set,Map,require:name=>{if(name==='./guide-evidence-holds.json')return JSON.parse(readFileSync('lib/guide-evidence-holds.json','utf8'));throw Error(name)}});
const safe=exports.approvedAttributes(input.attributes,new Set(input.known));
if(safe.length!==input.attributes.length){console.error(`Loader accepts ${safe.length} of ${input.attributes.length} entries`);process.exit(1)}
