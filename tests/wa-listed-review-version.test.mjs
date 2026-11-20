import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

test('server listing version matches the offline intake for all stable Washington listings',()=>{
  const modules=new Map();
  function load(path){
    if(path.endsWith('.json'))return JSON.parse(readFileSync(path,'utf8'));
    if(modules.has(path))return modules.get(path);
    const exports={};
    modules.set(path,exports);
    const js=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{
      module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true,
    }}).outputText;
    vm.runInNewContext(js,{exports,URL,require:name=>name==='node:crypto'?{createHash}:
      load(resolve(dirname(path),name+(name.endsWith('.json')?'':'.ts')))});
    return exports;
  }
  const server=load(resolve('lib/wa-listed-review-version.ts'));
  const python=spawnSync('python3',['-c',[
    'import json',
    'from scripts.wa_listed_review_intake import REPO,version',
    'raw=json.loads((REPO/"lib/washington-raw.json").read_text())',
    'ids=json.loads((REPO/"lib/washington-stable-ids.json").read_text())',
    'print(json.dumps({i:version(i,raw,ids)["listing_sha256"] for i in ids.values()}))',
  ].join('\n')],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  assert.equal(python.status,0,python.stderr);
  const versions=Object.entries(JSON.parse(python.stdout));
  assert.equal(versions.length,158);
  for(const [id,expected] of versions)assert.equal(server.washingtonListedReviewVersion(id),expected,id);
  assert.equal(server.washingtonListedReviewVersion('wa-900001'),undefined);
});
