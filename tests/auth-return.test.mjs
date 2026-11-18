import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';

const require=createRequire(import.meta.url),ts=require('typescript');
function compile(path,imports={},globals={}) {
  const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports={};
  vm.runInNewContext(code,{exports,require:name=>imports[name]??require(name),...globals});
  return exports;
}
function find(node,predicate) {
  if(!node||typeof node!=='object') return;
  if(predicate(node)) return node;
  for(const child of [node.props?.children].flat(Infinity)){const result=find(child,predicate);if(result)return result}
}
function setup() {
  const profile='/guides/og-0002254', cells=[];let cursor=0,effect,listener,oauth,otp,replaced;
  const location={origin:'https://preview.example',pathname:profile,search:'?intent=review',hash:'#write-review'};
  const browser={location,history:{state:{existing:true},replaceState(_state,_title,path){replaced=path}},dispatchEvent(){}};
  const auth={getUser:async()=>({data:{user:null}}),onAuthStateChange(fn){listener=fn;return {data:{subscription:{unsubscribe(){}}}}},signInWithOAuth:async arg=>{oauth=arg;return {error:null}},signInWithOtp:async arg=>{otp=arg;return {error:null}},signOut:async()=>{}};
  const react={useState(initial){const i=cursor++;if(!(i in cells))cells[i]=initial;return [cells[i],value=>{cells[i]=value}]},useRef(initial){const i=cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i]},useEffect(fn){effect=fn}};
  const canonical=compile('lib/canonical-share.ts');
  const panel=compile('components/AuthPanel.tsx',{react,'@supabase/supabase-js':{createClient:()=>({auth})},'@/lib/canonical-share':canonical},{window:browser,Event,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'public'}}});
  return {profile,location,get oauth(){return oauth},get otp(){return otp},get replaced(){return replaced},render(){cursor=0;return panel.default({profilePath:profile})},start(){effect()},emit(session){listener('SIGNED_IN',session)}};
}

test('both sign-in methods keep the selected guide and review intent without putting it in the auth fragment',()=>{
  const h=setup(),tree=h.render();
  find(tree,n=>n.type==='button'&&n.props.children==='Continue with Google').props.onClick();
  assert.equal(h.oauth.options.redirectTo,`https://preview.example${h.profile}?intent=review`);
  find(tree,n=>n.type==='input').props.onChange({target:{value:'angler@example.invalid'}});
  const refreshed=h.render();
  find(refreshed,n=>n.type==='button'&&n.props.children==='Email me a sign-in link').props.onClick();
  assert.equal(h.otp.options.emailRedirectTo,`https://preview.example${h.profile}?intent=review`);
});

test('auth callback never overwrites an unconsumed token fragment',()=>{
  const h=setup();h.render();h.start();
  h.location.hash='#access_token=private';h.emit({user:{email:'angler@example.invalid'}});
  assert.equal(h.replaced,undefined);
  h.location.hash='';h.emit({user:{email:'angler@example.invalid'}});
  assert.equal(h.replaced,`${h.profile}?intent=review#write-review`);
});

test('a published review returns to the same review after sign-in',()=>{
  const h=setup(),id='10000000-0000-4000-8000-000000000001';h.location.search='';h.location.hash=`#review-${id}`;
  const tree=h.render();find(tree,n=>n.type==='button'&&n.props.children==='Continue with Google').props.onClick();
  assert.equal(h.oauth.options.redirectTo,`https://preview.example${h.profile}?review=${id}`);
  h.start();h.location.search=`?review=${id}`;h.location.hash='';h.emit({user:{email:'angler@example.invalid'}});
  assert.equal(h.replaced,`${h.profile}#review-${id}`);
});
