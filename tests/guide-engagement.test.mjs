import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
function compile(path,imports,globals={}){const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;const exports={};vm.runInNewContext(code,{exports,process:{env:{}},require:name=>imports[name]??require(name),...globals});return exports}
function find(node,predicate){if(!node||typeof node!=='object')return;if(predicate(node))return node;for(const child of [node.props?.children].flat(Infinity)){const found=find(child,predicate);if(found)return found}}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const id='10000000-0000-4000-8000-000000000001',claim='20000000-0000-4000-8000-000000000002';

test('Oregon profile connects ratings and review callbacks while held Washington fails closed',async()=>{
  let cursor=0,effects=[],listener,hashListener,currentSession={access_token:'token',user:{id}},submitted,edited;
  let sessionChecks=0,ownLookups=0;const clearedDrafts=[],clearedAccounts=[];
  const cells=[],react={
    useState(initial){const i=cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],v=>{cells[i]=typeof v==='function'?v(cells[i]):v}]},
    useRef(initial){const i=cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i]},
    useMemo(fn){const i=cursor++;if(!(i in cells))cells[i]=fn();return cells[i]},
    useCallback(fn){cursor++;return fn},useEffect(fn){cursor++;effects.push(fn)},
  };
  const source={jurisdiction:'OR',sourceId:'OG.0002254'},profilePath='/guides/og-0002254';
  const auth={auth:{getSession:async()=>({data:{session:currentSession}}),onAuthStateChange(fn){listener=fn;return {data:{subscription:{unsubscribe(){}}}}}}};
  const initial={quality:4,intensity:3,wouldBookAgain:false,body:'A firsthand account of this trip. '.repeat(3),firsthand:false,tripMonth:null,relationship:'none',tripResponses:null};
  const api={reviewWriteAvailability:async()=>true,ownReviewForGuide:async()=>{ownLookups++;return {id,status:'published'}},publicReviews:async()=>({count:1,averageQuality:4,reviews:[{id,quality:4,body:initial.body,publishedAt:'2026-11-17T00:00:00Z',tripDetails:[]}]}),publicReview:async(_s,requested)=>{if(requested!==id)throw Error('unavailable');return {id,quality:4,body:initial.body,publishedAt:'2026-11-17T00:00:00Z',tripDetails:[]}},profileDetails:async()=>null,session:async()=>{sessionChecks++;return {authenticated:true,operator:false}},mySubmissions:async()=>[{id,kind:'review',status:'published',jurisdiction:'OR',sourceId:source.sourceId,identities:[source]},{id:claim,kind:'claim',status:'approved',jurisdiction:'WA',sourceId:'wa-123',identities:[{jurisdiction:'WA',sourceId:'wa-123'},source]}],submitReview:async(s,d)=>{submitted={s,d};return {id,status:'pending'}},reviewDetail:async()=>initial,submitRevision:async(i,d)=>{edited={i,d};return {id,status:'pending'}}};
  function PublishedReviews(){}function ReviewCard(){}function ReviewSubmission(){}function ClaimSubmission(){}function ProfileSharing(){}function AuthPanel(){}
  const browser={location:{hash:''},setTimeout:()=>0,clearTimeout(){},addEventListener(_name,fn){hashListener=fn},removeEventListener(){}};
  const canonical=compile('lib/canonical-share.ts',{});
  const {validReviewPage}=compile('components/launch/PublishedReviews.tsx',{'./submission-model':compile('components/launch/submission-model.ts'),'./ReviewShare':{},'./ReportReview':{}});
  function ReturnToResults(){}
  const returnToResults={'@/components/ReturnToResults':{__esModule:true,default:ReturnToResults}};
  const washingtonStatus=compile('components/launch/WashingtonReviewStatus.tsx',returnToResults);
  const views=compile('components/launch/GuideEngagement.tsx',{...returnToResults,react,'@/components/AuthPanel':{__esModule:true,default:AuthPanel,client:auth},'@/lib/launch-client':{createLaunchClient:()=>api},'@/lib/canonical-share':canonical,'./ProfileSharing':{ProfileSharing},'./WashingtonReviewStatus':washingtonStatus,'./PublishedReviews':{PublishedReviews,ReviewCard,validReviewPage},'./SubmissionViews':{ReviewSubmission,ClaimSubmission},'./review-draft-storage':{clearReviewDraft:(scope,mode)=>clearedDrafts.push({scope,mode}),clearReviewDraftsForAccount:account=>clearedAccounts.push(account)}},{window:browser});
  function render(compactProfile=false){cursor=0;effects=[];return views.GuideEngagement({source,profilePath,guideName:'Example',compactProfile})}
  async function reauthenticate(){
    const next=currentSession??{access_token:'token',user:{id}};
    currentSession=null;listener('SIGNED_OUT',null);
    currentSession=next;listener('SIGNED_IN',next);
    // The harness does not run browser timers; invoke AuthPanel's deferred callback.
    find(render(),node=>node.type===AuthPanel).props.onSignedIn();
    await tick();await tick();
  }
  render();for(const effect of effects)effect();await tick();await tick();
  let tree=render(),published=find(tree,n=>n.type===PublishedReviews),sharing=find(tree,n=>n.type===ProfileSharing);
  assert.equal(published.props.state.page.total,1);assert.equal(published.props.state.page.average,4);assert.equal(sharing.props.reviewAvailable,true);
  const compact=render(true);
  const rating=find(compact,n=>n.type==='a'&&n.props.href==='#reviews');
  assert.equal(rating.props.children[0].props.children.join(''),'4.0 / 5');
  assert.equal(rating.props.children[2],1);
  assert.equal(find(compact,n=>n.type===ProfileSharing).props.primaryAction.props.href,'#your-submissions');
  assert.equal(find(compact,n=>n.type===PublishedReviews).props.inviteFirst,false);
  assert.equal(find(tree,n=>n.type===ReviewSubmission&&n.props.mode!=='revision'),undefined,'existing author is not invited to submit again');
  assert.equal(find(tree,n=>typeof n.props?.children==='string'&&n.props.children.startsWith('Sign in to share')),undefined,'signed-in account is not told to sign in');
  const reviewOnly=render();
  assert.equal(find(reviewOnly,n=>n.type===ClaimSubmission),undefined);
  assert.equal(find(reviewOnly,n=>typeof n.type==='function'&&n.type.name==='OwnerEditor'),undefined);
  assert.ok(find(reviewOnly,n=>n.type==='button'&&n.props.children==='Edit your review'));
  assert.equal(find(reviewOnly,n=>n.type===ProfileSharing).props.reviewAvailable,true);
  find(tree,n=>n.type==='button'&&n.props.children==='Edit your review').props.onClick();await tick();
  tree=render();const revision=find(tree,n=>n.type===ReviewSubmission&&n.props.mode==='revision');assert.ok(revision);
  assert.equal(revision.props.draftScope.accountId,id);assert.equal(revision.props.draftScope.sourceId,source.sourceId);assert.equal(revision.props.draftScope.reviewId,id);
  const checksBefore=sessionChecks,lookupsBefore=ownLookups;
  listener('SIGNED_IN',currentSession);listener('TOKEN_REFRESHED',currentSession);
  find(tree,n=>n.type===AuthPanel).props.onSignedIn();await tick();await tick();
  tree=render();
  assert.equal(find(tree,n=>n.type===ReviewSubmission&&n.props.mode==='revision').props.initial,initial,'same-account refocus keeps the active revision mounted');
  assert.equal(sessionChecks,checksBefore,'same-account callbacks do not recheck accepted sessions');
  assert.equal(ownLookups,lookupsBefore,'same-account callbacks do not temporarily hide the form');
  await revision.props.onSubmit(initial);assert.equal(edited.i,id);
  assert.ok(clearedDrafts.some(item=>item.mode==='revision'&&item.scope.reviewId===id),'confirmed revision clears only its scoped draft');
  api.mySubmissions=async()=>[];api.ownReviewForGuide=async()=>null;await reauthenticate();tree=render();
  const review=find(tree,n=>n.type===ReviewSubmission&&n.props.mode!=='revision');assert.ok(review);assert.equal(review.props.allowTripResponses,true);assert.equal(review.props.draftScope.accountId,id);assert.equal(review.props.draftScope.sourceId,source.sourceId);await review.props.onSubmit(initial);assert.equal(submitted.s.sourceId,source.sourceId);
  api.ownReviewForGuide=async()=>{throw Error('offline')};await reauthenticate();tree=render();
  assert.equal(find(tree,n=>n.type===ReviewSubmission&&n.props.mode!=='revision'),undefined,'unknown status cannot imply no prior review');
  api.ownReviewForGuide=async()=>null;api.mySubmissions=async()=>Array.from({length:50},(_,i)=>({id:String(i),kind:'claim',status:'pending',identities:[{jurisdiction:'WA',sourceId:'wa-other'}]}));await reauthenticate();tree=render();
  assert.ok(find(tree,n=>n.type===ReviewSubmission&&n.props.mode!=='revision'),'guide-specific lookup establishes no prior review despite pagination');assert.ok(find(tree,n=>n.type==='button'&&n.props.children==='Load more submissions'));
  browser.location.hash=`#review-${id}`;hashListener();await tick();tree=render();assert.equal(find(tree,n=>n.type===ReviewCard).props.review.id,id);
  browser.location.hash=`#review-${claim}`;hashListener();await tick();tree=render();assert.equal(find(tree,n=>n.type===ReviewCard),undefined);assert.ok(find(tree,n=>n.props?.children==='The linked review is unavailable.'));
  currentSession=null;listener('SIGNED_OUT',null);tree=render();assert.ok(clearedAccounts.includes(id),'explicit sign-out clears account drafts');assert.equal(find(tree,n=>n.type===ReviewSubmission),undefined);assert.equal(find(tree,n=>n.type===ClaimSubmission),undefined);
  api.publicReviews=async()=>{throw Error('unmapped')};render();for(const effect of effects)effect();await tick();await tick();
  const failed=render(true);
  assert.equal(find(failed,n=>n.type==='a'&&n.props.href==='#reviews'),undefined);
  assert.equal(find(failed,n=>n.type===ProfileSharing).props.primaryAction.props.disabled,true);
  assert.ok(find(failed,n=>n.type==='button'&&n.props.children==='Retry'));
  tree=render();assert.equal(find(tree,n=>n.type===ProfileSharing).props.reviewAvailable,false);assert.equal(find(tree,n=>n.type===AuthPanel),undefined);

  cells.length=0;listener=undefined;hashListener=undefined;
  currentSession={access_token:'token',user:{id}};
  const heldSource={jurisdiction:'WA',sourceId:'wa-999'},heldCalls=[];
  for(const name of Object.keys(api))api[name]=async requested=>{
    heldCalls.push([name,requested?.jurisdiction,requested?.sourceId]);
    return false;
  };
  const renderHeld=()=>{
    cursor=0;effects=[];
    return views.GuideEngagement({source:heldSource,profilePath:'/washington/wa-999',guideName:'Held example',compactProfile:true});
  };
  renderHeld();for(const effect of effects)effect();await tick();
  const held=renderHeld();
  const status=find(held,n=>n.type===washingtonStatus.WashingtonReviewStatus);
  assert.ok(status);
  assert.equal(status.props.status,'held');
  const statusSection=status.type(status.props);
  assert.equal(statusSection.props.id,'write-review');
  assert.equal(find(statusSection,n=>n.type===ReturnToResults).props.fallback,'/write-review');
  assert.equal(find(statusSection,n=>n.props?.role==='status').props.children,'Reviews are unavailable for this guide right now.');
  assert.equal(find(held,n=>[AuthPanel,ReviewSubmission,PublishedReviews].includes(n.type)),undefined);
  assert.equal(listener,undefined);
  assert.equal(hashListener,undefined);
  assert.deepEqual(heldCalls,[['reviewWriteAvailability','WA','wa-999']]);
});
