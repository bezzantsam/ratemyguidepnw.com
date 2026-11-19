import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function find(node,predicate){if(!node||typeof node!=='object')return;if(predicate(node))return node;for(const child of [node.props?.children].flat(Infinity)){const found=find(child,predicate);if(found)return found}}
function harness(onReport){
  let cursor=0;const cells=[];
  const react={useId:()=>':report:',useRef(initial){const i=cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i]},useState(initial){const i=cursor++;if(!(i in cells))cells[i]=initial;return [cells[i],value=>{cells[i]=typeof value==='function'?value(cells[i]):value}]}};
  const code=ts.transpileModule(readFileSync('components/launch/ReportReview.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports={};vm.runInNewContext(code,{exports,require:name=>name==='react'?react:require(name)});
  const render=()=>{cursor=0;return exports.ReportReview({onReport})};
  return {render};
}
test('report confirms only a persisted receipt and retains duplicate semantics',async()=>{
  let received;const h=harness(async reason=>{received=reason;return {id:'report',status:'submitted',existing:false}});
  find(h.render(),n=>n.type==='button'&&n.props.children==='Report review').props.onClick();
  find(h.render(),n=>n.type==='select').props.onChange({target:{value:'other'}});
  await find(h.render(),n=>n.type==='form').props.onSubmit({preventDefault(){}});
  assert.equal(received,'other');assert.equal(find(h.render(),n=>n.props?.role==='status').props.children,'Report sent. We’ll review it.');
  const prior=harness(async()=>({id:'report',status:'submitted',existing:true}));
  find(prior.render(),n=>n.type==='button').props.onClick();find(prior.render(),n=>n.type==='select').props.onChange({target:{value:'other'}});await find(prior.render(),n=>n.type==='form').props.onSubmit({preventDefault(){}});
  assert.match(find(prior.render(),n=>n.props?.role==='status').props.children,/already reported/);
});
test('report failure keeps the form and never claims success',async()=>{
  const h=harness(async()=>{throw Error('offline')});find(h.render(),n=>n.type==='button').props.onClick();find(h.render(),n=>n.type==='select').props.onChange({target:{value:'not_firsthand'}});await find(h.render(),n=>n.type==='form').props.onSubmit({preventDefault(){}});
  assert.ok(find(h.render(),n=>n.type==='form'));assert.match(find(h.render(),n=>n.props?.role==='status').props.children,/Couldn’t send/);
});
