import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
function compile(path,imports={}) {
  const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports={};vm.runInNewContext(code,{exports,require:name=>imports[name]??require(name)});return exports;
}
const model=compile('components/launch/trip-responses.ts');
function plain(value){return JSON.parse(JSON.stringify(value))}
function find(node,predicate){if(!node||typeof node!=='object')return;if(predicate(node))return node;for(const child of [node.props?.children].flat(Infinity)){const found=find(child,predicate);if(found)return found}}

test('unanswered, not applicable, false and zero remain distinct',()=>{
  assert.equal(model.encodeTripResponses({}).value,null);
  const result=model.encodeTripResponses({teaching_requested:'value:no',children_present:'na',actual_duration_minutes:'value:0',conversation_preference:'value:quiet'});
  assert.equal(result.error,null);
  assert.deepEqual(plain(result.value),{version:1,answers:{teaching_requested:{state:'answered',value:false},children_present:{state:'not_applicable'},actual_duration_minutes:{state:'answered',value:0},conversation_preference:{state:'answered',value:'quiet'}}});
  assert.equal(Object.hasOwn(result.value.answers,'guide_patience'),false);
});

test('unknown, incomplete and out-of-range answers fail rather than being dropped',()=>{
  for(const draft of [{invented:'value:x'},{effort:'value:0'},{actual_duration_minutes:'value:'},{actual_duration_minutes:'value:1441'},{dog_present:'value:maybe'},{setting:'value:mountain'}]) assert.ok(model.encodeTripResponses(draft).error);
});

test('editing round trips recognized answers and rejects unknown or malformed versions',()=>{
  const original={version:1,answers:{dog_present:{state:'answered',value:false},children_present:{state:'not_applicable'},actual_duration_minutes:{state:'answered',value:0}}};
  const decoded=model.decodeTripResponses(original);
  assert.deepEqual(plain(model.encodeTripResponses(decoded).value),original);
  assert.equal(model.decodeTripResponses({version:2,answers:{}}),null);
  assert.equal(model.decodeTripResponses({version:1,answers:{new_field:{state:'answered',value:'x'}}}),null);
  assert.equal(model.decodeTripResponses({version:1,answers:{dog_present:{state:'not_applicable',value:false}}}),null);
});

test('optional controls start unanswered and never collect names or free text',()=>{
  const views=compile('components/launch/TripDetails.tsx',{react:{useId:()=>':test:'},'./trip-responses':model});
  let draft={};const render=()=>views.TripDetails({draft,onChange:value=>{draft=value}});
  let tree=render();assert.equal(tree.type,'details');
  const dog=find(tree,n=>n.type==='select'&&n.props.id.endsWith('-dog_present'));
  assert.equal(dog.props.value,'');dog.props.onChange({target:{value:'value:no'}});
  tree=render();const duration=find(tree,n=>n.type==='select'&&n.props.id.endsWith('-actual_duration_minutes'));
  duration.props.onChange({target:{value:'value'}});
  assert.ok(model.encodeTripResponses(draft).error);
  tree=render();find(tree,n=>n.type==='input'&&n.props.id.endsWith('-actual_duration_minutes-minutes')).props.onChange({target:{value:'0'}});
  assert.equal(model.encodeTripResponses(draft).value.answers.dog_present.value,false);
  assert.equal(model.encodeTripResponses(draft).value.answers.actual_duration_minutes.value,0);
  assert.equal(find(render(),n=>n.type==='textarea'),undefined);
});
