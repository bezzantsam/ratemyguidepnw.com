import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';

const require=createRequire(import.meta.url),ts=require('typescript');
function compile(path,imports={},globals={}) {
  const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports={};
  vm.runInNewContext(code,{exports,process:{env:{}},require:name=>imports[name]??require(name),...globals});
  return exports;
}
function find(node,predicate) {
  if(!node||typeof node!=='object') return;
  if(predicate(node)) return node;
  for(const child of [node.props?.children].flat(Infinity)){const result=find(child,predicate);if(result)return result}
}
function setup({moderator=false,authCheck=false,emailOnly=false,otpReply=async()=>({error:null}),storage=new Map()}={}) {
  const profile='/guides/og-0002254', cells=[];let cursor=0,effects=[],listener,oauth,otp,replaced;
  const location={origin:'https://preview.example',pathname:profile,search:'?intent=review',hash:'#write-review'};
  const browser={
    location,history:{state:{existing:true},replaceState(_state,_title,path){replaced=path}},dispatchEvent(){},
    localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
  };
  const auth={getUser:async()=>({data:{user:null}}),onAuthStateChange(fn){listener=fn;return {data:{subscription:{unsubscribe(){}}}}},signInWithOAuth:async arg=>{oauth=arg;return {error:null}},signInWithOtp:async arg=>{otp=arg;return otpReply()},signOut:async()=>{}};
  const react={useState(initial){const i=cursor++;if(!(i in cells))cells[i]=initial;return [cells[i],value=>{cells[i]=value}]},useRef(initial){const i=cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i]},useEffect(fn){effects.push(fn)}};
  const canonical=compile('lib/canonical-share.ts');
  const directory=compile('lib/directory-url.ts',{'./directory-query':{}},{URL,URLSearchParams});
  const context=compile('lib/review-search-return.ts',{'./directory-url':directory},{window:browser,URLSearchParams});
  const panel=compile('components/AuthPanel.tsx',{react,'@supabase/supabase-js':{createClient:()=>({auth})},'@/lib/canonical-share':canonical,'@/lib/review-search-return':context},{window:browser,Event,URLSearchParams,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'public'}}});
  return {profile,location,get oauth(){return oauth},get otp(){return otp},get replaced(){return replaced},render(){cursor=0;effects=[];return panel.default({profilePath:moderator?undefined:profile,moderator,authCheck,emailOnly})},start(){for(const fn of effects)fn()},emit(session){listener('SIGNED_IN',session)}};
}

test('both sign-in methods keep the selected guide and review intent without putting it in the auth fragment',()=>{
  const h=setup(),tree=h.render();
  h.location.search='?returnTo=%2F%3Fq%3DScott&intent=review';
  find(tree,n=>n.type==='button'&&n.props.children==='Continue with Google').props.onClick();
  assert.equal(h.oauth.options.redirectTo,`https://preview.example${h.profile}?intent=review`);
  const email=setup();
  email.location.search=h.location.search;
  find(email.render(),n=>n.type==='input').props.onChange({target:{value:'angler@example.invalid'}});
  const refreshed=email.render();
  find(refreshed,n=>n.type==='button'&&n.props.children==='Email me a sign-in link').props.onClick();
  assert.equal(email.otp.options.emailRedirectTo,`https://preview.example${h.profile}?intent=review`);
});

test('the email return restores a validated rating search locally across same-origin tabs',()=>{
 const storage=new Map(),start=setup({storage,emailOnly:true});
 const target='/write-review?q=Scott+Wolfe&state=Oregon';
 start.location.search='?intent=review&returnTo='+encodeURIComponent(target);
 assert.equal(find(start.render(),n=>n.type==='button'&&n.props.children==='Continue with Google'),undefined);
 find(start.render(),n=>n.type==='input').props.onChange({target:{value:'angler@example.invalid'}});
 find(start.render(),n=>n.type==='button'&&n.props.children==='Email me a sign-in link').props.onClick();
 assert.equal(start.otp.options.emailRedirectTo,`https://preview.example${start.profile}?intent=review`);

 const callback=setup({storage});
 callback.render();callback.start();
 callback.location.pathname='/guides/og-0000359';
 callback.emit({user:{email:'angler@example.invalid'}});
 assert.equal(callback.replaced,undefined);
 callback.location.pathname=callback.profile;
 callback.location.hash='#access_token=private';
 callback.emit({user:{email:'angler@example.invalid'}});
 assert.equal(callback.replaced,undefined);
 callback.location.hash='';
 callback.emit({user:{email:'angler@example.invalid'}});
 assert.equal(callback.replaced,`${start.profile}?intent=review&returnTo=${encodeURIComponent(target)}#write-review`);
 assert.equal(storage.size,0);
});

test('the email return ignores expired or unsafe stored search context',()=>{
 for(const [target,expiresAt] of [
  ['/write-review?q=expired',Date.now()-1],
  ['//outside.example/write-review',Date.now()+1000],
  ['/write-review?state=Oregon&state=Washington',Date.now()+1000],
 ]){
  const storage=new Map(),h=setup({storage});
  storage.set('rmg-review-search:'+h.profile,JSON.stringify({target,expiresAt}));
  h.render();h.start();h.emit({user:{email:'angler@example.invalid'}});
  assert.equal(h.replaced,`${h.profile}?intent=review#write-review`);
  assert.equal(storage.size,0);
 }
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

test('moderator sign-in offers only email and returns to the same origin /admin without creating a user',async()=>{
 const h=setup({moderator:true}),tree=h.render();
 assert.equal(find(tree,n=>n.type==='button'&&n.props.children==='Continue with Google'),undefined);
 h.location.search='?next=/guides';h.location.hash='#write-review';
 find(tree,n=>n.type==='input').props.onChange({target:{value:' moderator@example.invalid '}});
 find(h.render(),n=>n.type==='button'&&n.props.children==='Email me a sign-in link').props.onClick();
 assert.equal(h.otp.email,'moderator@example.invalid');
 assert.equal(h.otp.options.emailRedirectTo,'https://preview.example/admin');
 assert.equal(h.otp.options.shouldCreateUser,false);
 await new Promise(setImmediate);
 assert.ok(find(h.render(),n=>n.props?.children==='Check your email for your Rate Your Guide sign-in link.'));
 h.start();await new Promise(setImmediate);
 h.emit({user:{email:'moderator@example.invalid'}});
 assert.ok(find(h.render(),n=>n.type==='button'&&n.props.children==='Sign out'));
 assert.equal(h.replaced,undefined);
});

test('moderator sign-in shows bounded errors and allows retries after provider or network failures',async()=>{
 for(const otpReply of [async()=>({error:{message:'provider detail'}}),async()=>{throw Error('network detail')}]){
  const h=setup({moderator:true,otpReply});
  h.location.hash='#error_code=otp_expired';
  h.render();h.start();
  assert.ok(find(h.render(),n=>n.props?.children==='This sign-in link could not be used. Request a new link below.'));
  find(h.render(),n=>n.type==='input').props.onChange({target:{value:'moderator@example.invalid'}});
  const send=tree=>find(tree,n=>n.type==='button'&&n.props.children==='Email me a sign-in link');
  send(h.render()).props.onClick();
  await new Promise(setImmediate);
  assert.ok(find(h.render(),n=>n.props?.children==='Couldn’t send a sign-in link. Check your email address and try again.'));
  assert.equal(send(h.render()).props.disabled,false);
 }
});

test('throttled email sign-in gives both roles a recovery path without exposing provider details',async()=>{
 const cases=[
  {moderator:true,error:{status:429}},
  {authCheck:true,error:{status:429}},
  {emailOnly:true,error:{code:'over_email_send_rate_limit'}},
  {emailOnly:true,error:{code:'over_request_rate_limit'}},
 ];
 for(const {error,...role} of cases){
  const h=setup({...role,otpReply:async()=>({error:{...error,message:'Private provider detail'}})});
  find(h.render(),n=>n.type==='input').props.onChange({target:{value:'participant@example.invalid'}});
  find(h.render(),n=>n.type==='button'&&n.props.children==='Email me a sign-in link').props.onClick();
  await new Promise(setImmediate);
  assert.equal(find(h.render(),n=>n.props?.role==='status').props.children,
   'Too many sign-in requests. If an email arrived, open the newest link. Otherwise, wait before requesting another.');
 }
});

test('the sign-in check lets server verification own the status after browser authentication',async()=>{
 const h=setup({authCheck:true});
 h.render();h.start();await new Promise(setImmediate);
 h.emit({user:{email:'participant@example.invalid'}});
 const tree=h.render();
 assert.equal(find(tree,n=>n.props?.children==='Signed in.'),undefined);
 assert.ok(find(tree,n=>n.type==='button'&&n.props.children==='Sign out'));
});

test('legacy and new public hosts keep guide and moderator email callbacks on the initiating host',()=>{
  for(const origin of ['https://ratemyguidepnw.vercel.app','https://rateyourguide.com']){
    for(const moderator of [false,true]){
      const h=setup({moderator});
      h.location.origin=origin;
      find(h.render(),n=>n.type==='input').props.onChange({target:{value:'fixture@example.invalid'}});
      find(h.render(),n=>n.type==='button'&&n.props.children==='Email me a sign-in link').props.onClick();
      assert.equal(h.otp.options.emailRedirectTo,origin+(moderator?'/admin':h.profile+'?intent=review'));
    }
  }
});
