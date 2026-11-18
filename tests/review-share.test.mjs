import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
function compile(path,imports={},globals={}){const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;const exports={};vm.runInNewContext(code,{exports,require:name=>imports[name]??require(name),...globals});return exports}
function find(node,predicate){if(!node||typeof node!=='object')return;if(predicate(node))return node;for(const child of [node.props?.children].flat(Infinity)){const result=find(child,predicate);if(result)return result}}
const id='10000000-0000-4000-8000-000000000001',path='/guides/og-0002254',canonical=compile('lib/canonical-share.ts');
function harness(navigator){let cursor=0;const cells=[],react={useState(initial){const i=cursor++;if(!(i in cells))cells[i]=initial;return [cells[i],v=>{cells[i]=v}]}};const view=compile('components/launch/ReviewShare.tsx',{react,'@/lib/canonical-share':canonical},{navigator,Error}).ReviewShare;return ()=>{cursor=0;return view({profilePath:path,reviewId:id,guideName:'Example'})}}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('published-review share uses its stable canonical destination and does not claim a post',async()=>{
  let shared;const render=harness({share:async value=>{shared=value}});
  find(render(),n=>n.type==='button'&&n.props.children==='Share review').props.onClick();await flush();
  assert.equal(shared.url,`https://ratemyguidepnw.com${path}#review-${id}`);
  assert.doesNotMatch(find(render(),n=>n.props?.role==='status').props.children,/posted|published/i);
});
test('failed review copy exposes a selectable canonical link',async()=>{
  const render=harness({clipboard:{writeText:async()=>{throw Error('denied')}}});
  find(render(),n=>n.type==='button'&&n.props.children==='Copy review link').props.onClick();await flush();
  assert.equal(find(render(),n=>n.type==='input').props.value,`https://ratemyguidepnw.com${path}#review-${id}`);
});
