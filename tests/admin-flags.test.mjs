import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';

const require=createRequire(import.meta.url),ts=require('typescript');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const operator='10000000-0000-4000-8000-000000000001',ordinary='10000000-0000-4000-8000-000000000002';
const id='20000000-0000-4000-8000-000000000001',reviewId='30000000-0000-4000-8000-000000000001';
const flag={id,kind:'report',reviewId,guideName:'Flagged guide',createdAt:'2026-11-20T00:00:00Z',description:'Reported public review text.',canApprove:false};
function find(node,predicate){
 if(!node||typeof node!=='object')return;
 if(predicate(node))return node;
 for(const child of [node.props?.children].flat(Infinity)){const found=find(child,predicate);if(found)return found}
}
function harness({authorized=true,resolveReport}={}){
 let cursor=0,effects=[],listener,currentSession={user:{id:authorized?operator:ordinary},access_token:'synthetic'};
 const cells=[],calls=[],focused=[];
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,i)=>Object.is(value,b[i]));
 const react={
  useState(initial){const i=cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],value=>{cells[i]=typeof value==='function'?value(cells[i]):value}]},
  useRef(initial){const i=cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i]},
  useMemo(fn,deps){const i=cursor++;if(!(i in cells)||!same(cells[i].deps,deps))cells[i]={deps,value:fn()};return cells[i].value},
  useCallback(fn,deps){const i=cursor++;if(!(i in cells)||!same(cells[i].deps,deps))cells[i]={deps,value:fn};return cells[i].value},
  useEffect(fn,deps){const i=cursor++;if(!(i in cells)||!same(cells[i].deps,deps)){const old=cells[i];cells[i]={deps};effects.push(()=>{old?.cleanup?.();cells[i].cleanup=fn()})}},
 };
 const api={
  session:async()=>({authenticated:true,operator:currentSession?.user.id===operator}),
  operatorQueue:async(kind,offset,limit)=>{calls.push({operation:'queue',kind,offset,limit});return kind==='report'?[flag]:[]},
  resolveReport:async(...args)=>{calls.push({operation:'resolve',args});return resolveReport?resolveReport(...args):{id,status:'resolved',reviewId,reviewStatus:'published'}},
 };
 class LaunchClientError extends Error{}
 function AuthPanel(){}function TripProposalQueue(){}
 const imports={react,'@/components/AuthPanel':{__esModule:true,default:AuthPanel,client:{auth:{
  getSession:async()=>({data:{session:currentSession}}),onAuthStateChange(fn){listener=fn;return {data:{subscription:{unsubscribe(){}}}}},
 }}},'@/lib/launch-client':{createLaunchClient:()=>api,LaunchClientError},'./TripProposalQueue':{__esModule:true,default:TripProposalQueue}};
 const exports={},code=ts.transpileModule(readFileSync('components/launch/AdminConsole.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{exports,require:name=>imports[name]??require(name),window:{setTimeout:fn=>setTimeout(fn,0),clearTimeout,location:{reload(){throw Error('Unexpected reload')}}},document:{getElementById:id=>({focus(){focused.push(id)}})}});
 function render(){cursor=0;effects=[];return exports.AdminConsole({})}
 async function settle(){
  for(let pass=0;pass<10;pass++){
   render();const pending=[...effects];for(const effect of pending)effect();
   await new Promise(resolve=>setTimeout(resolve,1));await tick();
   if(!pending.length)return render();
  }
  throw Error('Effects did not settle');
 }
 const button=(tree,label)=>find(tree,node=>node.type==='button'&&node.props.children===label);
 async function switchAccount(account){currentSession=account?{user:{id:account},access_token:'synthetic'}:null;listener(account?'SIGNED_IN':'SIGNED_OUT',currentSession);return settle()}
 return {render,settle,button,calls,focused,switchAccount};
}

test('the authorized admin starts on flags and can keep a review without a publication approval',async()=>{
 const h=harness();let tree=await h.settle();
 assert.equal(find(tree,node=>node.type==='select').props.value,'report');
 assert.ok(find(tree,node=>node.type==='h2'&&node.props.children==='Flagged reviews'));
 assert.equal(h.button(tree,'Approve'),undefined);assert.equal(h.button(tree,'Reject'),undefined);
 h.button(tree,'Keep review and dismiss flag').props.onClick();tree=await h.settle();
 assert.deepEqual(h.calls.filter(call=>call.operation==='resolve'),[{operation:'resolve',args:[id,'','keep']}]);
 assert.ok(find(tree,node=>node.props?.role==='status'&&node.props.children==='Flag dismissed. The review remains published.'));
 assert.equal(h.button(tree,'Remove review'),undefined);
});

test('removing a flagged review requires a note, blocks double actions, and shows the confirmed removal',async()=>{
 let complete;const h=harness({resolveReport:()=>new Promise(resolve=>{complete=resolve})});
 let tree=await h.settle();h.button(tree,'Remove review').props.onClick();tree=h.render();
 assert.equal(h.calls.filter(call=>call.operation==='resolve').length,0);
 assert.ok(find(tree,node=>node.props?.role==='alert'&&node.props.children==='Enter a reason before removing this review.'));
 assert.equal(h.focused.length,1);
 find(tree,node=>node.type==='textarea').props.onChange({target:{value:'Private details in this review require removal.'}});
 tree=h.render();const remove=h.button(tree,'Remove review');remove.props.onClick();remove.props.onClick();
 assert.equal(h.calls.filter(call=>call.operation==='resolve').length,1);
 assert.equal(h.button(h.render(),'Keep review and dismiss flag').props.disabled,true);
 complete({id,status:'resolved',reviewId,reviewStatus:'removed'});tree=await h.settle();
 assert.ok(find(tree,node=>node.props?.role==='status'&&node.props.children==='Review removed from public view. Flag resolved.'));
 assert.equal(h.button(tree,'Remove review'),undefined);
});

test('an unconfirmed flag decision remains locked until the open queue is checked',async()=>{
 let fail=true;const h=harness({resolveReport:async()=>{if(fail)throw Error('Lost receipt');return {id,status:'resolved',reviewId,reviewStatus:'published'}}});
 let tree=await h.settle();h.button(tree,'Keep review and dismiss flag').props.onClick();tree=await h.settle();
 assert.equal(h.button(tree,'Keep review and dismiss flag').props.disabled,true);
 assert.ok(find(tree,node=>node.props?.role==='alert'&&String(node.props.children).includes('could not be confirmed')));
 h.button(tree,'Check pending queue').props.onClick();tree=await h.settle();
 assert.ok(find(tree,node=>node.props?.role==='status'&&node.props.children==='This flag is still open. Review your note before trying again.'));
 fail=false;h.button(tree,'Keep review and dismiss flag').props.onClick();tree=await h.settle();
 assert.equal(h.calls.filter(call=>call.operation==='resolve').length,2);
 assert.ok(find(tree,node=>node.props?.role==='status'&&node.props.children==='Flag dismissed. The review remains published.'));
});

test('ordinary accounts cannot read or act on flags, including a stale button after an account switch',async()=>{
 const h=harness();let tree=await h.settle();const stale=h.button(tree,'Keep review and dismiss flag');
 const previousReads=h.calls.filter(call=>call.operation==='queue').length;
 tree=await h.switchAccount(ordinary);
 stale.props.onClick();await tick();
 assert.equal(h.calls.filter(call=>call.operation==='resolve').length,0);
 assert.equal(h.calls.filter(call=>call.operation==='queue').length,previousReads);
 assert.equal(find(tree,node=>node.type==='article'),undefined);
 assert.ok(find(tree,node=>node.props?.role==='status'&&String(node.props.children).includes('does not have operator access')));
 const denied=harness({authorized:false});await denied.settle();assert.equal(denied.calls.length,0);
});
