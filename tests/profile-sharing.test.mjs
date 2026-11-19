import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
function compile(path,imports={},globals={}) {
  const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports={};vm.runInNewContext(code,{exports,require:name=>imports[name]??require(name),...globals});return exports;
}
const canonical=compile('lib/canonical-share.ts');
function harness(navigator,reviewAvailable=false,extra={}) {
  const cells=[];let cursor=0;
  const react={useState(initial){const index=cursor++;if(!(index in cells))cells[index]=initial;return [cells[index],value=>{cells[index]=value}]}};
  const component=compile('components/launch/ProfileSharing.tsx',{react,'@/lib/canonical-share':canonical,...extra.imports},{navigator,...extra.globals}).ProfileSharing;
  return ()=>{cursor=0;return component({profilePath:'/guides/og-0002254',guideName:'Example Guide',reviewAvailable})};
}
function find(element,predicate) {
  if(!element||typeof element!=='object')return;
  if(predicate(element))return element;
  for(const child of [element.props?.children].flat(Infinity)){const result=find(child,predicate);if(result)return result}
}
function button(tree,text){return find(tree,node=>node.type==='button'&&node.props.children===text)}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('native sharing uses the canonical profile, and makes no post-publication claim',async()=>{
  let shared;
  const render=harness({share:async data=>{shared=data}});
  button(render(),'Share profile').props.onClick();await flush();
  assert.equal(shared.url,'https://ratemyguidepnw.vercel.app/guides/og-0002254');
  assert.match(find(render(),node=>node.props?.role==='status').props.children,/dialog closed/i);
  assert.doesNotMatch(find(render(),node=>node.props?.role==='status').props.children,/published|posted/i);
  assert.equal(button(render(),'Copy review request link'),undefined);
});

test('copy fallback exposes the canonical link when clipboard access is denied',async()=>{
  const render=harness({clipboard:{writeText:async()=>{throw new Error('denied')}}});
  button(render(),'Copy profile link').props.onClick();await flush();
  const field=find(render(),node=>node.type==='input'&&node.props.readOnly);
  assert.equal(field.props.value,'https://ratemyguidepnw.vercel.app/guides/og-0002254');
});

test('when native sharing is unavailable the share action copies the profile link',async()=>{
  let copied;
  const render=harness({clipboard:{writeText:async value=>{copied=value}}});
  button(render(),'Share profile').props.onClick();await flush();
  assert.equal(copied,'https://ratemyguidepnw.vercel.app/guides/og-0002254');
  assert.match(find(render(),node=>node.props?.role==='status').props.children,/Link copied/);
});

test('review request actions appear only when enabled and copy the direct canonical intent',async()=>{
  let copied;
  const render=harness({clipboard:{writeText:async value=>{copied=value}}},true);
  button(render(),'Copy review request link').props.onClick();await flush();
  assert.equal(copied,'https://ratemyguidepnw.vercel.app/guides/og-0002254?intent=review#write-review');
  assert.ok(button(render(),'Download review request QR code'));
});

test('native share cancellation is silent and does not copy a link',async()=>{
  let copied=false;const cancelled=new Error('cancelled');cancelled.name='AbortError';
  const render=harness({share:async()=>{throw cancelled},clipboard:{writeText:async()=>{copied=true}}},false,{globals:{Error}});
  button(render(),'Share profile').props.onClick();await flush();
  assert.equal(copied,false);
  assert.equal(find(render(),node=>node.props?.role==='status').props.children,'');
});

test('QR download prepares a local SVG for the same guide and revokes the object URL',async()=>{
  let path,blob,clicked=false,revoked;
  const anchor={click(){clicked=true},remove(){},set href(value){this.link=value},set download(value){this.filename=value}};
  const globals={Blob,URL:{createObjectURL(value){blob=value;return 'blob:local'},revokeObjectURL(value){revoked=value}},
    document:{createElement:()=>anchor,body:{appendChild(){}}},window:{setTimeout:callback=>callback()}};
  const render=harness({},true,{globals,imports:{'@/lib/review-qr':{reviewRequestQrSvg:value=>{path=value;return '<svg/>'}}}});
  button(render(),'Download review request QR code').props.onClick();await flush();
  assert.equal(path,'/guides/og-0002254');assert.equal(await blob.text(),'<svg/>');
  assert.equal(anchor.filename,'review-request-qr.svg');assert.equal(clicked,true);assert.equal(revoked,'blob:local');
});
