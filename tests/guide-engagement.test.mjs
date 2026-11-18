import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
function compile(path,imports,globals={}){const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;const exports={};vm.runInNewContext(code,{exports,require:name=>imports[name]??require(name),...globals});return exports}
function find(node,predicate){if(!node||typeof node!=='object')return;if(predicate(node))return node;for(const child of [node.props?.children].flat(Infinity)){const found=find(child,predicate);if(found)return found}}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const id='10000000-0000-4000-8000-000000000001',claim='20000000-0000-4000-8000-000000000002';

test('mapped profile connects actual returned ratings, own status and review/claim callbacks; sign-out hides them',async()=>{
  let cursor=0,effects=[],listener,hashListener,currentSession={access_token:'token'},submitted,claimed,edited;
  const cells=[],react={
    useState(initial){const i=cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],v=>{cells[i]=typeof v==='function'?v(cells[i]):v}]},
    useRef(initial){const i=cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i]},
    useMemo(fn){const i=cursor++;if(!(i in cells))cells[i]=fn();return cells[i]},
    useCallback(fn){cursor++;return fn},useEffect(fn){cursor++;effects.push(fn)},
  };
  const source={jurisdiction:'OR',sourceId:'OG.0002254'},profilePath='/guides/og-0002254';
  const auth={auth:{getSession:async()=>({data:{session:currentSession}}),onAuthStateChange(fn){listener=fn;return {data:{subscription:{unsubscribe(){}}}}}}};
  const initial={quality:4,intensity:3,wouldBookAgain:false,body:'A firsthand account of this trip. '.repeat(3),firsthand:false,tripMonth:null,relationship:'none',tripResponses:null};
  const api={publicReviews:async()=>({count:1,averageQuality:4,reviews:[{id,quality:4,body:initial.body,publishedAt:'2026-11-17T00:00:00Z',tripDetails:[]}]}),publicReview:async(_s,requested)=>{if(requested!==id)throw Error('unavailable');return {id,quality:4,body:initial.body,publishedAt:'2026-11-17T00:00:00Z',tripDetails:[]}},profileDetails:async()=>null,session:async()=>({authenticated:true,operator:false}),mySubmissions:async()=>[{id,kind:'review',status:'published',jurisdiction:'OR',sourceId:source.sourceId},{id:claim,kind:'claim',status:'approved',jurisdiction:'OR',sourceId:source.sourceId}],submitReview:async(s,d)=>{submitted={s,d};return {id,status:'pending'}},submitClaim:async(s,d)=>{claimed={s,d};return {id:claim,status:'pending'}},reviewDetail:async()=>initial,submitRevision:async(i,d)=>{edited={i,d};return {id,status:'pending'}}};
  function PublishedReviews(){}function ReviewCard(){}function ReviewSubmission(){}function ClaimSubmission(){}function ProfileSharing(){}function AuthPanel(){}
  const browser={location:{hash:''},setTimeout:()=>0,addEventListener(_name,fn){hashListener=fn},removeEventListener(){}};
  const canonical=compile('lib/canonical-share.ts',{});
  const views=compile('components/launch/GuideEngagement.tsx',{react,'@/components/AuthPanel':{__esModule:true,default:AuthPanel,client:auth},'@/lib/launch-client':{createLaunchClient:()=>api},'@/lib/canonical-share':canonical,'./ProfileSharing':{ProfileSharing},'./PublishedReviews':{PublishedReviews,ReviewCard},'./SubmissionViews':{ReviewSubmission,ClaimSubmission}},{window:browser});
  function render(){cursor=0;effects=[];return views.GuideEngagement({source,profilePath,guideName:'Example'})}
  render();for(const effect of effects)effect();await tick();await tick();
  let tree=render(),published=find(tree,n=>n.type===PublishedReviews),sharing=find(tree,n=>n.type===ProfileSharing);
  assert.equal(published.props.state.page.total,1);assert.equal(published.props.state.page.average,4);assert.equal(sharing.props.reviewAvailable,true);
  const review=find(tree,n=>n.type===ReviewSubmission&&n.props.mode!=='revision'),claimForm=find(tree,n=>n.type===ClaimSubmission);
  assert.ok(review);assert.ok(claimForm);assert.equal(review.props.allowTripResponses,true);
  await review.props.onSubmit(initial);await claimForm.props.onSubmit({claimantName:'A Guide',businessName:'',evidence:'a sufficiently long explanation'});
  assert.equal(submitted.s.sourceId,source.sourceId);assert.equal(claimed.s.sourceId,source.sourceId);
  find(tree,n=>n.type==='button'&&n.props.children==='Edit your review').props.onClick();await tick();
  tree=render();const revision=find(tree,n=>n.type===ReviewSubmission&&n.props.mode==='revision');assert.ok(revision);await revision.props.onSubmit(initial);assert.equal(edited.i,id);
  browser.location.hash=`#review-${id}`;hashListener();await tick();tree=render();assert.equal(find(tree,n=>n.type===ReviewCard).props.review.id,id);
  browser.location.hash=`#review-${claim}`;hashListener();await tick();tree=render();assert.equal(find(tree,n=>n.type===ReviewCard),undefined);assert.ok(find(tree,n=>n.props?.children==='The linked review is unavailable.'));
  currentSession=null;listener('SIGNED_OUT',null);tree=render();assert.equal(find(tree,n=>n.type===ReviewSubmission),undefined);assert.equal(find(tree,n=>n.type===ClaimSubmission),undefined);
  api.publicReviews=async()=>{throw Error('unmapped')};render();for(const effect of effects)effect();await tick();await tick();
  tree=render();assert.equal(find(tree,n=>n.type===ProfileSharing).props.reviewAvailable,false);assert.equal(find(tree,n=>n.type===AuthPanel),undefined);
});
